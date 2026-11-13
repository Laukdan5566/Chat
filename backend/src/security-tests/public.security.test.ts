import fs from "fs";
import path from "path";
import resolveInsideDir from "../helpers/resolveInsideDir";

const base = path.resolve("/srv/app/public");

describe("GET /public/*: confinamento ao diretório público", () => {
  it("aceita arquivos e subpastas normais (inclusive nomes com .. no meio)", () => {
    expect(resolveInsideDir(base, "media/2/1428/8692/abc/ORÇAMENTO..pdf")).toBe(path.join(base, "media/2/1428/8692/abc/ORÇAMENTO..pdf"));
    expect(resolveInsideDir(base, "logo.png")).toBe(path.join(base, "logo.png"));
  });

  it.each([
    "../../etc/passwd",
    "../.env",
    "media/../../package.json",
    "/etc/passwd",
    "..",
    ".",
    "",
    "arquivo\0.png"
  ])("recusa %j", pedido => {
    expect(resolveInsideDir(base, pedido)).toBeNull();
  });

  it("a rota usa o confinamento (não monta o caminho com path.join)", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../app.ts"), "utf8");
    expect(app).toContain("resolveInsideDir(uploadConfig.directory");
    expect(app).not.toMatch(/path\.join\(uploadConfig\.directory/);
  });
});
