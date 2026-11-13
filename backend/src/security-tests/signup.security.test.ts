const userFindOne = jest.fn();
const planFindOne = jest.fn();
const createCompany = jest.fn();

jest.mock("axios", () => ({ post: jest.fn() }));
jest.mock("../models/User", () => ({ __esModule: true, default: { findOne: (...a: any[]) => userFindOne(...a), findByPk: jest.fn() } }));
jest.mock("../models/Plan", () => ({ __esModule: true, default: { findOne: (...a: any[]) => planFindOne(...a) } }));
jest.mock("../models/Company", () => ({ __esModule: true, default: {} }));
jest.mock("../helpers/CheckSettings", () => ({ __esModule: true, default: jest.fn().mockResolvedValue("enabled") }));
jest.mock("../helpers/checkOpenHours", () => ({}));
jest.mock("../services/CompanyService/CreateCompanyService", () => ({ __esModule: true, default: (...a: any[]) => createCompany(...a) }));
jest.mock("../services/CompanyService/ListCompaniesService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/CompanyService/UpdateCompanyService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/CompanyService/ShowCompanyService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/CompanyService/UpdateSchedulesService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/CompanyService/DeleteCompanyService", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../services/CompanyService/FindAllCompaniesService", () => ({ __esModule: true, default: jest.fn() }));

// eslint-disable-next-line import/first
import { signup } from "../controllers/CompanyController";

const mkRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const corpo = (extra = {}) => ({ name: "Empresa Nova", email: "novo@empresa.test", phone: "27999990000", password: "segredo123", planId: 2, ...extra });

beforeEach(() => {
  delete process.env.RECAPTCHA_SECRET_KEY;
  userFindOne.mockResolvedValue(null);
  planFindOne.mockResolvedValue({ id: 2 });
  createCompany.mockResolvedValue({ id: 10 });
});

describe("cadastro público de empresa", () => {
  it("e-mail de usuário existente não move o usuário para a empresa nova", async () => {
    userFindOne.mockResolvedValue({ id: 1 });
    const res = mkRes();
    await signup({ body: corpo({ name: "Admin", email: "suporte@existente.test" }) } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("só aceita plano público", async () => {
    planFindOne.mockResolvedValue(null);
    const res = mkRes();
    await signup({ body: corpo({ planId: 99 }) } as any, res);
    expect(planFindOne.mock.calls[0][0].where).toEqual({ id: 99, isPublic: true });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createCompany).not.toHaveBeenCalled();
  });

  it("repassa só os campos do formulário e ignora os que o cliente forja", async () => {
    const res = mkRes();
    await signup({ body: corpo({ campaignsEnabled: true, recurrence: "ANUAL", dueDate: "2099-01-01", status: "f" }) } as any, res);
    expect(createCompany).toHaveBeenCalledTimes(1);
    const dados = createCompany.mock.calls[0][0];
    expect(dados).not.toHaveProperty("campaignsEnabled");
    expect(dados).not.toHaveProperty("recurrence");
    expect(dados.status).toBe("t");
    expect(new Date(dados.dueDate).getFullYear()).toBeLessThan(2099);
  });
});
