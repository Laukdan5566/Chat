import axios from "axios";
import formatBody from "../../helpers/Mustache";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";

type Request = {
  body: string;
  ticket: Ticket;
  userId?: number;
};

const endpoint = () =>
  process.env.NOTIFICAME_API_URL ||
  "https://api.notificame.com.br/v1/channels/whatsapp/messages";

const normalizePhone = (value: string) => value.replace(/\D/g, "");

export const isNotificaMeConnection = (connection?: Whatsapp | null) =>
  connection?.channel === "whatsapp" && connection.provider === "notificame";

const SendNotificaMeMessageService = async ({
  body,
  ticket,
  userId
}: Request): Promise<Message> => {
  const connection = await Whatsapp.findByPk(ticket.whatsappId);

  if (!isNotificaMeConnection(connection)) {
    throw new AppError("ERR_UNSUPPORTED_OFFICIAL_WHATSAPP_CONNECTION", 400);
  }

  if (!connection.apiToken || !connection.apiChannelId) {
    throw new AppError("ERR_OFFICIAL_WHATSAPP_CREDENTIALS_REQUIRED", 400);
  }

  const user = userId && (await User.findByPk(userId));
  const formattedBody = formatBody(body, ticket, user);

  try {
    const response = await axios.post(
      endpoint(),
      {
        from: connection.apiChannelId,
        to: normalizePhone(ticket.contact.number),
        contents: [{ type: "text", text: formattedBody }]
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

    await ticket.update({
      lastMessage: formattedBody.substring(0, 255).replace(/\n/g, " ")
    });

    return CreateMessageService({
      messageData: {
        id: `notificame-${providerMessageId}`,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        userId,
        body: formattedBody,
        fromMe: true,
        read: true,
        // The provider accepted it. Delivery/read acknowledgements arrive by webhook.
        ack: 1,
        mediaType: "text",
        channel: "whatsapp",
        dataJson: JSON.stringify(response.data),
        queueId: ticket.queueId
      },
      companyId: ticket.companyId
    });
  } catch (error) {
    logger.error(
      {
        error: error?.response?.data || error?.message,
        ticketId: ticket.id,
        connectionId: connection.id
      },
      "Failed to send NotificaMe WhatsApp message"
    );
    throw new AppError("ERR_SENDING_OFFICIAL_WAPP_MSG", 502);
  }
};

export default SendNotificaMeMessageService;
