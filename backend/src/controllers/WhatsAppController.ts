import { Request, Response } from "express";
import { Op } from "sequelize";
import { cacheLayer } from "../libs/cache";
import { getIO } from "../libs/socket";
import { removeWbot } from "../libs/wbot";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";

import CreateWhatsAppService from "../services/WhatsappService/CreateWhatsAppService";
import DeleteWhatsAppService from "../services/WhatsappService/DeleteWhatsAppService";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import { sendWhatsappUpdate } from "../services/WhatsappService/SocketSendWhatsappUpdate";

interface WhatsappData {
  name: string;
  queueIds: number[];
  companyId: number;
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  ratingMessage?: string;
  transferMessage?: string;
  status?: string;
  isDefault?: boolean;
  token?: string;
  channel?: string;
  facebookUserId?: string;
  facebookUserToken?: string;
  facebookPageUserId?: string;
  tokenMeta?: string;
  provider?: string;
  apiToken?: string;
  apiChannelId?: string;
  apiWebhookSecret?: string;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { onlyConnected } = req.query;
  const allowTicketConnectionList =
    onlyConnected === "1" || onlyConnected === "true";

  if (req.user.profile !== "admin" && !allowTicketConnectionList) {
    return res.status(200).json([]);
  }

  let whatsapps = await ListWhatsAppsService({ companyId });

  if (allowTicketConnectionList) {
    whatsapps = whatsapps.filter(
      whatsapp =>
        whatsapp.channel === "whatsapp" && whatsapp.status === "CONNECTED"
    );

    return res.status(200).json(
      whatsapps.map(whatsapp => ({
        id: whatsapp.id,
        name: whatsapp.name,
        channel: whatsapp.channel,
        provider: whatsapp.provider,
        status: whatsapp.status,
        isDefault: whatsapp.isDefault,
        queues: whatsapp.queues
      }))
    );
  }

  return res.status(200).json(whatsapps);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    name,
    status,
    isDefault,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    ratingMessage,
    transferMessage,
    queueIds,
    token,
    channel,
    facebookUserId,
    facebookUserToken,
    facebookPageUserId,
    tokenMeta,
    provider,
    apiToken,
    apiChannelId,
    apiWebhookSecret
  }: WhatsappData = req.body;
  const { companyId } = req.user;
  const normalizedChannel = channel || "whatsapp";
  const normalizedProvider = provider || "beta";
  const isOfficialWhatsApp =
    normalizedChannel === "whatsapp" && normalizedProvider === "notificame";

  const { whatsapp, oldDefaultWhatsapp } = await CreateWhatsAppService({
    name,
    status:
      isOfficialWhatsApp ||
      normalizedChannel === "facebook" ||
      normalizedChannel === "instagram"
        ? "CONNECTED"
        : status,
    isDefault,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    ratingMessage,
    transferMessage,
    queueIds,
    companyId,
    token,
    channel: normalizedChannel,
    facebookUserId,
    facebookUserToken,
    facebookPageUserId,
    tokenMeta,
    provider: normalizedProvider,
    apiToken,
    apiChannelId,
    apiWebhookSecret
  });

  sendWhatsappUpdate(whatsapp);

  if (oldDefaultWhatsapp) {
    sendWhatsappUpdate(oldDefaultWhatsapp);
  }

  if (whatsapp.channel === "whatsapp" && whatsapp.provider !== "notificame") {
    StartWhatsAppSession(whatsapp, companyId);
  }

  return res.status(200).json(whatsapp);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const { session } = req.query;

  const whatsapp = await ShowWhatsAppService(whatsappId, {
    hideSession: session === "0"
  });

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  return res.status(200).json(whatsapp);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsappData = req.body;
  const { companyId } = req.user;
  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppService({
    whatsappData,
    whatsappId,
    companyId
  });

  sendWhatsappUpdate(whatsapp);

  if (oldDefaultWhatsapp) {
    sendWhatsappUpdate(oldDefaultWhatsapp);
  }

  return res.status(200).json(whatsapp);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const { closeTickets } = req.query;

  const io = getIO();

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  if (closeTickets === "true") {
    const closedTickets = (
      await Ticket.update(
        { status: "closed" },
        {
          where: {
            whatsappId,
            status: { [Op.or]: ["open", "pending"] }
          },
          returning: true
        }
      )
    )[1];

    closedTickets.forEach(ticket => {
      io.to(`company-${companyId}-mainchannel`).emit(
        `company-${companyId}-ticket`,
        {
          action: "delete",
          ticketId: ticket.id
        }
      );
    });
  } else {
    const openTickets: Ticket[] = await whatsapp.$get("tickets", {
      where: {
        status: { [Op.or]: ["open", "pending"] }
      }
    });

    if (openTickets.length > 0) {
      throw new AppError(
        "Não é possível remover conexão que contém tickets não resolvidos"
      );
    }
  }

  if (whatsapp.channel === "whatsapp" && whatsapp.provider !== "notificame") {
    await DeleteBaileysService(whatsappId);
    await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
    removeWbot(+whatsappId);
  }

  await DeleteWhatsAppService(whatsappId);

  io.to(`company-${companyId}-admin`).emit(`company-${companyId}-whatsapp`, {
    action: "delete",
    whatsappId: +whatsappId
  });

  return res.status(200).json({ message: "Session disconnected." });
};
