import { createHmac } from "crypto";
import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import AppError from "../errors/AppError";
import normalizeWebChatAudio from "../helpers/NormalizeWebChatAudio";
import saveMediaToFile from "../helpers/saveMediaFile";
import {
  assertAllowedWebChatMedia,
  getSafeWebChatOriginalName,
  getWebChatMediaDataJson,
  getWebChatMediaType,
  getWebChatStoredName
} from "../helpers/WebChatMedia";
import { getIO } from "../libs/socket";
import Contact from "../models/Contact";
import ContactCustomField from "../models/ContactCustomField";
import Message from "../models/Message";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import FindOrCreateATicketTrakingService from "../services/TicketServices/FindOrCreateATicketTrakingService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { incrementCounter } from "../services/CounterServices/IncrementCounter";
import { runWebChatAutomation } from "../services/WebChatServices/WebChatAutomationService";
import CreateZammadTicketService from "../services/ZammadServices/CreateZammadTicketService";

type RateBucket = {
  count: number;
  resetAt: number;
};

type StartBody = {
  profile?: unknown;
  name?: unknown;
  phone?: unknown;
  vehicle?: unknown;
  subject?: unknown;
  email?: unknown;
  document?: unknown;
  newCustomer?: unknown;
  message?: unknown;
};

type MessageBody = {
  message?: unknown;
};

type ZammadTicketBody = {
  title?: unknown;
  summary?: unknown;
};

const requestBuckets = new Map<string, RateBucket>();
const sessionBuckets = new Map<string, RateBucket>();

const originCompanyMap = (): Record<string, number> => {
  const raw = process.env.WEBCHAT_ORIGIN_COMPANY_MAP?.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed).reduce<Record<string, number>>(
      (result, [origin, value]) => {
        const companyId = Number(value);
        if (
          /^https:\/\/[^/]+$/i.test(origin) &&
          Number.isInteger(companyId) &&
          companyId > 0
        ) {
          result[origin] = companyId;
        }
        return result;
      },
      {}
    );
  } catch {
    throw new AppError("Atendimento online indisponível", 503);
  }
};

const getCompanyId = (req: Request): number => {
  const origin = req.get("origin") || "";
  const companyMap = originCompanyMap();
  const hasCompanyMap = Object.keys(companyMap).length > 0;
  const companyId = hasCompanyMap
    ? companyMap[origin]
    : Number(process.env.WEBCHAT_COMPANY_ID || "1");

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new AppError("Empresa do atendimento não configurada", 503);
  }

  return companyId;
};

const getSecret = (): string => {
  const secret = process.env.WEBCHAT_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new AppError("Atendimento online indisponível", 503);
  }

  return secret;
};

const getProxySecret = (): string =>
  process.env.WEBCHAT_PROXY_SECRET?.trim() || "";

const allowedOrigins = (): string[] =>
  Array.from(
    new Set([
      ...(process.env.WEBCHAT_ALLOWED_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean),
      ...Object.keys(originCompanyMap())
    ])
  );

const assertAllowedOrigin = (req: Request): void => {
  const origin = req.get("origin");

  if (!origin || !allowedOrigins().includes(origin)) {
    throw new AppError("Origem não permitida", 403);
  }
};

const assertTrustedProxy = (req: Request): void => {
  const secret = getProxySecret();
  if (!secret) return;

  const timestamp = req.get("x-webchat-proxy-timestamp") || "";
  const signature = req.get("x-webchat-proxy-signature") || "";
  const origin = req.get("x-webchat-origin") || "";
  const timestampMs = Number(timestamp);

  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 60_000 ||
    !origin ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    throw new AppError("Origem do atendimento invÃ¡lida", 401);
  }

  const payload = [timestamp, req.method.toUpperCase(), req.path, origin].join(
    "\n"
  );
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  let difference = signature.length === expected.length ? 0 : 1;
  for (let index = 0; index < Math.min(signature.length, expected.length); index += 1) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  if (difference !== 0) {
    throw new AppError("Origem do atendimento invÃ¡lida", 401);
  }
};

const requestKey = (req: Request, suffix: string): string =>
  `${
    req.get("x-webchat-client-ip") ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  }:${suffix}`;

const assertRateLimit = (
  req: Request,
  buckets: Map<string, RateBucket>,
  suffix: string,
  maxRequests: number,
  windowMs: number
): void => {
  const key = requestKey(req, suffix);
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  current.count += 1;
  if (current.count > maxRequests) {
    throw new AppError("Muitas tentativas. Aguarde um momento.", 429);
  }
};

