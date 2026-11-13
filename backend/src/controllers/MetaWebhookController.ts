import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { Op } from "sequelize";
import Whatsapp from "../models/Whatsapp";
import HandleMetaWebhookService from "../services/MetaServices/HandleMetaWebhookService";

// A Meta assina o corpo bruto com o app secret (cabeçalho X-Hub-Signature-256 = sha256=<hmac>).
export const verifyMetaSignature = (
  secret: string | undefined,
  rawBody: Buffer | undefined,
  signature: string
): boolean => {
  if (!secret || !rawBody || !signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody as any).digest("hex");
  const received = signature.slice("sha256=".length);
  return (
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received) as any, Buffer.from(expected) as any)
  );
};

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
  // sem META_APP_SECRET configurado, ou com assinatura inválida, o evento é recusado
  const signature = String(req.get("x-hub-signature-256") || "");
  if (
    !verifyMetaSignature(
      process.env.META_APP_SECRET,
      (req as any).rawBody,
      signature
    )
  ) {
    return res.sendStatus(403);
  }

  await HandleMetaWebhookService(req.body);
  return res.status(200).send("EVENT_RECEIVED");
};
