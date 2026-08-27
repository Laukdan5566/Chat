import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";

import AuthUserService from "../services/UserServices/AuthUserService";
import CreateCompanyService from "../services/CompanyService/CreateCompanyService";
import { SendRefreshToken } from "../helpers/SendRefreshToken";
import { RefreshTokenService } from "../services/AuthServices/RefreshTokenService";
import FindUserFromToken from "../services/AuthServices/FindUserFromToken";
import User from "../models/User";
import { SerializeUser } from "../helpers/SerializeUser";
import { createAccessToken, createRefreshToken } from "../helpers/CreateTokens";
import Company from "../models/Company";
import Plan from "../models/Plan";
import Setting from "../models/Setting";
import Translation from "../models/Translation";
import { decodeRefreshToken } from "../helpers/DecodeRefreshToken";
import UserSocketSession from "../models/UserSocketSession";
import detectDeviceType, { DeviceType } from "../helpers/DetectDeviceType";

type SessionPolicy = "keep" | "replaceLast" | "replaceAll";

type SaasLoginPayload = {
  ticketzCompanyId?: string | number;
  companyName?: string;
  companyPhone?: string;
  companyEmail?: string;
  ticketzUserName?: string;
  ticketzUserEmail?: string;
  ticketzUserProfile?: string;
  ticketzUserPermissions?: Record<string, boolean>;
};

const companyInclude = [
  { model: Setting },
  {
    model: Plan,
    as: "plan",
    attributes: ["id", "name", "facebookEnabled", "instagramEnabled"]
  }
];

const userInclude = [
  "queues",
  {
    model: Company,
    include: companyInclude
  }
];

const defaultSaasPermissions = {
  "tickets-manager:showall": true,
  "tickets-manager:showQueueTickets": true,
  "ticket-participants:view": true,
  "ticket-participants:sendMessage": true,
  "connections:view": true
};

const htmlValue = (value: string) => JSON.stringify(value);

const loadCompany = (id: number) =>
  Company.findByPk(id, { include: companyInclude });

const ensureSaasCompany = async (
  payload: SaasLoginPayload
): Promise<Company> => {
  const ticketzCompanyId = Number(payload.ticketzCompanyId || 0);
  if (ticketzCompanyId) {
    const company = await loadCompany(ticketzCompanyId);
    if (company) return company;
  }

  const companyName = String(payload.companyName || "").trim();
  if (!companyName) throw new AppError("ERR_SAAS_COMPANY_MISSING", 400);

  const existing = await Company.findOne({
    where: { name: companyName },
    include: companyInclude
  });
  if (existing) return existing;

  const plan = await Plan.findOne({ order: [["id", "ASC"]] });
  const userEmail = String(
    payload.ticketzUserEmail ||
      `vib-${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@correacloud.local`
  )
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const company = await CreateCompanyService({
    name: companyName,
    phone: payload.companyPhone || "",
    email: userEmail,
    password: randomBytes(18).toString("hex"),
    status: true,
    planId: plan?.id,
    dueDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
    recurrence: "monthly",
    language: "pt_BR"
  });

  const loaded = await loadCompany(company.id);
  if (!loaded) throw new AppError("ERR_SAAS_COMPANY_CREATE_FAILED", 500);
  return loaded;
};

const ensureSaasUser = async (
  payload: SaasLoginPayload,
  company: Company
): Promise<User> => {
  const email = String(
    payload.ticketzUserEmail || `vib-${company.id}@correacloud.local`
  )
    .trim()
    .toLowerCase();
  const name = String(payload.ticketzUserName || `Atendimento ${company.name}`).trim();
  const profile = String(payload.ticketzUserProfile || "admin").trim();
  const permissions = {
    ...defaultSaasPermissions,
    ...(payload.ticketzUserPermissions || {})
  };

  let user = await User.findOne({ where: { email }, include: userInclude });
  if (!user) {
    user = await User.create(
      {
        email,
        name,
        password: randomBytes(18).toString("hex"),
        profile,
        super: false,
        companyId: company.id,
        permissions
      },
      { include: ["queues", "company"] }
    );
  } else {
    await user.update({ name, profile, super: false, companyId: company.id, permissions });
  }

  await user.reload({ include: userInclude });
  return user;
};

const closeUserSessions = async (
  sessions: UserSocketSession[],
  userId: number,
  companyId: number,
  email: string
) => {
  const io = getIO();

  await Promise.all(
    sessions.map(async session => {
      io.to(session.id).emit(`company-${companyId}-auth`, {
        action: "update",
        user: {
          id: userId,
          email,
          companyId
        }
      });
      await session.update({ active: false });
      setTimeout(() => {
        io.sockets.sockets.get(session.id)?.disconnect(true);
      }, 1000);
    })
  );
};

const resolveSessionPolicy = (value: string): SessionPolicy => {
  if (value === "keep" || value === "replaceAll") {
    return value;
  }

  return "replaceLast";
};

