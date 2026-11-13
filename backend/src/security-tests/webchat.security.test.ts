
/* eslint-disable import/first */
import requestKey from "../helpers/webchatRequestKey";
/* eslint-enable import/first */

const reqDe = (ip: string, header?: string): any => ({
  ip,
  socket: { remoteAddress: ip },
  get: (n: string) => (n.toLowerCase() === "x-webchat-client-ip" ? header : undefined)
});

describe("limite do webchat", () => {
  const original = process.env.WEBCHAT_PROXY_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.WEBCHAT_PROXY_SECRET;
    else process.env.WEBCHAT_PROXY_SECRET = original;
  });

  it("sem segredo de proxy, o cabeçalho de IP do cliente é ignorado", () => {
    delete process.env.WEBCHAT_PROXY_SECRET;
    expect(requestKey(reqDe("203.0.113.9", "1.1.1.1"), "session")).toBe(
      requestKey(reqDe("203.0.113.9", "2.2.2.2"), "session")
    );
    expect(requestKey(reqDe("203.0.113.9", "1.1.1.1"), "session")).toBe("203.0.113.9:session");
  });

  it("com segredo de proxy (assinatura já validada), o cabeçalho vale", () => {
    process.env.WEBCHAT_PROXY_SECRET = "segredo-de-teste";
    expect(requestKey(reqDe("10.0.0.2", "198.51.100.7"), "session")).toBe("198.51.100.7:session");
  });
});
