import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";

import "./database";
import path from "path";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import { logger } from "./utils/logger";
import { messageQueue, sendScheduledMessages } from "./queues";
import { corsOrigin } from "./helpers/corsOrigin";

class SystemError extends Error {
  code?: string;
}

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();
const requireHttps = process.env.REQUIRE_HTTPS === "true";

app.set("trust proxy", 1);

const firstHeaderValue = (
  value: string | string[] | undefined
): string | undefined => (Array.isArray(value) ? value[0] : value);

const validateHttpsUrl = (name: string, value?: string): void => {
  if (!value) {
    throw new Error(`${name} must be set when REQUIRE_HTTPS=true`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL when REQUIRE_HTTPS=true`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use https when REQUIRE_HTTPS=true`);
  }
};

if (requireHttps) {
  validateHttpsUrl("BACKEND_URL", process.env.BACKEND_URL);
  validateHttpsUrl("FRONTEND_URL", process.env.FRONTEND_URL);
}

const isLocalRequest = (req: Request): boolean => {
  const host = firstHeaderValue(req.headers.host)?.split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

const requestUsesHttps = (req: Request): boolean => {
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"]);
  const forwardedSsl = firstHeaderValue(req.headers["x-forwarded-ssl"]);

  return (
    req.secure ||
    forwardedProto?.split(",")[0]?.trim() === "https" ||
    forwardedSsl === "on"
  );
};

app.set("queues", {
  messageQueue,
  sendScheduledMessages
});

app.use((req, res, next) => {
  if (!requireHttps || requestUsesHttps(req) || isLocalRequest(req)) {
    return next();
  }

  return res.status(403).json({ error: "HTTPS required" });
});

app.use(
  cors({
    credentials: true,
    origin: corsOrigin,
    exposedHeaders: ["Content-Range", "X-Content-Range", "Date"]
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(Sentry.Handlers.requestHandler());
app.get("/public/*", (req, res) => {
  const filePath = path.join(uploadConfig.directory, req.params[0]);

  if (filePath.endsWith(".aac")) {
    res.setHeader("Content-Type", "audio/aac");
  }

  res.download(filePath, (err: SystemError) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.status(404).end();
      } else {
        logger.debug(
          { err },
          `Error downloading file ${req.params[0]}: ${err.message}`
        );
        res.status(500).end();
      }
    }
  });
});

app.use((req, _res, next) => {
  const { method, url, query, body, headers } = req;
  const safeBody =
    body && typeof body === "object"
      ? {
          ...body,
          apiToken: body.apiToken ? "[REDACTED]" : undefined,
          token: body.token ? "[REDACTED]" : undefined,
          tokenMeta: body.tokenMeta ? "[REDACTED]" : undefined,
          facebookUserToken: body.facebookUserToken ? "[REDACTED]" : undefined
        }
      : body;
  const safeHeaders = {
    ...headers,
    authorization: headers.authorization ? "[REDACTED]" : undefined,
    cookie: headers.cookie ? "[REDACTED]" : undefined
  };
  logger.trace(
    { method, url, query, body: safeBody, headers: safeHeaders },
    `Incoming request: ${req.method} ${req.url}`
  );
  next();
});

app.use(routes);

app.use(Sentry.Handlers.errorHandler());
app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger[err.level](err);
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
