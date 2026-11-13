import React from "react";
import WhatsMarked from "react-whatsmarked";

// react-whatsmarked devolve o texto cru de links markdown e o href sem escapar
// e injeta o resultado com dangerouslySetInnerHTML (sanitize: false). Como o texto
// vem de contatos externos, "<" e aspas viram entidades antes do parser: nada vira
// tag nem sai de um atributo, e o texto continua aparecendo igual para o atendente.
export const escapeForWhatsMarked = text =>
  String(text).replace(/</g, "&lt;").replace(/"/g, "&quot;");

const SafeWhatsMarked = ({ children, ...props }) => (
  <WhatsMarked {...props}>
    {typeof children === "string" ? escapeForWhatsMarked(children) : children}
  </WhatsMarked>
);

export default SafeWhatsMarked;
