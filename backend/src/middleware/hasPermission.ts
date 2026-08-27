import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";
import { hasPermission as can } from "../helpers/UserPermissions";

const hasPermission = (permission: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const user = await User.findByPk(req.user.id);

    if (!can(user, permission)) {
      throw new AppError("Acesso não permitido", 403);
    }

    return next();
  };
};

export default hasPermission;
