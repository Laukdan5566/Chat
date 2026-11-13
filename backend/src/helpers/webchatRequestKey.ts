import { Request } from "express";

// O cabeçalho x-webchat-client-ip só vale quando a assinatura do proxy é exigida; sem
// WEBCHAT_PROXY_SECRET qualquer cliente poderia inventá-lo e escapar do limite.
const requestKey = (req: Request, suffix: string): string =>
  `${
    (process.env.WEBCHAT_PROXY_SECRET?.trim() && req.get("x-webchat-client-ip")) ||
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  }:${suffix}`;

export default requestKey;
