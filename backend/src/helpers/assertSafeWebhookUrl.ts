import AppError from "../errors/AppError";

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
];

// Destino de webhook configurável por usuário (n8n): só https para um nome de domínio
// público. Bloqueia credencial na URL, localhost, nomes sem ponto (serviços do docker:
// backend, redis, postgres), IP literal privado/loopback/link-local e qualquer IPv6 literal.
// Limite conhecido: um domínio público que resolva para IP interno (DNS rebinding) não é visto aqui.
export const isSafeWebhookUrl = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (host.includes(":") || host.startsWith("[")) return false;
  if (!host.includes(".")) return false;
  if (/\.(local|localhost|internal|lan|home)$/.test(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some(r => r.test(host))) {
    return false;
  }

  return true;
};

const assertSafeWebhookUrl = (value?: string | null): void => {
  if (value && !isSafeWebhookUrl(value)) {
    throw new AppError("ERR_INVALID_WEBHOOK_URL", 400);
  }
};

export default assertSafeWebhookUrl;
