import fs from "fs";
import path from "path";

const m = {
  ticketFindOne: jest.fn(), contactFindOne: jest.fn(), noteFindByPk: jest.fn(),
  qmFindOne: jest.fn(), tagFindAll: jest.fn(), userFindByPk: jest.fn(), userFindOne: jest.fn(),
  settingFindOne: jest.fn(), waFindOne: jest.fn()
};
jest.mock("../models/Ticket", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.ticketFindOne(...a) } }));
jest.mock("../models/Contact", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.contactFindOne(...a) } }));
jest.mock("../models/TicketNote", () => ({ __esModule: true, default: { findByPk: (...a: any[]) => m.noteFindByPk(...a) } }));
jest.mock("../models/QuickMessage", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.qmFindOne(...a) } }));
jest.mock("../models/Tag", () => ({ __esModule: true, default: { findAll: (...a: any[]) => m.tagFindAll(...a) } }));
jest.mock("../models/User", () => ({ __esModule: true, default: { findByPk: (...a: any[]) => m.userFindByPk(...a), findOne: (...a: any[]) => m.userFindOne(...a) } }));
jest.mock("../models/Setting", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.settingFindOne(...a) } }));
jest.mock("../models/Whatsapp", () => ({ __esModule: true, default: {} }));
jest.mock("../models/Queue", () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock("../models/Schedule", () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock("../models/ContactTag", () => ({ __esModule: true, default: { destroy: jest.fn(), bulkCreate: jest.fn() } }));
jest.mock("../models/TicketTag", () => ({ __esModule: true, default: { destroy: jest.fn(), bulkCreate: jest.fn() } }));
jest.mock("../helpers/CheckSettings", () => ({ __esModule: true, default: jest.fn(), GetCompanySetting: jest.fn().mockResolvedValue("ticket") }));
jest.mock("../services/ContactServices/ShowContactService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/ContactServices/UpdateContactService", () => ({ __esModule: true, websocketUpdateContact: jest.fn() }));
jest.mock("../services/TicketServices/ShowTicketService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/TicketServices/UpdateTicketService", () => ({ __esModule: true, websocketUpdateTicket: jest.fn() }));
jest.mock("../services/MessageServices/CreateMessageService", () => ({ __esModule: true, default: jest.fn() }));
// controllers
jest.mock("async-mutex", () => ({ Mutex: class {} }));
jest.mock("../libs/socket", () => ({ getIO: () => ({ to: () => ({ emit: jest.fn() }), emit: jest.fn() }) }));
["CreateTicketService", "DeleteTicketService", "ListTicketsService", "ShowTicketFromUUIDService", "UpdateTicketService", "ListTicketsServiceKanban"].forEach(n =>
  jest.doMock(`../services/TicketServices/${n}`, () => ({ __esModule: true, default: jest.fn(), websocketUpdateTicket: jest.fn() }))
);
jest.mock("../services/UserServices/ShowUserService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/HelpdeskServices/CreateHelpdeskTicketService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/SettingServices/UpdateSettingService", () => ({ __esModule: true, default: jest.fn().mockResolvedValue({}) }));
jest.mock("../services/SettingServices/ListSettingsService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/SettingServices/GetPublicSettingService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/PrivacyService/ShowPrivacyService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/PrivacyService/UpdatePrivacyWhatsapp", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/WhatsappService/ShowWhatsAppService", () => ({ __esModule: true, default: jest.fn() }));

/* eslint-disable import/first */
import { assertNoteInCompany } from "../services/TicketNoteService/TicketNoteScope";
import QmShow from "../services/QuickMessageService/ShowService";
import QmUpdate from "../services/QuickMessageService/UpdateService";
import QmDelete from "../services/QuickMessageService/DeleteService";
import SyncTags from "../services/TagServices/SyncTagsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import TicketTag from "../models/TicketTag";
import ScheduleCreate from "../services/ScheduleServices/CreateService";
import { GetSettingService } from "../services/SettingServices/GetSettingService";
import { update as updateSetting } from "../controllers/SettingController";
import { remove as removeTicket } from "../controllers/TicketController";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import { show as showPrivacy } from "../controllers/PrivacyController";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
/* eslint-enable import/first */

describe("notas de ticket", () => {
  it("nota de ticket de outra empresa não é encontrada", async () => {
    m.noteFindByPk.mockResolvedValue({ id: 3, ticketId: 5 });
    m.ticketFindOne.mockResolvedValue(null);
    await expect(assertNoteInCompany(3, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(m.ticketFindOne.mock.calls[0][0].where).toEqual({ id: 5, companyId: 1 });
  });

  it("nota sem ticket vale pelo contato", async () => {
    m.noteFindByPk.mockResolvedValue({ id: 3, ticketId: 0, contactId: 8 });
    m.contactFindOne.mockResolvedValue(null);
    await expect(assertNoteInCompany(3, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(m.contactFindOne.mock.calls[0][0].where).toEqual({ id: 8, companyId: 1 });
  });
});

describe("mensagens rápidas", () => {
  it("ler, alterar e apagar buscam pela empresa", async () => {
    m.qmFindOne.mockResolvedValue(null);
    await expect(QmShow(4, 2)).rejects.toMatchObject({ statusCode: 404 });
    await expect(QmUpdate({ id: 4, shortcode: "a", message: "b", userId: 1, companyId: 2 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(QmDelete("4", 2)).rejects.toMatchObject({ statusCode: 404 });
    m.qmFindOne.mock.calls.forEach(c => expect(c[0].where).toMatchObject({ id: expect.anything(), companyId: 2 }));
    expect(m.qmFindOne).toHaveBeenCalledTimes(3);
  });
});

describe("tags/sync", () => {
  it("confere a empresa do ticket e só liga tags da empresa", async () => {
    (ShowTicketService as jest.Mock).mockResolvedValue({ contactId: 9, reload: jest.fn() });
    m.tagFindAll.mockResolvedValue([{ id: 1 }]);
    await SyncTags({ ticketId: 50, companyId: 1, tags: [{ id: 1 }, { id: 77 }] as any });
    expect(ShowTicketService).toHaveBeenCalledWith(50, 1);
    expect((TicketTag as any).bulkCreate.mock.calls[0][0]).toEqual([{ tagId: 1, ticketId: 50 }]);
  });
});

describe("agendamento", () => {
  it("contato de outra empresa é recusado", async () => {
    m.contactFindOne.mockResolvedValue(null);
    await expect(
      ScheduleCreate({ body: "mensagem longa", sendAt: "2030-01-01" as any, contactId: 12, companyId: 1, userId: 1 })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(m.contactFindOne.mock.calls[0][0].where).toEqual({ id: 12, companyId: 1 });
  });
});

describe("configurações", () => {
  it("admin de empresa não lê segredo com prefixo _", async () => {
    await expect(GetSettingService({ key: "_zammadToken", user: { profile: "admin", companyId: 2 } })).rejects.toMatchObject({ statusCode: 403 });
    m.settingFindOne.mockResolvedValue({ value: "x" });
    await expect(GetSettingService({ key: "_zammadToken", user: { profile: "admin", companyId: 1, isSuper: true } })).resolves.toBe("x");
  });

  it("admin de empresa não grava o destino das integrações", async () => {
    const res: any = { status: () => ({ json: jest.fn() }) };
    const req = (key: string, isSuper = false) => ({ params: { settingKey: key }, body: { value: "https://x.test" }, user: { companyId: 2, isSuper } }) as any;
    await expect(updateSetting(req("fpOpsUrl"), res)).rejects.toMatchObject({ statusCode: 403 });
    await expect(updateSetting(req("zammadUrl"), res)).rejects.toMatchObject({ statusCode: 403 });
    await expect(updateSetting(req("tagsMode"), res)).resolves.toBeUndefined();
    await expect(updateSetting(req("fpOpsUrl", true), res)).resolves.toBeUndefined();
  });
});

describe("exclusão de ticket", () => {
  it("exige a permissão de exclusão, não só estar logado", async () => {
    m.userFindByPk.mockResolvedValue({ profile: "user", super: false, permissions: {} });
    const res: any = { status: () => ({ json: jest.fn() }) };
    await expect(removeTicket({ params: { ticketId: "5" }, user: { id: 7, companyId: 1 } } as any, res)).rejects.toMatchObject({ statusCode: 403 });
    expect(DeleteTicketService).not.toHaveBeenCalled();
  });
});

describe("privacidade da conexão", () => {
  it("conexão de outra empresa não é encontrada", async () => {
    (ShowWhatsAppService as jest.Mock).mockResolvedValue({ id: 5, companyId: 2, status: "CONNECTED", channel: "whatsapp" });
    const res: any = { status: () => ({ json: jest.fn() }) };
    await expect(showPrivacy({ params: { whatsappId: "5" }, user: { companyId: 1 } } as any, res)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("estrutura", () => {
  const src = path.resolve(__dirname, "..");
  it("nenhum controller emite evento a todos os sockets (só anúncio global do super)", () => {
    const dir = path.join(src, "controllers");
    const ruins: string[] = [];
    fs.readdirSync(dir).filter(f => f.endsWith(".ts")).forEach(f => {
      fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/).forEach((l, i) => {
        if (/\bio\.emit\(/.test(l) && !l.trim().startsWith("//") && !l.includes("`company-announcement`")) ruins.push(`${f}:${i + 1}`);
      });
    });
    expect(ruins).toEqual([]);
  });

  it("os location do nginx que usam add_header repetem os cabeçalhos de segurança", () => {
    const inc = path.resolve(src, "../../frontend/nginx/include.d");
    expect(fs.readFileSync(path.join(inc, "spa.conf"), "utf8")).toContain("security-headers.conf");
    expect(fs.readFileSync(path.join(inc, "nocache.conf"), "utf8")).toContain("security-headers.conf");
    expect(fs.readFileSync(path.join(inc, "allcache.conf"), "utf8")).toContain("security-headers.conf");
    expect(fs.readFileSync(path.join(inc, "security-headers.conf"), "utf8")).toContain("Strict-Transport-Security");
  });
});
