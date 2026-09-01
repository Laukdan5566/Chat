import fs from "fs";
import axios from "axios";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import saveMediaToFile from "../../helpers/saveMediaFile";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import { isNotificaMeConnection } from "./SendNotificaMeMessageService";

type Request = {
  media: Express.Multer.File;
  ticket: Ticket;
  caption?: string;
  userId?: number;
};

const endpoint = () =>
  process.env.NOTIFICAME_API_URL ||
  "https://api.notificame.com.br/v1/channels/whatsapp/messages";

const publicUrl = (path: string) =>
  path.startsWith("http")
    ? path
    : `${String(process.env.BACKEND_URL || "").replace(/\/$/, "")}/public/${path}`;

const SendNotificaMeMediaService = async ({
  media,
  ticket,
  caption,
  userId
}: Request): Promise<Message> => {
  const connection = await Whatsapp.findByPk(ticket.whatsappId);

  if (!isNotificaMeConnection(connection) || !connection.apiToken || !connection.apiChannelId) {
    throw new AppError("ERR_OFFICIAL_WHATSAPP_CREDENTIALS_REQUIRED", 400);
  }

  const readable = fs.createReadStream(media.path);
  const storedPath = await saveMediaToFile(
    {
      data: readable,
      mimetype: media.mimetype,
      filename: media.originalname
    },
    { destination: ticket }
  );
  readable.destroy();

  try {
    const response = await axios.post(
      endpoint(),
      {
        from: connection.apiChannelId,
        to: ticket.contact.number.replace(/\D/g, ""),
        contents: [
          {
            type: "file",
            fileMimeType: media.mimetype,
            fileUrl: publicUrl(storedPath),
            fileCaption: caption || media.originalname
          }
        ]
      },
      {
        headers: {
          "X-Api-Token": connection.apiToken,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const providerMessageId = String(response.data?.id || `out-${Date.now()}`);
    const body = caption || media.originalname;

    await ticket.update({ lastMessage: `📎 ${body}`.substring(0, 255) });

    return CreateMessageService({
      messageData: {
        id: `notificame-${providerMessageId}`,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        userId,
        body,
        fromMe: true,
        read: true,
        ack: 1,
        mediaType: media.mimetype.split("/")[0] || "document",
        mediaUrl: storedPath,
        channel: "whatsapp",
        dataJson: JSON.stringify(response.data),
        queueId: ticket.queueId
      },
      companyId: ticket.companyId
    });
  } catch (error) {
    logger.error(
      { error: error?.response?.data || error?.message, ticketId: ticket.id },
      "Failed to send NotificaMe WhatsApp media"
    );
    throw new AppError("ERR_SENDING_OFFICIAL_WAPP_MSG", 502);
  }
};

export default SendNotificaMeMediaService;
