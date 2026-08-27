import { Request, Response } from "express";
import fs from "fs";
import AppError from "../errors/AppError";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import Queue from "../models/Queue";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import SendMetaMessageService from "../services/MetaServices/SendMetaMessageService";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import EditWhatsAppMessage from "../services/WbotServices/EditWhatsAppMessage";
import ListContactMessagesService from "../services/MessageServices/ListContactMessagesService";
import { assertCompanyCanUseChannel } from "../helpers/ChannelPlan";

import { logger } from "../utils/logger";
import { MessageData } from "../helpers/SendMessage";
import Message from "../models/Message";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import ForwardMessageService from "../services/MessageServices/ForwardMessageService";
import { getWbot } from "../libs/wbot";
import { verifyMessage } from "../services/WbotServices/wbotMessageListener";
import { getJidOf } from "../services/WbotServices/getJidOf";
import ShowContactService from "../services/ContactServices/ShowContactService";
import { verifyContact } from "../services/WbotServices/verifyContact";
import { hasPermission } from "../helpers/UserPermissions";
import { v4 as uuidv4 } from "uuid";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import { websocketUpdateTicket } from "../services/TicketServices/UpdateTicketService";
import saveMediaToFile from "../helpers/saveMediaFile";
import {
  assertAllowedWebChatMedia,
  getSafeWebChatOriginalName,
  getWebChatMediaDataJson,
  getWebChatMediaType,
  getWebChatStoredName
} from "../helpers/WebChatMedia";

type IndexQuery = {
  pageNumber: string;
  markAsRead: string;
};

type ContactHistoryQuery = {
  excludeTicketId?: string;
  pageNumber?: string;
  searchParam?: string;
};

type ForwardData = {
  contactId: number;
  ticketId: number;
  messageId: string;
  queueId: number;
};

const parseSaveOnTicket = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }

  return !!value;
};

const parseQueueId = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;

  const queueId = Number(value);

  if (!Number.isInteger(queueId) || queueId <= 0) {
    throw new AppError("ERR_INVALID_QUEUE_ID", 400);
  }

  return queueId;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber, markAsRead } = req.query as IndexQuery;
  const { companyId, profile } = req.user;
  const queues: number[] = [];

  if (profile !== "admin") {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Queue, as: "queues" }]
    });
    const ticket = await ShowTicketService(ticketId, companyId);
    const isParticipant = ticket.participants?.some(
      participant => participant.id === user.id
    );

    if (!isParticipant || !hasPermission(user, "ticket-participants:view")) {
      user.queues.forEach(queue => {
        queues.push(queue.id);
      });
    }
  }

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId,
    companyId,
    queues
  });

  if (ticket.channel === "whatsapp" && markAsRead === "true") {
    SetTicketMessagesAsRead(ticket);
  }

  return res.json({ count, messages, ticket, hasMore });
};

