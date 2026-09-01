import { Op } from "sequelize";
import { createHash } from "crypto";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";

type ProviderEvent = Record<string, any>;

const normalizePhone = (value: unknown) => String(value || "").replace(/\D/g, "");

const eventId = (event: ProviderEvent) =>
  String(
    event.id ||
      event.message_id ||
      event.messageId ||
      createHash("sha256").update(JSON.stringify(event)).digest("hex")
  );

const eventList = (payload: ProviderEvent): ProviderEvent[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.messages)) return payload.messages;
  return [payload?.data && typeof payload.data === "object" ? payload.data : payload];
};

const parseContents = (value: unknown): ProviderEvent[] => {
  if (Array.isArray(value)) return value as ProviderEvent[];
  if (typeof value === "string") {
    try {
      return parseContents(JSON.parse(value));
    } catch {
      return [{ type: "text", text: value }];
    }
  }
  if (value && typeof value === "object") return [value as ProviderEvent];
  return [];
};

const getBody = (event: ProviderEvent) => {
  const contents = parseContents(event.contents || event.content || event.message?.contents);
  const content = contents[0] || {};
  const text =
    content.text ||
    content.body ||
    content.fileCaption ||
    event.text ||
    event.body ||
    event.message?.text;

  return {
    body: String(text || (content.type ? `[${content.type}]` : "Mensagem recebida")),
    mediaType: content.type === "file" ? "document" : content.type || "text",
    mediaUrl: content.fileUrl || content.url || undefined
  };
};

const statusToAck = (status: string) => {
  switch (status.toLowerCase()) {
    case "read":
    case "seen":
      return 3;
    case "delivered":
      return 2;
    case "sent":
    case "accepted":
      return 1;
    default:
      return 0;
  }
};

const isIncoming = (event: ProviderEvent) => {
  const direction = String(event.direction || event.message?.direction || "").toUpperCase();
  const type = String(event.event || event.type || event.name || "").toLowerCase();
  return direction === "IN" || direction === "INBOUND" || /received|incoming/.test(type);
};

const isStatusEvent = (event: ProviderEvent) => {
  const status = String(event.status || event.message?.status || "").toLowerCase();
  return ["sent", "accepted", "delivered", "read", "seen", "failed", "undelivered"].includes(status);
};

const updateMessageStatus = async (event: ProviderEvent) => {
  const providerMessageId = eventId(event);
  const message = await Message.findOne({
    where: {
      id: { [Op.in]: [providerMessageId, `notificame-${providerMessageId}`] }
    }
  });

  if (!message) return;

  const status = String(event.status || event.message?.status || "").toLowerCase();
  const failed = ["failed", "undelivered"].includes(status);
  await message.update({
    ack: statusToAck(status),
    error: failed
      ? { code: status || "failed", message: String(event.error?.message || event.error || "Provider delivery failed") }
      : null
  });

  const io = getIO();
  io.to(message.ticketId.toString()).emit(`company-${message.companyId}-appMessage`, {
    action: "update",
    message
  });
};

const handleIncoming = async (connection: Whatsapp, event: ProviderEvent) => {
  const sender = normalizePhone(event.from || event.sender?.phone || event.contact?.phone);
  if (!sender) {
    logger.warn({ connectionId: connection.id, event }, "NotificaMe webhook without sender");
    return;
  }

  const externalId = `notificame-${eventId(event)}`;
  if (await Message.findOne({ where: { id: externalId } })) return;

  const { body, mediaType, mediaUrl } = getBody(event);
  let contact = await Contact.findOne({
    where: { number: sender, companyId: connection.companyId }
  });

  if (!contact) {
    contact = await CreateOrUpdateContactService({
      name: String(event.profile?.name || event.contact?.name || sender),
      number: sender,
      profilePicUrl: "",
      isGroup: false,
      companyId: connection.companyId,
      channel: "whatsapp"
    });
  }

  const { ticket } = await FindOrCreateTicketService(
    contact,
    connection.id,
    connection.companyId,
    { incrementUnread: true }
  );

  const queues = (await connection.$get("queues", {
    attributes: ["id", "name", "color"]
  })) as Queue[];
  if (!ticket.queueId && queues.length === 1) {
    await ticket.update({ queueId: queues[0].id });
  }

  await ticket.update({ lastMessage: body.substring(0, 255).replace(/\n/g, " ") });

  await CreateMessageService({
    messageData: {
      id: externalId,
      ticketId: ticket.id,
      contactId: contact.id,
      body,
      fromMe: false,
      read: false,
      ack: 0,
      mediaType,
      mediaUrl,
      channel: "whatsapp",
      dataJson: JSON.stringify(event),
      queueId: ticket.queueId
    },
    companyId: connection.companyId
  });
};

const HandleNotificaMeWebhookService = async (
  connection: Whatsapp,
  payload: ProviderEvent
) => {
  for (const event of eventList(payload)) {
    if (isIncoming(event)) {
      await handleIncoming(connection, event);
    } else if (isStatusEvent(event)) {
      await updateMessageStatus(event);
    } else {
      logger.debug({ connectionId: connection.id, event }, "Ignored NotificaMe webhook event");
    }
  }
};

export default HandleNotificaMeWebhookService;
