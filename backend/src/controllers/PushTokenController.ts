import { Request, Response } from "express";
import AppError from "../errors/AppError";
import UserPushToken from "../models/UserPushToken";

export const store = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { token, platform = "android", deviceName = null } = req.body;

  if (!token || typeof token !== "string") {
    throw new AppError("ERR_INVALID_PUSH_TOKEN", 400);
  }

  const userId = Number(req.user.id);
  const companyId = Number(req.user.companyId);

  const [pushToken] = await UserPushToken.findOrCreate({
    where: { token },
    defaults: {
      token,
      userId,
      companyId,
      platform,
      deviceName,
      enabled: true,
      lastSeenAt: new Date()
    }
  });

  await pushToken.update({
    userId,
    companyId,
    platform,
    deviceName,
    enabled: true,
    lastSeenAt: new Date()
  });

  return res.status(200).json({
    id: pushToken.id,
    enabled: pushToken.enabled
  });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    throw new AppError("ERR_INVALID_PUSH_TOKEN", 400);
  }

  await UserPushToken.update(
    { enabled: false, lastSeenAt: new Date() },
    {
      where: {
        token,
        userId: Number(req.user.id),
        companyId: Number(req.user.companyId)
      }
    }
  );

  return res.status(204).send();
};