export const contactHistory = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;
  const { excludeTicketId, pageNumber, searchParam } =
    req.query as ContactHistoryQuery;
  const { companyId, profile } = req.user;
  const queues: number[] = [];

  if (profile !== "admin") {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Queue, as: "queues" }]
    });
    user.queues.forEach(queue => {
      queues.push(queue.id);
    });
  }

  const { count, messages, hasMore } = await ListContactMessagesService({
    contactId,
    companyId,
    excludeTicketId,
    pageNumber,
    searchParam,
    queues
  });

  return res.json({ count, messages, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];
  const { companyId } = req.user;
  const userId = Number(req.user.id) || null;

  const ticket = await ShowTicketService(ticketId, companyId);
  const sender = await User.findByPk(req.user.id);

  if (
    sender.profile !== "admin" &&
    Number(ticket.userId) !== userId &&
    !(
      ticket.participants?.some(participant => participant.id === sender.id) &&
      hasPermission(sender, "ticket-participants:sendMessage")
    )
  ) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const { channel } = ticket;

  if (channel === "webchat") {
    const messageBody = typeof body === "string" ? body.trim() : "";
    if (!messageBody && !medias?.length) {
      throw new AppError("ERR_SYNTAX", 400);
    }

    const createdMessages: Message[] = [];

    if (medias?.length) {
      for (const media of medias) {
        try {
          assertAllowedWebChatMedia(media);
          const originalName = getSafeWebChatOriginalName(media.originalname);
          const mediaType = getWebChatMediaType(media.mimetype);
          const readableFile = fs.createReadStream(media.path);
          const mediaUrl = await saveMediaToFile(
            {
              data: readableFile,
              mimetype: media.mimetype,
              filename: getWebChatStoredName(media.mimetype)
            },
            { destination: ticket }
          );
          readableFile.destroy();

          createdMessages.push(
            await CreateMessageService({
              companyId,
              messageData: {
                id: uuidv4(),
                ticketId: ticket.id,
                contactId: ticket.contactId,
                userId,
                body: messageBody || originalName,
                fromMe: true,
                read: true,
                // WebChat is delivered by our own realtime channel, not WhatsApp.
                ack: 3,
                channel: "webchat",
                queueId: ticket.queueId,
                mediaUrl,
                mediaType,
                dataJson: getWebChatMediaDataJson(
                  mediaType,
                  originalName,
                  media.mimetype
                )
              }
            })
          );
        } finally {
          try {
            fs.unlinkSync(media.path);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
    } else {
      createdMessages.push(
        await CreateMessageService({
          companyId,
          messageData: {
            id: uuidv4(),
            ticketId: ticket.id,
            contactId: ticket.contactId,
            userId,
            body: messageBody,
            fromMe: true,
            read: true,
            // The API has persisted the message and broadcast it to WebChat.
            ack: 3,
            channel: "webchat",
            queueId: ticket.queueId,
            dataJson: "{}"
          }
        })
      );
    }

    await ticket.update({
      lastMessage: medias?.length
        ? `ðŸ“Ž ${messageBody || medias[medias.length - 1].originalname}`
        : messageBody
    });
    const updatedTicket = await ShowTicketService(ticket.id, companyId);
    websocketUpdateTicket(updatedTicket);

    return res
      .status(201)
      .json(createdMessages.length === 1 ? createdMessages[0] : createdMessages);
  }

  if (channel === "whatsapp") {
    await SetTicketMessagesAsRead(ticket);
    if (!ticket.isGroup) {
      const contact = await ShowContactService(ticket.contactId, companyId);
      if (!contact.number.includes("@") && !contact.whatsappLidMap) {
        try {
          await verifyContact(
            { id: `${contact.number}@s.whatsapp.net`, name: contact.name },
            getWbot(ticket.whatsappId),
            companyId
          );
          await ticket.reload();
        } catch (error) {
          logger.warn(
            {
              ticketId: ticket.id,
              companyId,
              contactId: contact.id,
              error:
                error instanceof Error || error instanceof AppError
                  ? error.message
                  : String(error)
            },
            "Failed to refresh WhatsApp contact before sending message"
          );
        }
      }
    }
  }

  if (medias) {
    if (channel === "whatsapp") {
      await Promise.all(
        medias.map(async (media: Express.Multer.File) => {
          const mediaCaption =
            typeof body === "string" && body.trim() && body !== media.originalname
              ? body
              : undefined;

          await SendWhatsAppMedia({ media, ticket, caption: mediaCaption });
          try {
            fs.unlinkSync(media.path);
          } catch (error) {
            if (error.code !== "ENOENT") {
              throw error;
            }

            logger.warn(
              { path: media.path, ticketId: ticket.id },
              "Uploaded media temporary file was already removed"
            );
          }
        })
      );
    }
  } else if (channel === "whatsapp") {
    await SendWhatsAppMessage({ body, ticket, userId, quotedMsg });
  } else if (channel === "facebook" || channel === "instagram") {
    await assertCompanyCanUseChannel(ticket.companyId, channel);
    await SendMetaMessageService({ body, ticket, userId });
  }

  return res.send();
};

export const react = async (req: Request, res: Response): Promise<Response> => {
  const { messageId } = req.params;
  const { companyId } = req.user;
  const { ticketId, emoji } = req.body;

  const message = await Message.findOne({
    where: {
      id: messageId,
      ticketId
    }
  });

  if (!message) {
    throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
  }

  const ticket = await ShowTicketService(ticketId, companyId);
  const wbot = getWbot(ticket.whatsappId);

  if (!wbot) {
    throw new AppError("ERR_WHATSAPP_NOT_FOUND", 500);
  }

  const msg = JSON.parse(message.dataJson);

  const sentMessage = await wbot.sendMessage(getJidOf(ticket), {
    react: {
      text: emoji,
      key: msg.key
    }
  });

  if (!sentMessage) {
    throw new AppError("ERR_WHATSAPP_MESSAGE_NOT_SENT", 500);
  }

  await verifyMessage(sentMessage, ticket, ticket.contact);
  return res.send();
};

export const edit = async (req: Request, res: Response): Promise<Response> => {
  const { messageId } = req.params;
  const { companyId } = req.user;
  const userId = Number(req.user.id) || null;
  const { body }: MessageData = req.body;

  const { ticketId, message } = await EditWhatsAppMessage({
    messageId,
    companyId,
    userId,
    body
  });

  const io = getIO();
  io.to(ticketId.toString()).emit(`company-${companyId}-appMessage`, {
    action: "update",
    message
  });

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  const { companyId } = req.user;

  const message = await DeleteWhatsAppMessage(messageId);

  const io = getIO();
  io.to(message.ticketId.toString()).emit(`company-${companyId}-appMessage`, {
    action: "update",
    message
  });

  return res.send();
};

export const forward = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId, ticketId, messageId, queueId }: ForwardData = req.body;
  const { companyId } = req.user;

  const user = await User.findByPk(req.user.id, {
    include: [{ model: Queue, as: "queues" }]
  });

  if (
    user.profile !== "admin" &&
    queueId &&
    !user.queues.find(q => q.id === queueId)
  ) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const message = await Message.findOne({
    where: {
      id: messageId,
      ticketId
    },
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: [
          {
            model: Whatsapp,
            as: "whatsapp"
          }
        ]
      },
      {
        model: Contact,
        as: "contact"
      }
    ]
  });

  if (!message) {
    throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
  }

  const contact = await Contact.findByPk(contactId);

  if (!contact) {
    throw new AppError("ERR_CONTACT_NOT_FOUND", 404);
  }

  const queue = queueId && (await Queue.findByPk(queueId));

  if (queueId && !queue) {
    throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
  }

  if (
    message.companyId !== companyId ||
    contact.companyId !== companyId ||
    (queue && queue.companyId !== companyId)
  ) {
    throw new AppError("ERR_ACCESS_DENIED", 403);
  }

  await ForwardMessageService(user, message, contact, queue);

  return res.send();
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const messageData: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  if (messageData.number === undefined) {
    throw new AppError("ERR_SYNTAX", 400);
  }
  const whatsapp = await Whatsapp.findByPk(whatsappId);

  if (!whatsapp) {
    throw new AppError("ERR_WHATSAPP_NOT_FOUND", 404);
  }

  const saveOnTicket = parseSaveOnTicket(messageData.saveOnTicket);
  const queueId = parseQueueId(messageData.queueId);

  if (queueId) {
    const queue = await Queue.findOne({
      where: { id: queueId, companyId: whatsapp.companyId }
    });

    if (!queue) {
      throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
    }
  }

  try {
    let { number } = messageData;
    const { body, linkPreview } = messageData;

    if (!number.includes("@")) {
      const numberToTest = messageData.number;

      const { companyId } = whatsapp;

      const CheckValidNumber = await CheckContactNumber(
        numberToTest,
        companyId,
        whatsapp
      );
      number = CheckValidNumber.jid.replace(/\D/g, "");
    }

    if (medias) {
      await Promise.all(
        medias.map(async (media: Express.Multer.File) => {
          await req.app.get("queues").messageQueue.add(
            "SendMessage",
            {
              whatsappId,
              data: {
                number,
                body: media.originalname,
                mediaPath: media.path,
                saveOnTicket,
                queueId
              }
            },
            { removeOnComplete: true, attempts: 3 }
          );
        })
      );
    } else {
      req.app.get("queues").messageQueue.add(
        "SendMessage",
        {
          whatsappId,
          data: {
            number,
            body,
            linkPreview,
            saveOnTicket,
            queueId
          }
        },

        { removeOnComplete: false, attempts: 3 }
      );
    }

    return res.send({ mensagem: "Message added to queue" });
  } catch (err) {
    const error = { errType: typeof err, serialized: JSON.stringify(err), err };
    if (err?.message) {
      console.error(error, `MessageController.send: ${err.message}`);
    } else {
      logger.error(
        error,
        "MessageController.send: Failed to put message on queue"
      );
    }
    throw new AppError("ERR_INTERNAL_ERROR", 500);
  }
};
