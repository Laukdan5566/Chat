import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isCompliant from "../middleware/isCompliant";
import * as TicketParticipantController from "../controllers/TicketParticipantController";

const ticketParticipantRoutes = Router();

ticketParticipantRoutes.get(
  "/tickets/:ticketId/participants",
  isAuth,
  isCompliant,
  TicketParticipantController.index
);

ticketParticipantRoutes.post(
  "/tickets/:ticketId/participants",
  isAuth,
  isCompliant,
  TicketParticipantController.store
);

ticketParticipantRoutes.delete(
  "/tickets/:ticketId/participants/:userId",
  isAuth,
  isCompliant,
  TicketParticipantController.remove
);

export default ticketParticipantRoutes;
