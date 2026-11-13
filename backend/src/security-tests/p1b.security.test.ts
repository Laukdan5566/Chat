const m = {
  clFindOne: jest.fn(), cliFindOne: jest.fn(), invFindOne: jest.fn(), invFindByPk: jest.fn(), invFindAndCount: jest.fn(),
  queueFindOne: jest.fn(), qoCreate: jest.fn(), qoShow: jest.fn(), queueFindAll: jest.fn(), qoFindOne: jest.fn(), msgFindByPk: jest.fn()
};
jest.mock("../models/ContactList", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.clFindOne(...a) } }));
jest.mock("../models/ContactListItem", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.cliFindOne(...a) } }));
jest.mock("../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../models/Invoices", () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => m.invFindByPk(...a), findAndCountAll: (...a: any[]) => m.invFindAndCount(...a) }
}));
jest.mock("../models/Queue", () => ({ __esModule: true, default: { findOne: (...a: any[]) => m.queueFindOne(...a), findAll: (...a: any[]) => m.queueFindAll(...a) } }));
jest.mock("../models/QueueOption", () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => m.qoFindOne(...a), create: (...a: any[]) => m.qoCreate(...a), withTopParentQueue: (o: any) => o }
}));
jest.mock("../models/Message", () => ({ __esModule: true, default: { findByPk: (...a: any[]) => m.msgFindByPk(...a) } }));
jest.mock("../models/Ticket", () => ({ __esModule: true, default: {} }));
jest.mock("../models/Whatsapp", () => ({ __esModule: true, default: {} }));
jest.mock("../helpers/GetTicketWbot", () => jest.fn());
jest.mock("../helpers/GetWbotMessage", () => jest.fn());
jest.mock("../middleware/isAuth", () => ({ __esModule: true, default: function isAuthMarker() {} }));
jest.mock("../middleware/isSuper", () => ({ __esModule: true, default: function isSuperMarker() {} }));
jest.mock("../controllers/InvoicesController", () => ({ index: jest.fn(), list: jest.fn(), show: jest.fn(), update: jest.fn() }));
jest.mock("../controllers/QueueOptionController", () => ({}));
jest.mock("../services/QueueOptionService/ShowService", () => ({ __esModule: true, default: (...a: any[]) => m.qoShow(...a) }));

/* eslint-disable import/first */
import ContactListShow from "../services/ContactListService/ShowService";
import ContactListDelete from "../services/ContactListService/DeleteService";
import ItemShow from "../services/ContactListItemService/ShowService";
import ItemDelete from "../services/ContactListItemService/DeleteService";
import ShowInvoice from "../services/InvoicesService/ShowInvoiceService";
import ListInvoices from "../services/InvoicesService/ListInvoicesServices";
import invoicesRoutes from "../routes/invoicesRoutes";
import { assertQueueInCompany, assertQueueOptionInCompany } from "../services/QueueOptionService/QueueOptionScope";
import AssociateWhatsappQueue from "../services/WhatsappService/AssociateWhatsappQueue";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import QueueOptionCreate from "../services/QueueOptionService/CreateService";
import QueueOptionUpdate from "../services/QueueOptionService/UpdateService";
/* eslint-enable import/first */

describe("listas de contatos", () => {
  it("ler e apagar lista e item buscam pela empresa", async () => {
    m.clFindOne.mockResolvedValue(null);
    m.cliFindOne.mockResolvedValue(null);
    await expect(ContactListShow(4, 2)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ContactListDelete("4", 2)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ItemShow(9, 2)).rejects.toMatchObject({ statusCode: 404 });
    await expect(ItemDelete("9", 2)).rejects.toMatchObject({ statusCode: 404 });
    [...m.clFindOne.mock.calls, ...m.cliFindOne.mock.calls].forEach(c => expect(c[0].where).toMatchObject({ companyId: 2 }));
  });
});

describe("faturas", () => {
  it("alterar o status é só do super", () => {
    const layer = (invoicesRoutes as any).stack.find((l: any) => l.route?.path === "/invoices/:id" && l.route.methods.put);
    expect(layer.route.stack.map((s: any) => s.handle.name)).toContain("isSuperMarker");
  });

  it("fatura de outra empresa não é encontrada; a lista é filtrada pela empresa", async () => {
    m.invFindByPk.mockResolvedValue({ id: 1, companyId: 9 });
    await expect(ShowInvoice(1, 2)).rejects.toMatchObject({ statusCode: 404 });
    m.invFindAndCount.mockResolvedValue({ count: 0, rows: [] });
    await ListInvoices({ searchParam: "", companyId: 2 });
    expect(m.invFindAndCount.mock.calls[0][0].where).toMatchObject({ companyId: 2 });
  });
});

describe("opções de fila", () => {
  it("fila de outra empresa e opção cuja fila-raiz é de outra empresa não são encontradas", async () => {
    m.queueFindOne.mockResolvedValue(null);
    await expect(assertQueueInCompany(3, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(m.queueFindOne.mock.calls[0][0].where).toEqual({ id: 3, companyId: 1 });
    m.qoFindOne.mockResolvedValue({ id: 5, topParentQueue: { companyId: 7 } });
    await expect(assertQueueOptionInCompany(5, 1)).rejects.toMatchObject({ statusCode: 404 });
    m.qoFindOne.mockResolvedValue({ id: 5, topParentQueue: { companyId: 1 } });
    await expect(assertQueueOptionInCompany(5, 1)).resolves.toBeUndefined();
  });
});

describe("mediaPath de opção de fila", () => {
  it("criar e editar não aceitam mediaPath nem mediaName do corpo", async () => {
    await QueueOptionCreate({ queueId: 1, title: "t", option: "1", mediaPath: "../../.env", mediaName: "x" } as any);
    expect(m.qoCreate.mock.calls[0][0]).not.toHaveProperty("mediaPath");
    expect(m.qoCreate.mock.calls[0][0]).not.toHaveProperty("mediaName");
    const opcao: any = { update: jest.fn() };
    m.qoShow.mockResolvedValue(opcao);
    await QueueOptionUpdate(5, { title: "novo", mediaPath: "../../.env", id: 99 } as any);
    expect(opcao.update.mock.calls[0][0]).toEqual({ title: "novo" });
  });
});

describe("conexão de WhatsApp", () => {
  it("só filas da mesma empresa são associadas", async () => {
    m.queueFindAll.mockResolvedValue([{ id: 1 }]);
    const whatsapp: any = { companyId: 2, $set: jest.fn(), reload: jest.fn() };
    await AssociateWhatsappQueue(whatsapp, [1, 99]);
    expect(m.queueFindAll.mock.calls[0][0].where).toMatchObject({ companyId: 2 });
    expect(whatsapp.$set).toHaveBeenCalledWith("queues", [1]);
  });
});

describe("apagar mensagem", () => {
  it("mensagem de ticket de outra empresa não é encontrada", async () => {
    m.msgFindByPk.mockResolvedValue({ id: "abc", ticket: { companyId: 9 } });
    await expect(DeleteWhatsAppMessage("abc", 1)).rejects.toBeDefined();
  });
});
