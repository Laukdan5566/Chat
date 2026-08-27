import { setTimeout as wait } from "timers/promises";
import { v4 as uuidv4 } from "uuid";

import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import ContactCustomField from "../../models/ContactCustomField";
import { logger } from "../../utils/logger";
import CreateMessageService from "../MessageServices/CreateMessageService";
import RunN8nWebhookService from "../N8nServices/RunN8nWebhookService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService, {
  websocketUpdateTicket
} from "../TicketServices/UpdateTicketService";
import CreateTicketNoteService from "../TicketNoteService/CreateTicketNoteService";

const getActionData = (action: any) =>
  action?.type === "command" && action?.data ? action.data : action;

const getActionText = (action: any) => {
  if (action?.type === "message") return action.text || action.content;
  if (action?.type === "text") return action.content || action.text;
  if (action?.message?.content) return action.message.content;
  return null;
};

const getInternalNote = (data: any) =>
  data?.note || data?.internalNote || data?.summary || data?.transferNote;

const createInternalNote = async (ticket: Ticket, note: string) => {
  const user = await User.findOne({
    where: { companyId: ticket.companyId, profile: "admin" }
  });

  if (!user) return;

  await CreateTicketNoteService({
    note,
    userId: user.id,
    contactId: ticket.contactId,
    ticketId: ticket.id
  });
};

const loadAutomationTicket = async (
  ticketId: number,
  companyId: number
): Promise<Ticket | null> =>
  Ticket.findOne({
    where: { id: ticketId, companyId },
    include: ["contact", "queue", "user", "whatsapp"]
  });

export const createWebChatOutboundMessage = async (
  ticket: Ticket,
  body: string
): Promise<Message> => {
  const messageBody = body.trim();
  const message = await CreateMessageService({
    companyId: ticket.companyId,
    messageData: {
      id: uuidv4(),
      ticketId: ticket.id,
      contactId: ticket.contactId,
      body: messageBody,
      fromMe: true,
      read: true,
      ack: 3,
      channel: "webchat",
      queueId: ticket.queueId
    }
  });

  await ticket.update({ lastMessage: messageBody });
  const updatedTicket = await ShowTicketService(ticket.id, ticket.companyId);
  websocketUpdateTicket(updatedTicket);

  return message;
};

export const runWebChatAutomation = async (
  ticketId: number,
  companyId: number,
  message: Message
): Promise<void> => {
  try {
    let ticket = await loadAutomationTicket(ticketId, companyId);

    if (
      !ticket ||
      ticket.channel !== "webchat" ||
      ticket.status === "closed" ||
      (ticket.status === "open" && ticket.userId) ||
      !ticket.queue?.n8nWebhookEnabled ||
      !ticket.queue?.n8nWebhookUrl ||
      !ticket.whatsapp
    ) {
      return;
    }

    const contactContext = await ContactCustomField.findAll({
      where: { contactId: ticket.contactId },
      order: [["id", "ASC"]]
    });
    const originalBody = message.body;
    const contextLines = contactContext
      .filter(field => field.name && field.value)
      .map(field => `${field.name}: ${field.value}`);
    if (contextLines.length > 0) {
      message.setDataValue(
        "body",
        `Contexto do visitante:\n${contextLines.join(
          "\n"
        )}\nSolicitação: ${originalBody}`
      );
    }

    let actions;
    try {
      actions = await RunN8nWebhookService(
        ticket.queue,
        ticket,
        message,
        ticket.whatsapp
      );
    } finally {
      message.setDataValue("body", originalBody);
    }

    for (const action of actions) {
      ticket = await loadAutomationTicket(ticketId, companyId);
      if (!ticket || ticket.status === "closed") return;
      if (ticket.status === "open" && ticket.userId) return;

      const waitSeconds = Number(action?.trigger?.seconds || action?.waitSeconds);
      if (Number.isFinite(waitSeconds) && waitSeconds > 0) {
        await wait(Math.min(waitSeconds, 30) * 1000);
        ticket = await loadAutomationTicket(ticketId, companyId);
        if (!ticket || ticket.status === "closed") return;
        if (ticket.status === "open" && ticket.userId) return;
      }

      const text = getActionText(action);
      if (typeof text === "string" && text.trim()) {
        await createWebChatOutboundMessage(ticket, text);
      }

      const data = getActionData(action);
      const internalNote = getInternalNote(data);
      if (typeof internalNote === "string" && internalNote.trim()) {
        await createInternalNote(ticket, internalNote.trim());
      }

      if (data?.queueId) {
        await UpdateTicketService({
          ticketData: {
            queueId: Number(data.queueId),
            userId: null,
            status: "pending",
            chatbot: false,
            queueOptionId: null
          },
          ticketId,
          companyId,
          dontRunChatbot: true
        });
      }

      if (data?.closeTicket) {
        await UpdateTicketService({
          ticketData: {
            status: "closed",
            justClose: true,
            chatbot: false,
            queueOptionId: null
          },
          ticketId,
          companyId,
          dontRunChatbot: true
        });
      }
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        ticketId,
        companyId
      },
      "Failed to run webchat automation"
    );
  }
};
