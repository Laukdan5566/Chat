import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import HandleNotificaMeWebhookService from "../services/OfficialWhatsAppServices/HandleNotificaMeWebhookService";

export const notificame = async (req: Request, res: Response): Promise<Response> => {
  const { webhookSecret } = req.params;
  const connection = await Whatsapp.findOne({
    where: {
      provider: "notificame",
      apiWebhookSecret: webhookSecret,
      channel: "whatsapp"
    }
  });

  if (!connection) return res.sendStatus(404);

  await HandleNotificaMeWebhookService(connection, req.body);
  return res.status(200).json({ received: true });
};
