
jest.mock("../models/Whatsapp", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("../middleware/isAuth", () => ({ __esModule: true, default: function isAuthMarker() {} }));
jest.mock("../middleware/isAdmin", () => ({ __esModule: true, default: function isAdminMarker() {} }));
jest.mock("../middleware/isSuper", () => ({ __esModule: true, default: function isSuperMarker() {} }));
jest.mock("../controllers/SessionController", () => ({
  store: jest.fn(), saasLogin: jest.fn(), impersonate: jest.fn(), backToSuper: jest.fn(),
  update: jest.fn(), remove: jest.fn(), me: jest.fn()
}));
jest.mock("../controllers/TicketzOSSController", () => ({ show: jest.fn(), store: jest.fn() }));

// eslint-disable-next-line import/first
import tokenAuth from "../middleware/tokenAuth";
// eslint-disable-next-line import/first
import Whatsapp from "../models/Whatsapp";
// eslint-disable-next-line import/first
import authRoutes from "../routes/authRoutes";
// eslint-disable-next-line import/first
import ticketzOSSRoutes from "../routes/ticketzOSSRoutes";

const handlersOf = (router: any, path: string, method: string) => {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  return layer.route.stack.map((s: any) => s.handle.name);
};

describe("tokenAuth", () => {
  it("recusa requisição sem token e não procura conexão de token vazio", async () => {
    const next = jest.fn();
    await expect(tokenAuth({ headers: {} } as any, {} as any, next)).rejects.toMatchObject({ statusCode: 401 });
    await expect(tokenAuth({ headers: { authorization: "Bearer " } } as any, {} as any, next)).rejects.toMatchObject({ statusCode: 401 });
    expect(Whatsapp.findOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("aceita um token de conexão válido", async () => {
    (Whatsapp.findOne as jest.Mock).mockResolvedValue({ id: 3, companyId: 9 });
    const req: any = { headers: { authorization: "Bearer abc123" } };
    const next = jest.fn();
    await tokenAuth(req, {} as any, next);
    expect(req.companyId).toBe(9);
    expect(next).toHaveBeenCalled();
  });
});

describe("rotas só de super admin", () => {
  it("impersonar empresa exige super, não só admin de empresa", () => {
    const h = handlersOf(authRoutes, "/impersonate/:companyId", "get");
    expect(h).toContain("isSuperMarker");
    expect(h).not.toContain("isAdminMarker");
  });

  it("registro Ticketz global exige super", () => {
    ["get", "post"].forEach(m => {
      const h = handlersOf(ticketzOSSRoutes, "/ticketz/registry", m);
      expect(h).toContain("isSuperMarker");
      expect(h).not.toContain("isAdminMarker");
    });
  });
});

