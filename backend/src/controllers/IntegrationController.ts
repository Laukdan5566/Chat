import { Request, Response } from "express";
import { Op } from "sequelize";
import Message from "../models/Message";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import {
  getMessageFileOptions,
  sendWhatsappFile
} from "../services/WbotServices/SendWhatsAppMedia";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import { getWbot, removeWbot } from "../libs/wbot";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import CreateTicketNoteService from "../services/TicketNoteService/CreateTicketNoteService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import { getN8nTicketContext } from "../services/N8nServices/RunN8nWebhookService";
import { createWebChatOutboundMessage } from "../services/WebChatServices/WebChatAutomationService";

const getTokenFromRequest = (req: Request) =>
  (Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization || "")
    .replace(/^=?Bearer\s+/i, "")
    .trim();

const getTicketIdFromToken = (token: string) => {
  const [, ticketId] = token.split(":");
  return ticketId ? Number(ticketId) : null;
};

const getTicketIdFromBody = (body: any, token: string) => {
  const bodyTicketId =
    body.ticketId ||
    body.ticket_id ||
    body.message?.ticketId ||
    body.message?.ticket_id ||
    body.metadata?.ticketId;

  if (bodyTicketId) {
    return Number(bodyTicketId);
  }

  const tokenTicketId = getTicketIdFromToken(token);
  if (tokenTicketId) {
    return tokenTicketId;
  }

  return getN8nTicketContext(token)?.ticketId;
};

const getTicket = async (req: Request) => {
  const token = getTokenFromRequest(req);
  const ticketId = getTicketIdFromBody(req.body, token);

  if (!ticketId) {
    throw new AppError("ERR_TICKET_NOT_INTEGRATION_CONTEXT", 400);
  }

  const ticket = await Ticket.findByPk(ticketId, {
    include: ["contact", "queue", "user", "whatsapp"]
  });

  if (!ticket || ticket.companyId !== req.companyId) {
    throw new AppError("ERR_TICKET_NOT_FOUND", 404);
  }

  return ticket;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const serializeWhatsapp = (whatsapp: Whatsapp) => ({
  id: whatsapp.id,
  name: whatsapp.name,
  status: whatsapp.status,
  qrcode: whatsapp.qrcode || "",
  battery: whatsapp.battery,
  plugged: whatsapp.plugged,
  retries: whatsapp.retries,
  provider: whatsapp.provider,
  channel: whatsapp.channel,
  isDefault: whatsapp.isDefault,
  updatedAt: whatsapp.updatedAt
});

const getIntegrationWhatsapp = async (req: Request) => {
  const rawId =
    req.body.whatsappId ||
    req.body.whatsapp_id ||
    req.body.ticketzWhatsappId ||
    req.body.ticketz_whatsapp_id;
  const whatsapp = rawId
    ? await Whatsapp.findByPk(Number(rawId))
    : await GetDefaultWhatsApp(req.companyId);

  if (!whatsapp || whatsapp.companyId !== req.companyId) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  return whatsapp;
};

export const listQueues = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const queues = await Queue.findAll({
    where: { companyId: req.companyId },
    attributes: ["id", "name", "color"],
    order: [["name", "ASC"]]
  });

  return res.json(
    queues.map(queue => ({
      id: queue.id,
      name: queue.name,
      color: queue.color,
      description: queue.name
    }))
  );
};

