import express from "express";
import isAuth from "../middleware/isAuth";
import hasPermission from "../middleware/hasPermission";

import * as WhatsAppController from "../controllers/WhatsAppController";
import * as PrivacyController from "../controllers/PrivacyController";

const whatsappRoutes = express.Router();

whatsappRoutes.get("/whatsapp/", isAuth, WhatsAppController.index);

whatsappRoutes.post(
  "/whatsapp/",
  isAuth,
  hasPermission("connections-page:addConnection"),
  WhatsAppController.store
);

whatsappRoutes.get(
  "/whatsapp/:whatsappId",
  isAuth,
  hasPermission("connections:view"),
  WhatsAppController.show
);

whatsappRoutes.put(
  "/whatsapp/:whatsappId",
  isAuth,
  hasPermission("connections-page:editOrDeleteConnection"),
  WhatsAppController.update
);

whatsappRoutes.delete(
  "/whatsapp/:whatsappId",
  isAuth,
  hasPermission("connections-page:editOrDeleteConnection"),
  WhatsAppController.remove
);

whatsappRoutes.get(
  "/whatsapp/privacy/:whatsappId",
  isAuth,
  hasPermission("connections-page:editOrDeleteConnection"),
  PrivacyController.show
);
whatsappRoutes.put(
  "/whatsapp/privacy/:whatsappId",
  isAuth,
  hasPermission("connections-page:editOrDeleteConnection"),
  PrivacyController.update
);

export default whatsappRoutes;
