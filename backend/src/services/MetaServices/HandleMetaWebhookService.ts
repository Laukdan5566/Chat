import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import Company from "../../models/Company";
import Contact from "../../models/Contact";
import Plan from "../../models/Plan";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketServiceMeta from "../TicketServices/FindOrCreateTicketServiceMeta";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import { isChannelAllowedByPlan } from "../../helpers/ChannelPlan";

type MetaMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: Array<{ type?: string; payload?: Record<string, unknown> }>;
    is_echo?: boolean;
  };
  postback?: {
    title?: string;
    payload?: string;
  };
};

const supportedChannels = ["facebook", "instagram"];

const normalizeChannel = (objectType?: string) =>
  objectType === "instagram" ? "instagram" : "facebook";

const findConnection = async (channel: string, pageOrIgId: string) => {
  const connection = await Whatsapp.findOne({
    where: {
      channel,
      [Op.or]: [
        { facebookPageUserId: pageOrIgId },
        { facebookUserId: pageOrIgId }
      ]
    },
    include: [
      {
        model: Company,
        as: "company",
        include: [{ model: Plan, as: "plan" }]
      },
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color"]
      }
    ]
  });

  if (connection) return connection;

  return Whatsapp.findOne({
    where: {
      channel,
      status: "CONNECTED"
    },
    include: [
      {
        model: Company,
        as: "company",
        include: [{ model: Plan, as: "plan" }]
      },
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color"]
      }
    ],
    order: [["updatedAt", "DESC"]]
  });
};

const getMessageBody = (messaging: MetaMessaging) => {
  if (messaging.message?.text) return messaging.message.text;
  if (messaging.postback?.title) return messaging.postback.title;
  if (messaging.postback?.payload) return messaging.postback.payload;

  const attachmentType = messaging.message?.attachments?.[0]?.type;
  if (attachmentType) return `[${attachmentType}]`;

  return "";
};

const handleMessaging = async (
  messaging: MetaMessaging,
  channel: string
) => {
  const senderId = messaging.sender?.id;
  const recipientId = messaging.recipient?.id;

  if (!senderId || !recipientId || messaging.message?.is_echo) {
    return;
  }

  if (!supportedChannels.includes(channel)) {
    return;
  }

  const connection = await findConnection(channel, recipientId);

  if (!connection) {
    logger.warn({ channel, recipientId }, "Meta webhook without connection");
    return;
  }

  if (!isChannelAllowedByPlan(connection.company?.plan, channel)) {
    logger.warn(
      { channel, recipientId, companyId: connection.companyId },
      "Meta webhook blocked by company plan"
    );
    return;
  }

  const body = getMessageBody(messaging);

  if (!body) {
    return;
  }

  const contactNumber = `${channel}:${senderId}`;
  let contact = await Contact.findOne({
    where: { number: contactNumber, companyId: connection.companyId }
  });

  if (!contact) {
    contact = await CreateOrUpdateContactService({
      name: `${channel === "instagram" ? "Instagram" : "Facebook"} ${senderId}`,
      number: contactNumber,
      profilePicUrl: "",
      isGroup: false,
      companyId: connection.companyId,
      channel
    });
  }

  const existingTicket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending"]
      },
      contactId: contact.id,
      companyId: connection.companyId,
      channel
    },
    order: [["id", "DESC"]]
  });

  const ticket = await FindOrCreateTicketServiceMeta(
    contact,
    connection.id,
    existingTicket ? existingTicket.unreadMessages + 1 : 1,
    connection.companyId,
    channel
  );

  const [singleQueue] = connection.queues || [];

  if (!ticket.queueId && singleQueue && connection.queues.length === 1) {
    await ticket.update({ queueId: singleQueue.id });
  }

  await ticket.update({
    lastMessage: body.substring(0, 255).replace(/\n/g, " ")
  });

  await CreateMessageService({
    messageData: {
      id:
        messaging.message?.mid ||
        `meta-${channel}-${senderId}-${messaging.timestamp || Date.now()}-${uuidv4()}`,
      ticketId: ticket.id,
      contactId: contact.id,
      body,
      fromMe: false,
      read: false,
      ack: 0,
      mediaType: messaging.message?.attachments?.[0]?.type || "text",
      channel,
      dataJson: JSON.stringify(messaging),
      queueId: ticket.queueId
    },
    companyId: connection.companyId
  });
};

const HandleMetaWebhookService = async (payload: any) => {
  const channel = normalizeChannel(payload?.object);
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const messagingItems = Array.isArray(entry?.messaging)
      ? entry.messaging
      : [];

    for (const messaging of messagingItems) {
      await handleMessaging(messaging, channel);
    }
  }
};

export default HandleMetaWebhookService;
