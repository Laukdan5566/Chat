import { Request, Response } from "express";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import TicketParticipant from "../models/TicketParticipant";
import User from "../models/User";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { hasPermission } from "../helpers/UserPermissions";

export const index = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  await ShowTicketService(ticketId, companyId);

  const participants = await TicketParticipant.findAll({
    where: { ticketId },
    include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }],
    order: [["createdAt", "ASC"]]
  });

  return res.status(200).json(participants.map(item => item.user));
};

export const store = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { userId } = req.body;
  const { companyId } = req.user;

  const requestUser = await User.findByPk(req.user.id);
  if (!hasPermission(requestUser, "ticket-participants:manage")) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const participantUser = await User.findByPk(userId);
  if (!participantUser || participantUser.companyId !== companyId) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  const ticket = await ShowTicketService(ticketId, companyId);

  await TicketParticipant.findOrCreate({
    where: {
      ticketId: ticket.id,
      userId: participantUser.id
    }
  });

  const updatedTicket = await ShowTicketService(ticketId, companyId);

  getIO()
    .to(ticket.id.toString())
    .to(`user-${participantUser.id}`)
    .to(`company-${companyId}-ticket-participants`)
    .emit(`company-${companyId}-ticket`, {
      action: "participantAdded",
      participantUserId: participantUser.id,
      ticket: updatedTicket
    });

  return res.status(200).json(updatedTicket.participants || []);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId, userId } = req.params;
  const { companyId } = req.user;

  const requestUser = await User.findByPk(req.user.id);
  if (!hasPermission(requestUser, "ticket-participants:manage")) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const ticket = await ShowTicketService(ticketId, companyId);

  await TicketParticipant.destroy({
    where: {
      ticketId: ticket.id,
      userId
    }
  });

  const updatedTicket = await ShowTicketService(ticketId, companyId);

  getIO()
    .to(ticket.id.toString())
    .to(`user-${userId}`)
    .to(`company-${companyId}-ticket-participants`)
    .emit(`company-${companyId}-ticket`, {
      action: "participantRemoved",
      participantUserId: Number(userId),
      ticket: updatedTicket
    });

  return res.status(200).json(updatedTicket.participants || []);
};
