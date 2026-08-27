import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";

const tokenAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authorization = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization || "";
    const token = authorization
      .replace(/^=?Bearer\s+/i, "")
      .trim()
      .split(":")[0];
    const whatsapp = await Whatsapp.findOne({ where: { token } });
    if (whatsapp) {
      req.params = {
        whatsappId: whatsapp.id.toString()
      };
      req.companyId = whatsapp.companyId;
    } else {
      throw new Error();
    }
  } catch (err) {
    throw new AppError("Acesso não permitido", 401);
  }

  return next();
};

export default tokenAuth;
