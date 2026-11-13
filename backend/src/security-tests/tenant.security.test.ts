const users: Record<number, any> = {};
jest.mock("../models/User", () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn((id: number) => Promise.resolve(users[id] || null)),
    findAll: jest.fn()
  }
}));
jest.mock("../models/Company", () => ({ __esModule: true, default: { findByPk: jest.fn().mockResolvedValue({ id: 1 }) } }));
jest.mock("../services/UserServices/ShowUserService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/UserServices/CreateUserService", () => ({ __esModule: true, default: jest.fn().mockResolvedValue({ id: 99 }) }));
jest.mock("../libs/socket", () => ({ getIO: () => ({ emit: jest.fn() }) }));
jest.mock("../services/UserServices/ListUsersService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/UserServices/DeleteUserService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/UserServices/SimpleListService", () => ({ __esModule: true, default: jest.fn() }));

const chatFindOne = jest.fn();
const chatUserFindOne = jest.fn();
jest.mock("../models/Chat", () => ({ __esModule: true, default: { findOne: (...a: any[]) => chatFindOne(...a), findByPk: jest.fn() } }));
jest.mock("../models/ChatUser", () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => chatUserFindOne(...a), destroy: jest.fn(), create: jest.fn() }
}));

const wppFindOne = jest.fn();
const listFindOne = jest.fn();
const campFindOne = jest.fn();
jest.mock("../models/Whatsapp", () => ({ __esModule: true, default: { findOne: (...a: any[]) => wppFindOne(...a) } }));
jest.mock("../models/ContactList", () => ({ __esModule: true, default: { findOne: (...a: any[]) => listFindOne(...a) } }));
jest.mock("../models/Campaign", () => ({ __esModule: true, default: { findOne: (...a: any[]) => campFindOne(...a) } }));
jest.mock("../services/WhatsappService/ShowWhatsAppService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/WhatsappService/AssociateWhatsappQueue", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../helpers/ChannelPlan", () => ({ assertCompanyCanUseChannel: jest.fn() }));

/* eslint-disable import/first */
import ShowUserService from "../services/UserServices/ShowUserService";
import CreateUserService from "../services/UserServices/CreateUserService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import { store as storeUser } from "../controllers/UserController";
import User from "../models/User";
import AssertChatAccess from "../services/ChatService/AssertChatAccess";
import ChatUser from "../models/ChatUser";
import UpdateChatService from "../services/ChatService/UpdateService";
import Chat from "../models/Chat";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import { assertCampaign, pickCampaignData } from "../services/CampaignService/CampaignGuards";
/* eslint-enable import/first */

const mkUser = (o: any) => ({ permissions: {}, super: false, profile: "user", companyId: 1, update: jest.fn(), $set: jest.fn(), reload: jest.fn(), ...o });

describe("usuários: delegação de users:view", () => {
  const gerente = mkUser({ id: 2, permissions: { "users:view": true } });
  const superAdmin = mkUser({ id: 1, super: true, profile: "admin" });
  beforeEach(() => {
    Object.keys(users).forEach(k => delete users[+k]);
    Object.assign(users, { 1: superAdmin, 2: gerente, 3: mkUser({ id: 3 }) });
  });

  it("quem não é super não altera e-mail e senha do super admin", async () => {
    (ShowUserService as jest.Mock).mockResolvedValue(superAdmin);
    await expect(
      UpdateUserService({ userData: { email: "x@y.z", password: "novasenha" }, userId: 1, requestUserId: 2 })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(superAdmin.update).not.toHaveBeenCalled();
  });

  it("quem não é admin não vira admin nem muda as próprias permissões", async () => {
    (ShowUserService as jest.Mock).mockResolvedValue(gerente);
    await UpdateUserService({
      userData: { profile: "admin", permissions: { "users:view": true, tudo: true } },
      userId: 2,
      requestUserId: 2
    });
    const dados = gerente.update.mock.calls[0][0];
    expect(dados).not.toHaveProperty("profile");
    expect(dados).not.toHaveProperty("permissions");
  });

  it("admin continua podendo definir o perfil de um usuário comum", async () => {
    const admin = mkUser({ id: 4, profile: "admin" });
    users[4] = admin;
    const comum = users[3];
    (ShowUserService as jest.Mock).mockResolvedValue(comum);
    await UpdateUserService({ userData: { profile: "admin" }, userId: 3, requestUserId: 4 });
    expect(comum.update.mock.calls[0][0]).toMatchObject({ profile: "admin" });
  });

  it("criar usuário: quem não é admin só cria perfil comum e sem permissões", async () => {
    (User.findByPk as jest.Mock).mockResolvedValue(gerente);
    const res: any = { status: () => ({ json: jest.fn() }) };
    await storeUser(
      { body: { email: "a@b.c", password: "12345", name: "Fulano", profile: "admin", permissions: { tudo: true } }, user: { id: 2, companyId: 1 } } as any,
      res
    );
    expect((CreateUserService as jest.Mock).mock.calls[0][0]).toMatchObject({ profile: "user", permissions: {} });
  });
});

describe("chat interno", () => {
  const eu = { id: 7, companyId: 1 };

  it("não acha chat de outra empresa", async () => {
    chatFindOne.mockResolvedValue(null);
    await expect(AssertChatAccess(5, eu)).rejects.toMatchObject({ statusCode: 404 });
    expect(chatFindOne.mock.calls[0][0].where).toEqual({ id: 5, companyId: 1 });
  });

  it("recusa quem não é membro nem dono", async () => {
    chatFindOne.mockResolvedValue({ id: 5, ownerId: 9 });
    chatUserFindOne.mockResolvedValue(null);
    await expect(AssertChatAccess(5, eu)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("apagar exige ser o dono", async () => {
    chatFindOne.mockResolvedValue({ id: 5, ownerId: 9 });
    chatUserFindOne.mockResolvedValue({ id: 1 });
    await expect(AssertChatAccess(5, eu, { ownerOnly: true })).rejects.toMatchObject({ statusCode: 403 });
    chatFindOne.mockResolvedValue({ id: 5, ownerId: 7 });
    await expect(AssertChatAccess(5, eu, { ownerOnly: true })).resolves.toBeDefined();
  });

  it("atualizar só inclui membros da empresa do chat e não devolve o usuário inteiro", async () => {
    const record: any = { id: 5, ownerId: 7, update: jest.fn(), reload: jest.fn() };
    (Chat as any).findByPk.mockResolvedValue(record);
    (User as any).findAll.mockResolvedValue([{ id: 8 }]);
    await UpdateChatService({ id: 5, companyId: 1, users: [{ id: 8 }, { id: 999 }] });
    const criados = (ChatUser as any).create.mock.calls.map((c: any) => c[0].userId);
    expect(criados).toEqual([7, 8]);
    expect((User as any).findAll.mock.calls[0][0].where.companyId).toBe(1);
    const include = JSON.stringify(record.reload.mock.calls[0][0].include);
    expect(include).not.toContain('"owner"}');
    expect(record.reload.mock.calls[0][0].include[1].attributes).toEqual(["id", "name"]);
  });
});

describe("conexão de WhatsApp", () => {
  it("não deixa tomar a conexão de outra empresa", async () => {
    const conexao = { id: 5, companyId: 2, provider: "baileys", channel: "whatsapp", update: jest.fn() };
    (ShowWhatsAppService as jest.Mock).mockResolvedValue(conexao);
    await expect(
      UpdateWhatsAppService({ whatsappId: 5, companyId: 1, whatsappData: { name: "abc" } } as any)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(conexao.update).not.toHaveBeenCalled();
  });

  it("na própria empresa atualiza sem regravar companyId", async () => {
    const conexao = { id: 5, companyId: 1, provider: "baileys", channel: "whatsapp", update: jest.fn() };
    (ShowWhatsAppService as jest.Mock).mockResolvedValue(conexao);
    await UpdateWhatsAppService({ whatsappId: 5, companyId: 1, whatsappData: { name: "abc" } } as any);
    expect(conexao.update.mock.calls[0][0]).not.toHaveProperty("companyId");
  });
});

describe("campanhas", () => {
  it("busca a campanha pela empresa de quem chama", async () => {
    campFindOne.mockResolvedValue(null);
    await expect(assertCampaign(3, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(campFindOne.mock.calls[0][0].where).toEqual({ id: 3, companyId: 1 });
  });

  it("descarta mediaPath, mediaName e companyId vindos do corpo", async () => {
    const dados = await pickCampaignData({ name: "x", mediaPath: "../../.env", mediaName: "a", companyId: 9, message1: "oi" }, 1);
    expect(dados).toEqual({ name: "x", message1: "oi" });
  });

  it("recusa conexão e lista de contatos de outra empresa", async () => {
    wppFindOne.mockResolvedValue(null);
    await expect(pickCampaignData({ name: "x", whatsappId: 8 }, 1)).rejects.toMatchObject({ statusCode: 403 });
    wppFindOne.mockResolvedValue({ id: 8 });
    listFindOne.mockResolvedValue(null);
    await expect(pickCampaignData({ name: "x", whatsappId: 8, contactListId: 4 }, 1)).rejects.toMatchObject({ statusCode: 403 });
  });
});