const cleanText = (
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number
): string => {
  if (typeof value !== "string") {
    throw new AppError(`${field} inválido`, 400);
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    throw new AppError(`${field} inválido`, 400);
  }

  return cleaned;
};

const cleanEmail = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "";
  const email = cleanText(value, "E-mail", 5, 160).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("E-mail inválido", 400);
  }

  return email;
};

const cleanOptionalText = (
  value: unknown,
  field: string,
  maxLength: number
): string => {
  if (value === undefined || value === null || value === "") return "";
  return cleanText(value, field, 1, maxLength);
};

const cleanPhone = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new AppError("Informe um telefone válido com DDD", 400);
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) {
    throw new AppError("Informe um telefone válido com DDD", 400);
  }
  return digits;
};

const formatPhone = (value: string): string =>
  value.length === 11
    ? value.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
    : value.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");

const hasRepeatedDigits = (value: string): boolean =>
  /^(\d)\1+$/.test(value);

const isValidCpf = (value: string): boolean => {
  if (value.length !== 11 || hasRepeatedDigits(value)) return false;

  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(value[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateDigit(9) === Number(value[9]) &&
    calculateDigit(10) === Number(value[10])
  );
};

const isValidCnpj = (value: string): boolean => {
  if (value.length !== 14 || hasRepeatedDigits(value)) return false;

  const calculateDigit = (baseLength: number): number => {
    const weights =
      baseLength === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = value
      .slice(0, baseLength)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return (
    calculateDigit(12) === Number(value[12]) &&
    calculateDigit(13) === Number(value[13])
  );
};

const cleanDocument = (value: unknown, newCustomer: boolean): string => {
  if (newCustomer) return "";
  if (typeof value !== "string") {
    throw new AppError("Informe um CPF ou CNPJ válido", 400);
  }

  const digits = value.replace(/\D/g, "");
  if (!isValidCpf(digits) && !isValidCnpj(digits)) {
    throw new AppError("Informe um CPF ou CNPJ válido", 400);
  }

  return digits;
};

const formatDocument = (value: string): string =>
  value.length === 11
    ? value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : value.replace(
        /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
        "$1.$2.$3/$4-$5"
      );

const signConversation = (conversationId: string): string => {
  const signature = createHmac("sha256", getSecret())
    .update(conversationId)
    .digest("hex");
  return `${conversationId}.${signature}`;
};

const assertConversationToken = (
  req: Request,
  conversationId: string
): void => {
  const authorization = req.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const expected = signConversation(conversationId);
  if (token.length !== expected.length) {
    throw new AppError("Sessão de atendimento inválida", 401);
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= token.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  if (difference !== 0) {
    throw new AppError("Sessão de atendimento inválida", 401);
  }
};

const stripAgentSignature = (body: string): string =>
  body.replace(/^\*[^*\n]{1,80}:\*\n/, "");

const serializeMessage = (message: Message) => ({
  id: message.id,
  body: message.fromMe ? stripAgentSignature(message.body) : message.body,
  fromAttendant: message.fromMe,
  mediaUrl: message.mediaUrl,
  mediaType: message.mediaType,
  createdAt: message.createdAt
});

const emitTicket = async (ticketId: number, companyId: number): Promise<void> => {
  const ticket = await ShowTicketService(ticketId, companyId);
  const io = getIO();

  io.to(`company-${companyId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .to(`company-${companyId}-notification`)
    .to(`queue-${ticket.queueId}-notification`)
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });
};

const findConversation = async (
  conversationId: string,
  companyId: number
): Promise<Ticket> => {
  const ticket = await Ticket.findOne({
    where: {
      uuid: conversationId,
      companyId,
      channel: "webchat"
    },
    include: ["contact", "queue", "user"]
  });

  if (!ticket) {
    throw new AppError("Atendimento não encontrado", 404);
  }

  return ticket;
};

export const start = async (
  req: Request,
  res: Response
): Promise<Response> => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);
  assertRateLimit(req, sessionBuckets, "session", 5, 10 * 60 * 1000);

  const {
    profile,
    name,
    phone,
    vehicle,
    subject,
    email,
    document,
    newCustomer,
    message
  } = req.body as StartBody;
  const isAutomotive = profile === "automotive";
  const contactName = cleanText(name, "Nome", 2, 80);
  const contactEmail = cleanEmail(email);
  const isNewCustomer = isAutomotive || newCustomer === true;
  const contactDocument = cleanDocument(document, isNewCustomer);
  const contactPhone = isAutomotive ? cleanPhone(phone) : "";
  const contactVehicle = isAutomotive
    ? cleanOptionalText(vehicle, "Veículo", 80)
    : "";
  const contactSubject = isAutomotive
    ? cleanText(subject, "Assunto", 2, 80)
    : "";
  const firstMessage = cleanText(message, "Mensagem", 1, 2000);

  const companyId = getCompanyId(req);
  const queue = await Queue.findOne({
    where: { companyId, name: "Atendimento" }
  });
  const whatsapp = await Whatsapp.findOne({
    where: { companyId, isDefault: true }
  });

  if (!queue) {
    throw new AppError("Atendimento online indisponível", 503);
  }

  const visitorId = uuidv4();
  const contact = await Contact.create({
    name: contactName,
    number: `web:${visitorId}`,
    email: contactEmail,
    companyId,
    channel: "webchat",
    disableBot: false,
    isGroup: false
  });

  if (isAutomotive) {
    const automotiveFields = [
      {
        name: "Telefone",
        value: formatPhone(contactPhone),
        contactId: contact.id
      },
      {
        name: "Assunto",
        value: contactSubject,
        contactId: contact.id
      }
    ];

    if (contactVehicle) {
      automotiveFields.push({
        name: "Veículo",
        value: contactVehicle,
        contactId: contact.id
      });
    }

    await ContactCustomField.bulkCreate(automotiveFields);
  } else {
    await ContactCustomField.create({
      name: "CPF/CNPJ",
      value: isNewCustomer
        ? "Visitante informou que ainda não é cliente"
        : formatDocument(contactDocument),
      contactId: contact.id
    });
  }

  const ticket = await Ticket.create({
    contactId: contact.id,
    companyId,
    queueId: queue.id,
    whatsappId: whatsapp?.id,
    status: "pending",
    channel: "webchat",
    unreadMessages: 1,
    lastMessage: firstMessage,
    isGroup: false,
    chatbot: false
  });

  await FindOrCreateATicketTrakingService({
    ticketId: ticket.id,
    companyId,
    whatsappId: whatsapp?.id
  });

  const createdMessage = await CreateMessageService({
    companyId,
    messageData: {
      id: uuidv4(),
      ticketId: ticket.id,
      contactId: contact.id,
      body: firstMessage,
      fromMe: false,
      read: false,
      channel: "webchat",
      queueId: queue.id
    }
  });

  await incrementCounter(companyId, "ticket-create");
  await emitTicket(ticket.id, companyId);
  void runWebChatAutomation(ticket.id, companyId, createdMessage);

  return res.status(201).json({
    conversationId: ticket.uuid,
    token: signConversation(ticket.uuid),
    protocol: ticket.id,
    status: ticket.status,
    department: queue.name,
    messages: [serializeMessage(createdMessage)]
  });
};

export const sendMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);
  assertRateLimit(req, requestBuckets, "messages", 120, 60 * 1000);

  const { conversationId } = req.params;
  assertConversationToken(req, conversationId);

  const companyId = getCompanyId(req);
  const ticket = await findConversation(conversationId, companyId);

  if (ticket.status === "closed") {
    throw new AppError("Este atendimento foi encerrado", 409);
  }

  const body = cleanText(
    (req.body as MessageBody).message,
    "Mensagem",
    1,
    2000
  );

  await ticket.update({
    unreadMessages: Number(ticket.unreadMessages || 0) + 1,
    lastMessage: body
  });

  const message = await CreateMessageService({
    companyId,
    messageData: {
      id: uuidv4(),
      ticketId: ticket.id,
      contactId: ticket.contactId,
      body,
      fromMe: false,
      read: false,
      channel: "webchat",
      queueId: ticket.queueId
    }
  });

  await emitTicket(ticket.id, companyId);
  void runWebChatAutomation(ticket.id, companyId, message);
  return res.status(201).json({ message: serializeMessage(message) });
};

export const authorizeMedia = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);
  assertRateLimit(req, requestBuckets, "media", 30, 10 * 60 * 1000);
  assertConversationToken(req, req.params.conversationId);
  next();
};

export const sendMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);

  const { conversationId } = req.params;
  assertConversationToken(req, conversationId);

  const file = req.file;
  if (!file) {
    throw new AppError("Selecione um arquivo para enviar", 400);
  }
  assertAllowedWebChatMedia(file);
  const normalizedFile = await normalizeWebChatAudio(file);
  assertAllowedWebChatMedia(normalizedFile);

  const companyId = getCompanyId(req);
  const ticket = await findConversation(conversationId, companyId);

  if (ticket.status === "closed") {
    throw new AppError("Este atendimento foi encerrado", 409);
  }

  const originalName = getSafeWebChatOriginalName(
    normalizedFile.originalname
  );
  const mediaType = getWebChatMediaType(normalizedFile.mimetype);
  const mediaUrl = await saveMediaToFile(
    {
      data: normalizedFile.buffer,
      mimetype: normalizedFile.mimetype,
      filename: getWebChatStoredName(normalizedFile.mimetype)
    },
    { destination: ticket }
  );
  const caption =
    typeof req.body?.message === "string" && req.body.message.trim()
      ? cleanText(req.body.message, "Mensagem", 1, 500)
      : "";
  const body = caption || originalName;

  await ticket.update({
    unreadMessages: Number(ticket.unreadMessages || 0) + 1,
    lastMessage: `ðŸ“Ž ${body}`
  });

  const message = await CreateMessageService({
    companyId,
    messageData: {
      id: uuidv4(),
      ticketId: ticket.id,
      contactId: ticket.contactId,
      body,
      fromMe: false,
      read: false,
      channel: "webchat",
      queueId: ticket.queueId,
      mediaUrl,
      mediaType,
      dataJson: getWebChatMediaDataJson(
        mediaType,
        originalName,
        normalizedFile.mimetype
      )
    }
  });

  await emitTicket(ticket.id, companyId);
  void runWebChatAutomation(ticket.id, companyId, message);

  return res.status(201).json({ message: serializeMessage(message) });
};

export const close = async (
  req: Request,
  res: Response
): Promise<Response> => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);
  assertRateLimit(req, requestBuckets, "close", 20, 60 * 1000);

  const { conversationId } = req.params;
  assertConversationToken(req, conversationId);

  const companyId = getCompanyId(req);
  const ticket = await findConversation(conversationId, companyId);

  if (ticket.status !== "closed") {
    await UpdateTicketService({
      ticketData: {
        status: "closed",
        justClose: true,
        chatbot: false,
        queueOptionId: null
      },
      ticketId: ticket.id,
      companyId,
      dontRunChatbot: true
    });
  }

  return res.json({ ok: true, status: "closed" });
};

export const createZammadTicket = async (
  req: Request,
  res: Response
): Promise<Response> => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);
  assertRateLimit(req, requestBuckets, "zammad", 5, 10 * 60 * 1000);

  const { conversationId } = req.params;
  assertConversationToken(req, conversationId);

  const companyId = getCompanyId(req);
  const ticket = await findConversation(conversationId, companyId);
  const { title, summary } = req.body as ZammadTicketBody;
  const cleanTitle = cleanText(title, "Assunto", 3, 120);
  const cleanSummary = cleanText(summary, "Descrição", 5, 2000);

  const zammadTicket = await CreateZammadTicketService({
    ticketId: ticket.id,
    companyId,
    title: cleanTitle,
    summary: cleanSummary,
    includeMessages: true,
    publicRequest: true
  });

  return res.status(201).json(zammadTicket);
};

export const messages = async (
  req: Request,
  res: Response
): Promise<Response> => {
  assertTrustedProxy(req);
  assertAllowedOrigin(req);
  assertRateLimit(req, requestBuckets, "poll", 120, 60 * 1000);

  const { conversationId } = req.params;
  assertConversationToken(req, conversationId);

  const companyId = getCompanyId(req);
  const ticket = await findConversation(conversationId, companyId);
  const records = await Message.findAll({
    where: {
      ticketId: ticket.id,
      companyId,
      channel: "webchat",
      isDeleted: false
    },
    order: [
      ["createdAt", "ASC"],
      ["id", "ASC"]
    ],
    limit: 200
  });

  return res.json({
    protocol: ticket.id,
    status: ticket.status,
    department: ticket.queue?.name || "",
    attendant: ticket.user?.name || "",
    messages: records.map(serializeMessage)
  });
};
