import fs from "fs";
import path from "path";
import { createHmac } from "crypto";

import { isSafeWebhookUrl } from "../helpers/assertSafeWebhookUrl";
import { verifyMetaSignature } from "../controllers/MetaWebhookController";
import User from "../models/User";

jest.mock("../models/Whatsapp", () => ({ __esModule: true, default: {} }));
jest.mock("../services/MetaServices/HandleMetaWebhookService", () => ({ __esModule: true, default: jest.fn() }));

describe("destino de webhook (n8n)", () => {
  it("aceita https de domínio público", () => {
    expect(isSafeWebhookUrl("https://n8n.fpinformatica.com.br/webhook/abc")).toBe(true);
  });

  it.each([
    "http://n8n.exemplo.com/webhook",
    "https://user:senha@n8n.exemplo.com/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://172.20.1.1/x",
    "https://192.168.0.10/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://backend/x",
    "https://redis/x",
    "https://servidor.internal/x",
    "ftp://exemplo.com/x",
    "não é url"
  ])("recusa %s", url => {
    expect(isSafeWebhookUrl(url)).toBe(false);
  });
});

describe("assinatura do webhook da Meta", () => {
  const corpo = Buffer.from('{"object":"page"}');
  const assina = (secret: string) => `sha256=${createHmac("sha256", secret).update(corpo as any).digest("hex")}`;

  it("aceita a assinatura correta", () => {
    expect(verifyMetaSignature("segredo-app", corpo, assina("segredo-app"))).toBe(true);
  });

  it("recusa assinatura errada, ausente ou sem segredo configurado", () => {
    expect(verifyMetaSignature("segredo-app", corpo, assina("outro"))).toBe(false);
    expect(verifyMetaSignature("segredo-app", corpo, "")).toBe(false);
    expect(verifyMetaSignature(undefined, corpo, assina("segredo-app"))).toBe(false);
    expect(verifyMetaSignature("segredo-app", undefined, assina("segredo-app"))).toBe(false);
  });
});

describe("trocar a senha invalida os refresh tokens", () => {
  it("incrementa tokenVersion ao trocar a senha de um usuário existente, não ao criar", async () => {
    const existente: any = { password: "nova-senha-1", isNewRecord: false, tokenVersion: 3 };
    await (User as any).hashPassword(existente);
    expect(existente.tokenVersion).toBe(4);
    expect(existente.passwordHash).toBeTruthy();

    const novo: any = { password: "senha-inicial", isNewRecord: true, tokenVersion: 0 };
    await (User as any).hashPassword(novo);
    expect(novo.tokenVersion).toBe(0);
  });
});

describe("config.json do frontend", () => {
  it("publica só as chaves que o frontend usa, não o ambiente inteiro", () => {
    const dockerfile = fs.readFileSync(path.resolve(__dirname, "../../../frontend/Dockerfile"), "utf8");
    expect(dockerfile).not.toMatch(/<\(env\)/);
    expect(dockerfile).toMatch(/<\(env \| grep -E '\^\(BACKEND_\|FRONTEND_\|REACT_APP_\|RECAPTCHA_SITE_KEY=\|LOG_LEVEL=\)'\)/);
  });
});
