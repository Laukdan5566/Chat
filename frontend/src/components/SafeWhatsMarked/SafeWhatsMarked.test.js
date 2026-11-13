import React from "react";
import { render } from "@testing-library/react";

import SafeWhatsMarked from "./index";

const perigosos = ["onerror", "onmouseover", "<img", "<script"];

const semHtmlPerigoso = container => {
  expect(container.querySelector("img, script, svg, iframe")).toBeNull();
  container.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(a => {
      expect(a.name.startsWith("on")).toBe(false);
    });
  });
  perigosos.forEach(p => expect(container.innerHTML.includes(`${p}=`) && container.querySelector(`[${p}]`)).toBeFalsy());
};

describe("SafeWhatsMarked", () => {
  it("não deixa HTML virar tag dentro do texto de um link markdown", () => {
    const { container } = render(
      <SafeWhatsMarked>{"[x<img src=x onerror=alert(1)>](http://a.example)"}</SafeWhatsMarked>
    );
    semHtmlPerigoso(container);
    expect(container.textContent).toContain("<img");
  });

  it("não deixa aspas de uma URL sair do atributo href", () => {
    const { container } = render(
      <SafeWhatsMarked>{'https://a.example/"onmouseover=alert(1)//'}</SafeWhatsMarked>
    );
    semHtmlPerigoso(container);
  });

  it("mantém o texto normal e a formatação do WhatsApp", () => {
    const { container } = render(<SafeWhatsMarked>{"Olá *tudo* bem? https://a.example"}</SafeWhatsMarked>);
    expect(container.querySelector("strong, b")).not.toBeNull();
    expect(container.textContent).toContain("Olá");
    expect(container.querySelector("a").getAttribute("href")).toBe("https://a.example");
  });
});
