import { decode } from "jsonwebtoken";

const store = new Map<string, string>();
jest.mock("../libs/cache", () => ({
  cacheLayer: {
    set: jest.fn((k: string, v: string) => { store.set(k, v); return Promise.resolve("OK"); }),
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null))
  }
}));
jest.mock("../config/auth", () => ({
  __esModule: true,
  default: { secret: "s-acesso-de-teste", refreshSecret: "s-refresh-de-teste", expiresIn: "15m", refreshExpiresIn: "7d" }
}));
const showUser = jest.fn();
jest.mock("../services/UserServices/ShowUserService", () => ({ __esModule: true, default: (...a: any[]) => showUser(...a) }));
jest.mock("../models/User", () => ({ __esModule: true, default: {} }));

/* eslint-disable import/first */
import { createRefreshToken } from "../helpers/CreateTokens";
import { revokeRefreshToken } from "../helpers/RevokedRefreshTokens";
import { RefreshTokenService } from "../services/AuthServices/RefreshTokenService";
/* eslint-enable import/first */

const usuario: any = { id: 7, name: "Teste", profile: "user", super: false, companyId: 1, tokenVersion: 2 };

beforeEach(() => {
  store.clear();
  showUser.mockResolvedValue(usuario);
});

describe("refresh token e logout", () => {
  const res: any = { clearCookie: jest.fn() };

  it("cada refresh token traz um identificador próprio", () => {
    const a = decode(createRefreshToken(usuario)) as any;
    const b = decode(createRefreshToken(usuario)) as any;
    expect(a.jti).toBeTruthy();
    expect(a.jti).not.toBe(b.jti);
  });

  it("renova enquanto o token não foi encerrado", async () => {
    const token = createRefreshToken(usuario);
    const out = await RefreshTokenService(res, token);
    expect(out.newToken).toBeTruthy();
  });

  it("depois do logout, a cópia do cookie não renova mais", async () => {
    const token = createRefreshToken(usuario);
    const { jti, exp } = decode(token) as any;
    await revokeRefreshToken(jti, exp);
    await expect(RefreshTokenService(res, token)).rejects.toMatchObject({ statusCode: 401 });
    expect(res.clearCookie).toHaveBeenCalledWith("jrt");
  });

  it("outro token do mesmo usuário continua valendo", async () => {
    const encerrado = createRefreshToken(usuario);
    const outro = createRefreshToken(usuario);
    const { jti, exp } = decode(encerrado) as any;
    await revokeRefreshToken(jti, exp);
    await expect(RefreshTokenService(res, outro)).resolves.toBeDefined();
  });
});
