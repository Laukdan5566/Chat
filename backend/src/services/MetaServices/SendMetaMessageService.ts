import axios from "axios";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import formatBody from "../../helpers/Mustache";
import CreateMessageService from "../MessageServices/CreateMessageService";
import User from "../../models/User";
import { logger } from "../../utils/logger";

type Request = {
  body: string;
  ticket: Ticket;
  userId?: number;
};

const graphVersion = () => process.env.META_GRAPH_VERSION || "v23.0";

const getAccessToken = (connection: Whatsapp) =>
  connection.tokenMeta || connection.facebookUserToken;

const getSendUrl = (connection: Whatsapp) => {
  if (connection.channel === "instagram" && connection.facebookUserId) {
    return `https://graph.instagram.com/${graphVersion()}/${connection.facebookUserId}/messages`;
  }

  if (connection.facebookPageUserId) {
    return `https://graph.facebook.com/${graphVersion()}/${connection.facebookPageUserId}/messages`;
  }

  return `https://graph.facebook.com/${graphVersion()}/me/messages`;
};

const SendMetaMessageService = async ({
  body,
  ticket,
  userId
}: Request): Promise<Message> => {
  const connection = await Whatsapp.findByPk(ticket.whatsappId);

  if (!connection) {
    throw new AppError("ERR_WAPP_NOT_FOUND");
  }

  if (!["facebook", "instagram"].includes(connection.channel)) {
    throw new AppError("ERR_UNSUPPORTED_CHANNEL", 400);
  }

  const accessToken = getAccessToken(connection);

  if (!accessToken) {
    throw new AppError("ERR_META_TOKEN_NOT_CONFIGURED", 400);
  }

  const user = userId && (await User.findByPk(userId));
  const formattedBody = formatBody(body, ticket, user);

  try {
    const response = await axios.post(
      getSendUrl(connection),
      {
        recipient: { id: ticket.contact.number.replace(/^(facebook|instagram):/, "") },
        message: { text: formattedBody },
        messaging_type: "RESPONSE"
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const messageId =
      response.data?.message_id ||
      response.data?.messageId ||
      `meta-${connection.channel}-${Date.now()}`;

    await ticket.update({
      lastMessage: formattedBody.substring(0, 255).replace(/\n/g, " ")
    });

    return CreateMessageService({
      messageData: {
        id: String(messageId),
        ticketId: ticket.id,
        userId,
        body: formattedBody,
        fromMe: true,
        read: true,
        ack: 2,
        mediaType: "text",
        channel: connection.channel,
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
        connectionId: connection.id,
        channel: connection.channel
      },
      "Failed to send Meta message"
    );
    throw new AppError("ERR_SENDING_META_MSG", 500);
  }
};

export default SendMetaMessageService;
