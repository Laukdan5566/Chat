import { Request, Response } from "express";
import AppError from "../errors/AppError";
import {
  createPublicSalesRoutingSession,
  getPublicSalesRouting,
  getSalesRoutingConfig,
  saveSalesRoutingConfig
} from "../services/SalesRoutingServices/SalesRoutingService";

export const show = async (req: Request, res: Response): Promise<Response> => {
  const config = await getSalesRoutingConfig(req.user.companyId);
  return res.json(config || { enabled: false, consultants: [] });
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const config = await saveSalesRoutingConfig(req.user.companyId, req.body);
  return res.json(config);
};

export const showForCompany = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const config = await getSalesRoutingConfig(Number(req.params.companyId));
  return res.json(config || { enabled: false, consultants: [] });
};

export const updateForCompany = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const config = await saveSalesRoutingConfig(
    Number(req.params.companyId),
    { enabled: Boolean(req.body?.enabled) }
  );
  return res.json(config);
};

export const publicShow = async (req: Request, res: Response): Promise<Response> => {
  const data = await getPublicSalesRouting(req.params.publicId);
  return res.json(data);
};

export const publicSelect = async (req: Request, res: Response): Promise<Response> => {
  const kind = req.body?.kind;
  if (kind !== "new" && kind !== "consultant") {
    throw new AppError("Op\u00e7\u00e3o inv\u00e1lida", 400);
  }
  const data = await createPublicSalesRoutingSession(
    req.params.publicId,
    kind,
    req.body?.consultantId
  );
  return res.json(data);
};
