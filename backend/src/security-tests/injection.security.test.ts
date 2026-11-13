import { Op } from "sequelize";
import fs from "fs";

const execFileMock = jest.fn((_cmd: string, _args: string[], cb: (e: any) => void) => cb(null));
const execMock = jest.fn();
jest.mock("child_process", () => ({
  execFile: (...args: any[]) => (execFileMock as any)(...args),
  exec: (...args: any[]) => execMock(...args)
}));
jest.mock("../services/WbotServices/wbotMessageListener", () => ({}));
jest.mock("../helpers/GetTicketWbot", () => jest.fn());
jest.mock("../models/Ticket", () => ({}));
jest.mock("../helpers/CheckSettings", () => jest.fn());
jest.mock("../helpers/saveMediaFile", () => jest.fn());
jest.mock("../services/WbotServices/getJidOf", () => ({ getJidOf: jest.fn() }));
jest.mock("../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const findAndCountAll = jest.fn().mockResolvedValue({ count: 0, rows: [] });
jest.mock("../models/Contact", () => ({
  __esModule: true,
  default: { findAndCountAll: (...a: any[]) => findAndCountAll(...a) }
}));
jest.mock("../database", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Sequelize: S } = require("sequelize");
  return { __esModule: true, default: new S("postgres://u:p@localhost:5432/db", { logging: false }) };
});

// eslint-disable-next-line import/first
import { getMessageFileOptions } from "../services/WbotServices/SendWhatsAppMedia";
// eslint-disable-next-line import/first
import ListContactsService from "../services/ContactServices/ListContactsService";
// eslint-disable-next-line import/first
import uploadConfig from "../config/upload";

describe("exec do áudio gravado", () => {
  it("passa o caminho do arquivo como argumento, nunca por um shell", async () => {
    jest.spyOn(fs, "createReadStream").mockReturnValue({} as any);
    const evil = '/tmp/1-abc.$(touch /tmp/pwn)"`id`';

    await getMessageFileOptions("audio-record-site.webm", evil, "audio/webm");

    expect(execMock).not.toHaveBeenCalled();
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args[args.indexOf("-i") + 1]).toBe(evil);
  });
});

describe("extensão do upload", () => {
  const nome = (originalname: string) =>
    new Promise<string>(resolve => {
      (uploadConfig.storage as any).getFilename({}, { originalname }, (_e: any, n: string) => resolve(n));
    });

  it("descarta extensão com caracteres de shell e mantém a normal", async () => {
    expect(await nome('audio-record-site.a$(id)"`x')).not.toMatch(/[$("`]/);
    expect(await nome("foto.png")).toMatch(/\.png$/);
  });
});

describe("busca de contatos", () => {
  it("escapa o texto da busca antes de colocá-lo no literal SQL", async () => {
    await ListContactsService({ searchParam: "x') OR 1=1 --", companyId: 1 });

    const where = findAndCountAll.mock.calls[0][0].where;
    const literal = (where[Op.or][0].name as any).logic[Op.like] as { val: string };
    expect(literal.val).toContain("'x'') or 1=1 --'");
  });
});