const applyLoginSessionPolicy = async ({
  userId,
  companyId,
  email,
  deviceType,
  policy
}: {
  userId: number;
  companyId: number;
  email: string;
  deviceType: DeviceType;
  policy: SessionPolicy;
}) => {
  if (policy === "keep") {
    return;
  }

  if (policy === "replaceAll") {
    const sessions = await UserSocketSession.findAll({
      where: { userId, active: true },
      order: [["updatedAt", "DESC"]]
    });

    await closeUserSessions(sessions, userId, companyId, email);
    return;
  }

  const activeSessions = await UserSocketSession.findAll({
    where: { userId, active: true, deviceType },
    order: [["updatedAt", "DESC"]]
  });

  if (!activeSessions.length) {
    return;
  }

  const sessionsToClose = activeSessions.slice(0, 1);

  await closeUserSessions(sessionsToClose, userId, companyId, email);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { email, password } = req.body;
  const sessionPolicy = resolveSessionPolicy(req.body?.sessionPolicy);

  const langs = await Translation.findAll({
    attributes: ["language"],
    group: ["language"]
  });

  const availableLanguages = langs.map(l => l.language.replace(/_/g, "-"));

  const language = (req.acceptsLanguages(availableLanguages) || null)?.replace(
    /-/g,
    "_"
  );

  const { token, serializedUser, refreshToken } = await AuthUserService({
    email,
    password,
    language
  });
  const deviceType = detectDeviceType(String(req.headers["user-agent"] || ""));

  SendRefreshToken(res, refreshToken);

  await applyLoginSessionPolicy({
    userId: serializedUser.id,
    companyId: serializedUser.companyId,
    email: serializedUser.email,
    deviceType,
    policy: sessionPolicy
  });

  return res.status(200).json({
    token,
    user: serializedUser
  });
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const token: string = req.cookies.jrt;

  if (!token) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  const { user, newToken, refreshToken } = await RefreshTokenService(
    res,
    token
  );

  SendRefreshToken(res, refreshToken);

  return res.json({ token: newToken, user });
};

export const me = async (req: Request, res: Response): Promise<Response> => {
  const token: string = req.cookies.jrt;
  const user = await FindUserFromToken(token);
  const { id, profile, email, super: superAdmin, permissions } = user;

  if (!token) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  return res.json({ id, profile, email, super: superAdmin, permissions });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  res.clearCookie("jrt");

  return res.send();
};

export const impersonate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const token: string = req.cookies.jrt;
  const { companyId } = req.params;

  if (!token) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  const currentRefreshTokenData = decodeRefreshToken(token);

  if (currentRefreshTokenData.impersonated) {
    throw new AppError("ERR_ALREADY_IMPERSONATING", 400);
  }

  const user = await User.findOne({
    where: { companyId: Number(companyId), profile: "admin" },
    include: [
      "queues",
      {
        model: Company,
        include: [
          { model: Setting },
          {
            model: Plan,
            as: "plan",
            attributes: ["id", "name", "facebookEnabled", "instagramEnabled"]
          }
        ]
      }
    ]
  });

  if (!user) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  const metadata = {
    originalUserId: Number(req.user.id),
    originalCompanyId: Number(req.user.companyId)
  };

  const newToken = createAccessToken(user, {
    impersonated: true,
    ...metadata
  });
  const refreshToken = createRefreshToken(user, {
    impersonated: true,
    ...metadata
  });
  const serializedUser = await SerializeUser(user);

  SendRefreshToken(res, refreshToken);

  const io = getIO();
  io.to(`user-${serializedUser.id}`).emit(
    `company-${serializedUser.companyId}-auth`,
    {
      action: "update",
      user: {
        id: serializedUser.id,
        email: serializedUser.email,
        companyId: serializedUser.companyId,
        impersonated: true
      }
    }
  );

  return res.status(200).json({
    token: newToken,
    user: serializedUser
  });
};

export const saasLogin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const token = String(req.query.token || "");
  const secret = process.env.TICKETZ_SSO_SECRET;

  if (!secret) throw new AppError("ERR_SAAS_SSO_NOT_CONFIGURED", 500);
  if (!token) throw new AppError("ERR_SAAS_SSO_TOKEN_MISSING", 401);

  let payload: SaasLoginPayload;
  try {
    const decoded = verify(token, secret, {
      audience: "vib-chat",
      issuer: "vib-saas"
    });
    if (!decoded || typeof decoded === "string") throw new Error("invalid payload");
    payload = decoded as SaasLoginPayload;
  } catch {
    throw new AppError("ERR_SAAS_SSO_INVALID", 401);
  }

  const company = await ensureSaasCompany(payload);
  const user = await ensureSaasUser(payload, company);
  const newToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);
  const serializedUser = await SerializeUser(user);

  SendRefreshToken(res, refreshToken);
  res.setHeader("Cache-Control", "no-store");

  return res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Vib Atendimento</title>
  </head>
  <body>
    <script>
      localStorage.setItem("token", ${htmlValue(JSON.stringify(newToken))});
      localStorage.setItem("companyId", ${htmlValue(String(serializedUser.companyId))});
      localStorage.setItem("userId", ${htmlValue(String(serializedUser.id))});
      localStorage.setItem("impersonated", "false");
      window.location.replace("/tickets");
    </script>
  </body>
</html>`);
};

export const backToSuper = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const token: string = req.cookies.jrt;

  if (!token) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }

  const refreshTokenData = decodeRefreshToken(token);

  if (!refreshTokenData.impersonated || !refreshTokenData.originalUserId) {
    throw new AppError("ERR_NOT_IMPERSONATING", 400);
  }

  const originalUser = await User.findByPk(refreshTokenData.originalUserId, {
    include: [
      "queues",
      {
        model: Company,
        include: [
          { model: Setting },
          {
            model: Plan,
            as: "plan",
            attributes: ["id", "name", "facebookEnabled", "instagramEnabled"]
          }
        ]
      }
    ]
  });

  if (!originalUser || !originalUser.super) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  const newToken = createAccessToken(originalUser);
  const newRefreshToken = createRefreshToken(originalUser);
  const serializedUser = await SerializeUser(originalUser);

  SendRefreshToken(res, newRefreshToken);

  return res.status(200).json({
    token: newToken,
    user: serializedUser
  });
};
