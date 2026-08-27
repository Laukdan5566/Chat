import { Router } from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import isAuth from "../middleware/isAuth";
import hasPermission from "../middleware/hasPermission";
import * as WhatsAppStatusController from "../controllers/WhatsAppStatusController";

const whatsappStatusRoutes = Router();
const upload = multer(uploadConfig);
const canManageStatus = hasPermission("connections-page:editOrDeleteConnection");

whatsappStatusRoutes.get(
  "/whatsapp-status/connections",
  isAuth,
  canManageStatus,
  WhatsAppStatusController.connections
);
whatsappStatusRoutes.get(
  "/whatsapp-status/:whatsappId/contacts",
  isAuth,
  canManageStatus,
  WhatsAppStatusController.contacts
);
whatsappStatusRoutes.get(
  "/whatsapp-status/history",
  isAuth,
  canManageStatus,
  WhatsAppStatusController.history
);
whatsappStatusRoutes.post(
  "/whatsapp-status",
  isAuth,
  canManageStatus,
  upload.single("media"),
  WhatsAppStatusController.publish
);

export default whatsappStatusRoutes;
