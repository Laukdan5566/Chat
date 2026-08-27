import { Request, Response } from "express";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import User from "../models/User";
import AppError from "../errors/AppError";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import CreateTicketNoteService from "../services/TicketNoteService/CreateTicketNoteService";
import { getN8nTicketContext } from "../services/N8nServices/RunN8nWebhookService";
import { createWebChatOutboundMessage } from "../services/WebChatServices/WebChatAutomationService";

const getTokenFromRequest = (req: Request) =>
  (Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization || "")
    .replace(/^=?Bearer\s+/i, "")
    .trim();

const getTicketIdFromToken = (token: string) => {
  const [, ticketId] = token.split(":");
  return ticketId ? Number(ticketId) : null;
};

const getTicketIdFromBody = (body: any, token: string) => {
  const bodyTicketId =
    body.ticketId ||
    body.ticket_id ||
    body.message?.ticketId ||
    body.message?.ticket_id ||
    body.metadata?.ticketId;

  if (bodyTicketId) {
    return Number(bodyTicketId);
  }

  const tokenTicketId = getTicketIdFromToken(token);
  if (tokenTicketId) {
    return tokenTicketId;
  }

  return getN8nTicketContext(token)?.ticketId;
};

const getTicket = async (req: Request) => {
  const token = getTokenFromRequest(req);
  const ticketId = getTicketIdFromBody(req.body, token);

  if (!ticketId) {
    throw new AppError("ERR_TICKET_NOT_INTEGRATION_CONTEXT", 400);
  }

  const ticket = await Ticket.findByPk(ticketId, {
    include: ["contact", "queue", "user", "whatsapp"]
  });

  if (!ticket || ticket.companyId !== req.companyId) {
    throw new AppError("ERR_TICKET_NOT_FOUND", 404);
  }

  return ticket;
};

export const listQueues = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const queues = await Queue.findAll({
    where: { companyId: req.companyId },
    attributes: ["id", "name", "color"],
    order: [["name", "ASC"]]
  });

  return res.json(
    queues.map(queue => ({
      id: queue.id,
      name: queue.name,
      color: queue.color,
      description: queue.name
    }))
  );
};

export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { action } = req.body;
  const ticket = await getTicket(req);

  if (action === "message") {
    const content = req.body.message?.content || req.body.content || "";
    if (!content.trim()) {
      throw new AppError("ERR_EMPTY_MESSAGE", 400);
    }

    if (ticket.channel === "webchat") {
      await createWebChatOutboundMessage(ticket, content);
    } else {
      await SendWhatsAppMessage({ body: content, ticket });
    }
    return res.json({ ok: true });
  }

  if (action === "note") {
    const note = req.body.message?.content || req.body.note || "";
    if (!note.trim()) {
      throw new AppError("ERR_EMPTY_NOTE", 400);
    }

    const user = await User.findOne({
      where: { companyId: req.companyId, profile: "admin" }
    });

    if (!user) {
      throw new AppError("ERR_USER_NOT_FOUND", 404);
    }

    await CreateTicketNoteService({
      note,
      userId: user.id,
      contactId: ticket.contactId,
      ticketId: ticket.id
    });
    return res.json({ ok: true });
  }

  if (action === "transfer") {
    const queueId = Number(req.body.queueId || req.body.message?.queueId);
    const note =
      req.body.note ||
      req.body.internalNote ||
      req.body.summary ||
      req.body.transferNote ||
      req.body.message?.note ||
      req.body.message?.internalNote;
    if (!queueId) {
      throw new AppError("ERR_QUEUE_NOT_FOUND", 400);
    }

    if (note?.trim()) {
      const user = await User.findOne({
        where: { companyId: req.companyId, profile: "admin" }
      });

      if (user) {
        await CreateTicketNoteService({
          note,
          userId: user.id,
          contactId: ticket.contactId,
          ticketId: ticket.id
        });
      }
    }

    await UpdateTicketService({
      ticketData: {
        queueId,
        userId: null,
        status: "pending",
        chatbot: false,
        queueOptionId: null
      },
      ticketId: ticket.id,
      companyId: ticket.companyId,
      dontRunChatbot: true
    });
    return res.json({ ok: true });
  }

  if (action === "close") {
    await UpdateTicketService({
      ticketData: { status: "closed", justClose: true },
      ticketId: ticket.id,
      companyId: ticket.companyId,
      dontRunChatbot: true
    });
    return res.json({ ok: true });
  }

  throw new AppError("ERR_UNSUPPORTED_INTEGRATION_ACTION", 400);
};