export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { action } = req.body;

  if (action === "whatsapp_status") {
    const whatsapp = await getIntegrationWhatsapp(req);
    await whatsapp.reload();
    return res.json({ ok: true, whatsapp: serializeWhatsapp(whatsapp) });
  }

  if (action === "start_whatsapp_session") {
    const whatsapp = await getIntegrationWhatsapp(req);
    if (whatsapp.channel !== "whatsapp") {
      throw new AppError("ERR_SESSION_NOT_SUPPORTED", 400);
    }

    if (String(whatsapp.status).toUpperCase() !== "CONNECTED") {
      await StartWhatsAppSession(whatsapp, req.companyId);
      await sleep(1500);
    }

    await whatsapp.reload();
    return res.json({ ok: true, whatsapp: serializeWhatsapp(whatsapp) });
  }

  if (action === "refresh_whatsapp_session") {
    const whatsapp = await getIntegrationWhatsapp(req);
    if (whatsapp.channel !== "whatsapp") {
      throw new AppError("ERR_SESSION_NOT_SUPPORTED", 400);
    }

    try {
      const wbot = getWbot(whatsapp.id);
      await wbot.ws.close();
    } catch {
      await StartWhatsAppSession(whatsapp, req.companyId, true);
    }
    await sleep(1500);
    await whatsapp.reload();
    return res.json({ ok: true, whatsapp: serializeWhatsapp(whatsapp) });
  }

  if (action === "disconnect_whatsapp_session") {
    const whatsapp = await getIntegrationWhatsapp(req);
    if (whatsapp.channel === "whatsapp") {
      await removeWbot(whatsapp.id).catch(() => undefined);
    }
    await whatsapp.update({
      status: "DISCONNECTED",
      session: "",
      qrcode: "",
      battery: null,
      plugged: null
    });
    return res.json({ ok: true, whatsapp: serializeWhatsapp(whatsapp) });
  }

  // The VIB SaaS panel uses these read-only actions to list and open a
  // Ticketz conversation before it sends an order or a customer link.
  if (action === "search_tickets") {
    const status = String(req.body.status || "all").trim();
    const query = String(req.body.q || "").trim();
    const digits = query.replace(/\D/g, "");
    const where: any = {
      companyId: req.companyId
    };

    if (status && status !== "all") {
      where.status = status;
    }

    if (query) {
      const filters: any[] = [
        { "$contact.name$": { [Op.iLike]: `%${query}%` } }
      ];

      if (digits) {
        filters.push({ "$contact.number$": { [Op.iLike]: `%${digits}%` } });
      }

      if (/^\d+$/.test(query)) {
        filters.push({ id: Number(query) });
      }

      where[Op.or] = filters;
    }

    const tickets = await Ticket.findAll({
      where,
      include: ["contact", "queue", "user", "whatsapp"],
      order: [["updatedAt", "DESC"]],
      limit: 100,
      subQuery: false
    });

    return res.json({ tickets });
  }

  if (action === "message_to_number") {
    const number = String(req.body.number || "").replace(/\D/g, "");
    const content = req.body.message?.content || req.body.content || "";
    const requestedQueueId = Number(req.body.queueId || req.body.queue_id);
    const requestedWhatsappId = Number(
      req.body.whatsappId || req.body.whatsapp_id || req.body.ticketzWhatsappId
    );

    if (!number) {
      throw new AppError("ERR_CONTACT_NUMBER_NOT_FOUND", 400);
    }
    if (!content.trim()) {
      throw new AppError("ERR_EMPTY_MESSAGE", 400);
    }

    const whatsapp = requestedWhatsappId
      ? await Whatsapp.findOne({
          where: {
            id: requestedWhatsappId,
            companyId: req.companyId,
            channel: "whatsapp",
            status: "CONNECTED"
          }
        })
      : await Whatsapp.findOne({
          where: {
            companyId: req.companyId,
            channel: "whatsapp",
            status: "CONNECTED"
          },
          order: [["isDefault", "DESC"], ["id", "ASC"]]
        });

    if (!whatsapp) {
      throw new AppError("ERR_NO_DEF_WAPP_FOUND", 400);
    }

    const queue = requestedQueueId
      ? await Queue.findOne({
          where: { id: requestedQueueId, companyId: req.companyId }
        })
      : null;
    if (requestedQueueId && !queue) {
      throw new AppError("ERR_QUEUE_NOT_FOUND", 400);
    }

    const contact = await CreateOrUpdateContactService({
      name: String(req.body.contactName || req.body.name || number),
      number,
      companyId: req.companyId,
      channel: "whatsapp"
    });
    const { ticket } = await FindOrCreateTicketService(
      contact,
      whatsapp.id,
      req.companyId,
      { queue: queue || undefined }
    );
    const sentMessage = await SendWhatsAppMessage({ body: content, ticket });

    return res.json({
      ok: true,
      ticketId: ticket.id,
      messageId: sentMessage?.key?.id || null
    });
  }

  const ticket = await getTicket(req);

  if (action === "ticket_snapshot") {
    const requestedLimit = Number(req.body.limit || 80);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
      : 80;
    const messages = await Message.findAll({
      where: {
        ticketId: ticket.id,
        companyId: req.companyId
      },
      order: [["createdAt", "ASC"]],
      limit
    });

    return res.json({
      ticket,
      contact: ticket.contact,
      messages: messages.map(message => ({
        id: message.id,
        fromMe: message.fromMe,
        type: message.mediaType || "text",
        content: message.body || "",
        body: message.body || "",
        mediaUrl: message.mediaUrl,
        createdAt: message.createdAt
      }))
    });
  }

  if (action === "set_bot") {
    const enabled = Boolean(req.body.enabled);
    await ticket.contact.update({ disableBot: !enabled });
    return res.json({ ok: true, enabled, disableBot: !enabled });
  }

  if (action === "media") {
    if (ticket.channel === "webchat") {
      throw new AppError("ERR_MEDIA_NOT_SUPPORTED_FOR_WEBCHAT", 400);
    }

    const mediaUrl = String(req.body.mediaUrl || req.body.message?.mediaUrl || "").trim();
    const fileName = String(req.body.fileName || req.body.message?.fileName || "arquivo");
    const mimetype = String(req.body.mimeType || req.body.message?.mimeType || "application/octet-stream");
    const caption = String(req.body.content || req.body.message?.content || "");
    if (!mediaUrl) {
      throw new AppError("ERR_MEDIA_URL_REQUIRED", 400);
    }

    const fileOptions = await getMessageFileOptions(fileName, mediaUrl, mimetype);
    if (!fileOptions) {
      throw new AppError("ERR_MEDIA_OPTIONS", 400);
    }

    const sentMessage = await sendWhatsappFile(
      ticket,
      { mediaUrl, mimetype, filename: fileName },
      { caption: caption || undefined, fileName, ...fileOptions }
    );
    return res.json({ ok: true, messageId: sentMessage?.key?.id || null });
  }

  if (action === "message") {
    const content = req.body.message?.content || req.body.content || "";
    if (!content.trim()) {
      throw new AppError("ERR_EMPTY_MESSAGE", 400);
    }

    if (ticket.channel === "webchat") {
      await createWebChatOutboundMessage(ticket, content);
    } else {
      await SendWhatsAppMessage({ body: content, ticket });
    }
    return res.json({ ok: true });
  }

  if (action === "note") {
    const note = req.body.message?.content || req.body.note || "";
    if (!note.trim()) {
      throw new AppError("ERR_EMPTY_NOTE", 400);
    }

    const user = await User.findOne({
      where: { companyId: req.companyId, profile: "admin" }
    });

    if (!user) {
      throw new AppError("ERR_USER_NOT_FOUND", 404);
    }

    await CreateTicketNoteService({
      note,
      userId: user.id,
      contactId: ticket.contactId,
      ticketId: ticket.id
    });
    return res.json({ ok: true });
  }

  if (action === "transfer") {
    const queueId = Number(req.body.queueId || req.body.message?.queueId);
    const note =
      req.body.note ||
      req.body.internalNote ||
      req.body.summary ||
      req.body.transferNote ||
      req.body.message?.note ||
      req.body.message?.internalNote;
    if (!queueId) {
      throw new AppError("ERR_QUEUE_NOT_FOUND", 400);
    }

    if (note?.trim()) {
      const user = await User.findOne({
        where: { companyId: req.companyId, profile: "admin" }
      });

      if (user) {
        await CreateTicketNoteService({
          note,
          userId: user.id,
          contactId: ticket.contactId,
          ticketId: ticket.id
        });
      }
    }

    await UpdateTicketService({
      ticketData: {
        queueId,
        userId: null,
        status: "pending",
        chatbot: false,
        queueOptionId: null
      },
      ticketId: ticket.id,
      companyId: ticket.companyId,
      dontRunChatbot: true
    });
    return res.json({ ok: true });
  }

  if (action === "close") {
    await UpdateTicketService({
      ticketData: { status: "closed", justClose: true },
      ticketId: ticket.id,
      companyId: ticket.companyId,
      dontRunChatbot: true
    });
    return res.json({ ok: true });
  }

  throw new AppError("ERR_UNSUPPORTED_INTEGRATION_ACTION", 400);
};
