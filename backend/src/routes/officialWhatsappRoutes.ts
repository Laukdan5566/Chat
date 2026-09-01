import { Router } from "express";
import * as OfficialWhatsAppWebhookController from "../controllers/OfficialWhatsAppWebhookController";

const officialWhatsappRoutes = Router();

officialWhatsappRoutes.post(
  "/official-whatsapp/notificame/:webhookSecret",
  OfficialWhatsAppWebhookController.notificame
);

export default officialWhatsappRoutes;
