import axios from "axios";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import FindNotesByContactIdAndTicketId from "../TicketNoteService/FindNotesByContactIdAndTicketId";

type N8nTicketContext = {
  ticketId: number;
  companyId: number;
  expiresAt: number;
};

type N8nAction = Record<string, any>;

const activeTicketContexts = new Map<string, N8nTicketContext>();

export const setN8nTicketContext = (
  token: string,
  ticket: Ticket,
  ttlMs = 5 * 60 * 1000
) => {
  if (!token) return;
  activeTicketContexts.set(token, {
    ticketId: ticket.id,
    companyId: ticket.companyId,
    expiresAt: Date.now() + ttlMs
  });
};

export const getN8nTicketContext = (
  token: string
): N8nTicketContext | null => {
  const context = activeTicketContexts.get(token);

  if (!context) return null;

  if (context.expiresAt < Date.now()) {
    activeTicketContexts.delete(token);
    return null;
  }

  return context;
};

const normalizeResponse = (data: any): N8nAction[] => {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data.filter(Boolean);
  }

  if (Array.isArray(data.output)) {
    return data.output.filter(Boolean);
  }

  if (Array.isArray(data.data)) {
    return data.data.filter(Boolean);
  }

  return [data];
};

const getBackendUrl = () =>
  process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8080}`;

const buildPayload = async (
  ticket: Ticket,
  message: Message,
  whatsapp: Whatsapp
) => {
  const notes = await FindNotesByContactIdAndTicketId({
    ticketId: ticket.id,
    contactId: ticket.contactId
  });

  const internalNotes = notes.slice(0, 10).map(note => ({
    id: note.id,
    note: note.note,
    createdAt: note.createdAt,
    user: note.user
      ? {
          id: note.user.id,
          name: note.user.name
        }
      : null
  }));

  return {
    type: message.mediaType || "text",
    content: message.body || "",
    text: message.body || "",
    mediaUrl: message.mediaUrl,
    ticket_id: ticket.id,
    ticketId: ticket.id,
    token: `${whatsapp.token}:${ticket.id}`,
    internalNotes,
    metadata: {
      backendUrl: getBackendUrl(),
      ticketId: ticket.id,
      companyId: ticket.companyId,
      queueId: ticket.queueId,
      internalNotes,
      from: {
        id: ticket.contactId,
        name: ticket.contact?.name,
        number: ticket.contact?.number
      },
      message: {
        id: message.id,
        mediaType: message.mediaType,
        mediaUrl: message.mediaUrl,
        createdAt: message.createdAt
      }
    }
  };
};

const RunN8nWebhookService = async (
  queue: Queue,
  ticket: Ticket,
  message: Message,
  whatsapp: Whatsapp
): Promise<N8nAction[]> => {
  if (!queue?.n8nWebhookEnabled || !queue?.n8nWebhookUrl) {
    return [];
  }

  setN8nTicketContext(whatsapp.token, ticket);

  try {
    const response = await axios.post(
      queue.n8nWebhookUrl,
      await buildPayload(ticket, message, whatsapp),
      {
        timeout: 120000
      }
    );

    return normalizeResponse(response.data);
  } catch (error) {
    logger.error(
      {
        error: error?.message,
        queueId: queue.id,
        ticketId: ticket.id
      },
      "Failed to call n8n webhook"
    );
    return [];
  }
};

export default RunN8nWebhookService;
