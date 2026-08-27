import { Request, Response } from "express";
import { Op } from "sequelize";
import Whatsapp from "../models/Whatsapp";
import HandleMetaWebhookService from "../services/MetaServices/HandleMetaWebhookService";

const getVerifyToken = (req: Request) =>
  String(
    req.query["hub.verify_token"] ||
      req.query.verify_token ||
      req.query.verifyToken ||
      ""
  );

export const verify = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const mode = String(req.query["hub.mode"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const verifyToken = getVerifyToken(req);
  const envToken = process.env.META_VERIFY_TOKEN;

  const tokenMatchesEnv = Boolean(envToken && verifyToken === envToken);
  const tokenMatchesConnection = Boolean(
    verifyToken &&
      (await Whatsapp.findOne({
        where: {
          channel: { [Op.in]: ["facebook", "instagram"] },
          token: verifyToken
        }
      }))
  );

  if (mode === "subscribe" && challenge && (tokenMatchesEnv || tokenMatchesConnection)) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

export const receive = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await HandleMetaWebhookService(req.body);
  return res.status(200).send("EVENT_RECEIVED");
};
