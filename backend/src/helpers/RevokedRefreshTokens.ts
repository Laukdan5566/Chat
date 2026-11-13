import { cacheLayer } from "../libs/cache";

const key = (jti: string) => `revoked-refresh:${jti}`;

// Lista de refresh tokens encerrados (logout). Fica no Redis até o token expirar sozinho.
export const revokeRefreshToken = async (
  jti: string | undefined,
  exp: number | undefined
): Promise<void> => {
  if (!jti) return;
  const ttl = Math.max(60, (exp || 0) - Math.floor(Date.now() / 1000));
  await cacheLayer.set(key(jti), "1", "EX", ttl);
};

export const isRefreshTokenRevoked = async (
  jti: string | undefined
): Promise<boolean> => {
  if (!jti) return false;
  return (await cacheLayer.get(key(jti))) === "1";
};
