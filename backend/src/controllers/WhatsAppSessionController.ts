import { Request, Response } from "express";
import {
  createCaptureToken,
  getWbot,
  removeWbot,
  resolvePasskeyToken
} from "../libs/wbot";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import ImportWhatsAppSessionService from "../services/WbotServices/ImportWhatsAppSessionService";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import { logger } from "../utils/logger";
import BaileysKeys from "../models/BaileysKeys";

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  await StartWhatsAppSession(whatsapp, companyId);

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const { whatsapp } = await UpdateWhatsAppService({
    whatsappId,
    companyId,
    whatsappData: { session: "" }
  });

  if (whatsapp.channel === "whatsapp") {
    await StartWhatsAppSession(whatsapp, companyId);
  }

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  if (whatsapp.channel === "whatsapp") {
    const wbot = getWbot(whatsapp.id);
    wbot.logout();
    wbot.ws.close();
  }

  if (whatsapp.channel === "facebook" || whatsapp.channel === "instagram") {
    whatsapp.destroy();
  }

  return res.status(200).json({ message: "Session disconnected." });
};

const refresh = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  if (whatsapp.channel === "whatsapp") {
    const wbot = getWbot(whatsapp.id);
    if (!wbot) {
      return res.status(404).json({ message: "Session not found." });
    }
    await wbot.ws.close();
    return res.status(200).json({ message: "Session refreshed." });
  }

  return res.status(400).json({ message: "Session not supported." });
};

const requestCaptureToken = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  const token = createCaptureToken(whatsapp.id);

  try {
    const wbot = getWbot(whatsapp.id);
    wbot.ev.removeAllListeners("connection.update");
    wbot.end(null);
  } catch {
    // no active socket to terminate
  }

  await whatsapp.update({
    status: "passkey_required",
    qrcode: token,
    retries: 0
  });

  const io = getIO();
  io.to(`company-${whatsapp.companyId}-admin`).emit(
    `company-${whatsapp.companyId}-whatsappSession`,
    {
      action: "update",
      session: whatsapp
    }
  );

  return res.status(200).json({ token });
};

const reset = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (whatsapp && whatsapp.companyId !== companyId) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  await removeWbot(whatsapp.id, false);
  await BaileysKeys.destroy({ where: { whatsappId: whatsapp.id } });
  await whatsapp.update({
    status: "DISCONNECTED",
    qrcode: "",
    session: "",
    retries: 0
  });

  const io = getIO();
  io.to(`company-${whatsapp.companyId}-admin`).emit(
    `company-${whatsapp.companyId}-whatsappSession`,
    {
      action: "update",
      session: whatsapp
    }
  );

  return res.status(200).json({ message: "Session reset." });
};

const capture = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;
  const whatsappId = resolvePasskeyToken(token);

  if (!whatsappId) {
    return res
      .status(404)
      .json({ message: "Invalid or expired capture token." });
  }

  const whatsapp = await ShowWhatsAppService(whatsappId.toString());
  if (!whatsapp) {
    return res.status(404).json({ message: "Session not found." });
  }

  const dump = req.body;
  if (!dump || typeof dump !== "object") {
    return res.status(400).json({ message: "Invalid dump payload." });
  }

  const io = getIO();

  try {
    await whatsapp.update({
      status: "IMPORTING",
      qrcode: ""
    });

    io.to(`company-${whatsapp.companyId}-admin`).emit(
      `company-${whatsapp.companyId}-whatsappSession`,
      {
        action: "update",
        session: whatsapp
      }
    );

    await removeWbot(whatsapp.id, false);
    await ImportWhatsAppSessionService(whatsapp, dump);

    await whatsapp.update({ status: "PENDING" });
    io.to(`company-${whatsapp.companyId}-admin`).emit(
      `company-${whatsapp.companyId}-whatsappSession`,
      {
        action: "update",
        session: whatsapp
      }
    );

    setTimeout(async () => {
      try {
        await StartWhatsAppSession(whatsapp, whatsapp.companyId);
      } catch (startErr) {
        logger.error(
          { err: startErr, whatsappId: whatsapp.id },
          "Failed to start imported session"
        );
      }
    }, 5000);

    return res.status(200).json({
      message: "Session dump received and imported."
    });
  } catch (err: any) {
    logger.error({ err, whatsappId: whatsapp.id }, "Failed to import dump");
    await whatsapp.update({ status: "DISCONNECTED", qrcode: "", session: "" });
    await BaileysKeys.destroy({ where: { whatsappId: whatsapp.id } });
    io.to(`company-${whatsapp.companyId}-admin`).emit(
      `company-${whatsapp.companyId}-whatsappSession`,
      {
        action: "update",
        session: whatsapp
      }
    );
    return res
      .status(500)
      .json({ message: err.message || "Failed to process dump." });
  }
};

export default {
  store,
  remove,
  update,
  refresh,
  capture,
  requestCaptureToken,
  reset
};
