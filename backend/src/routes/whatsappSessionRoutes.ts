import { Router } from "express";
import isAuth from "../middleware/isAuth";
import hasPermission from "../middleware/hasPermission";
import WhatsAppSessionController from "../controllers/WhatsAppSessionController";

const whatsappSessionRoutes = Router();

whatsappSessionRoutes.post(
  "/whatsappsession/:whatsappId",
  isAuth,
  hasPermission("connections-page:actionButtons"),
  WhatsAppSessionController.store
);

whatsappSessionRoutes.put(
  "/whatsappsession/:whatsappId",
  isAuth,
  hasPermission("connections-page:actionButtons"),
  WhatsAppSessionController.update
);

whatsappSessionRoutes.delete(
  "/whatsappsession/:whatsappId",
  isAuth,
  hasPermission("connections-page:actionButtons"),
  WhatsAppSessionController.remove
);

whatsappSessionRoutes.get(
  "/whatsappsession/refresh/:whatsappId",
  isAuth,
  hasPermission("connections-page:actionButtons"),
  WhatsAppSessionController.refresh
);

whatsappSessionRoutes.post(
  "/whatsappsession/capture/:token",
  WhatsAppSessionController.capture
);

whatsappSessionRoutes.post(
  "/whatsappsession/:whatsappId/capture-token",
  isAuth,
  hasPermission("connections-page:actionButtons"),
  WhatsAppSessionController.requestCaptureToken
);

whatsappSessionRoutes.post(
  "/whatsappsession/:whatsappId/reset",
  isAuth,
  hasPermission("connections-page:actionButtons"),
  WhatsAppSessionController.reset
);

export default whatsappSessionRoutes;
