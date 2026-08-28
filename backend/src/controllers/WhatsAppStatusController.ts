import { Request, Response } from "express";
import AppError from "../errors/AppError";
import BaileysContact from "../models/BaileysContact";
import { getWbot } from "../libs/wbot";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import WhatsAppStatusPost from "../models/WhatsAppStatusPost";
import PublishWhatsAppStatusService from "../services/WbotServices/PublishWhatsAppStatusService";

const getConnectedWhatsapp = async (companyId: number, whatsappId: number) => {
  const whatsapp = await Whatsapp.findOne({
    where: {
      id: whatsappId,
      companyId,
      channel: "whatsapp",
      status: "CONNECTED"
    }
  });

  if (!whatsapp) {
    throw new AppError("A conexão escolhida não está conectada.", 400);
  }

  return whatsapp;
};

const parseRecipients = (value: unknown): string[] | null => {
  if (value === undefined || value === null || value === "") return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "string")) {
      throw new Error("invalid recipient list");
    }
    return parsed;
  } catch (_error) {
    throw new AppError("A seleção de contatos está inválida.");
  }
};

export const connections = async (req: Request, res: Response): Promise<Response> => {
  const whatsapps = await Whatsapp.findAll({
    where: {
      companyId: req.user.companyId,
      channel: "whatsapp",
      status: "CONNECTED"
    },
    attributes: ["id", "name", "status"],
    order: [["name", "ASC"]]
  });

  return res.json(whatsapps);
};

export const contacts = async (req: Request, res: Response): Promise<Response> => {
  const whatsapp = await getConnectedWhatsapp(
    req.user.companyId,
    Number(req.params.whatsappId)
  );
  const search = String(req.query.search || "").trim().toLocaleLowerCase();
  const records = await BaileysContact.findAll({
    where: { whatsappId: whatsapp.id },
    order: [["contactId", "ASC"]]
  });

  const contacts = records
    .filter(record => record.contactId.endsWith("@s.whatsapp.net"))
    .map(record => {
      const payload = record.payload || {};
      const name = String(
        payload.name || payload.notify || payload.verifiedName || record.contactId
      );
      return { id: record.contactId, name };
    })
    .filter(contact =>
      !search ||
      contact.name.toLocaleLowerCase().includes(search) ||
      contact.id.includes(search.replace(/\D/g, ""))
    )
    .slice(0, 250);

  return res.json({ contacts, total: records.length });
};

export const readiness = async (req: Request, res: Response): Promise<Response> => {
  const whatsapp = await Whatsapp.findOne({
    where: {
      id: Number(req.params.whatsappId),
      companyId: req.user.companyId,
      channel: "whatsapp"
    },
    attributes: ["id", "status"]
  });

  if (!whatsapp) {
    throw new AppError("A conexão escolhida não foi encontrada.", 404);
  }

  const [contactsCount, lastContact] = await Promise.all([
    BaileysContact.count({ where: { whatsappId: whatsapp.id } }),
    BaileysContact.findOne({
      where: { whatsappId: whatsapp.id },
      attributes: ["updatedAt"],
      order: [["updatedAt", "DESC"]]
    })
  ]);

  let isRegistered = false;
  let socketReady = false;
  let initialSyncComplete = false;

  try {
    const wbot = getWbot(whatsapp.id);
    isRegistered = Boolean(wbot.isRegistered);
    socketReady = Boolean(
      (wbot.ws as unknown as { isOpen?: boolean })?.isOpen
    );
    initialSyncComplete = Boolean(wbot.initialSyncComplete);
  } catch (_error) {
    // The connection may still be starting or waiting for QR pairing.
  }

  const ready =
    whatsapp.status === "CONNECTED" &&
    socketReady &&
    initialSyncComplete &&
    contactsCount > 0;

  return res.json({
    ready,
    connectionStatus: whatsapp.status,
    isRegistered,
    socketReady,
    initialSyncComplete,
    contactsCount,
    lastContactSyncAt: lastContact?.updatedAt || null
  });
};

export const publish = async (req: Request, res: Response): Promise<Response> => {
  const whatsapp = await getConnectedWhatsapp(
    req.user.companyId,
    Number(req.body.whatsappId)
  );
  const post = await PublishWhatsAppStatusService({
    whatsapp,
    companyId: req.user.companyId,
    userId: Number(req.user.id),
    body: String(req.body.body || ""),
    backgroundColor: String(req.body.backgroundColor || "#1F2937"),
    recipientIds: parseRecipients(req.body.recipientIds),
    media: req.file
  });

  return res.status(201).json(post);
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const posts = await WhatsAppStatusPost.findAll({
    where: { companyId: req.user.companyId },
    include: [
      { model: Whatsapp, attributes: ["id", "name"] },
      { model: User, attributes: ["id", "name"] }
    ],
    order: [["createdAt", "DESC"]],
    limit: 20
  });

  return res.json(posts);
};
