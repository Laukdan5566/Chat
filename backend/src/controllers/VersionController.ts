import { Request, Response } from "express";
import GetPublicSettingService from "../services/SettingServices/GetPublicSettingService";
import { GitInfo } from "../gitinfo";

export const version = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const appName = await GetPublicSettingService({ key: "appName" });

  const data = {
    name: !appName || /^ticketz$/i.test(appName.trim()) ? "Chat CRM" : appName,
    ...GitInfo
  };

  return res.status(200).json(data);
};
