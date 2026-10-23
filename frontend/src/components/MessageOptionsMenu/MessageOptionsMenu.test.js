import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import MessageOptionsMenu from "./index";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import { toast } from "react-toastify";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { EditMessageContext } from "../../context/EditingMessage/EditingMessageContext";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve({})), delete: jest.fn(() => Promise.resolve({})) }
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../../errors/toastError", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../ConfirmationModal", () => ({ __esModule: true, default: () => null }));
jest.mock("../MessageHistoryModal", () => ({ __esModule: true, default: () => null }));
jest.mock("../MessageForwardModal", () => ({ __esModule: true, default: () => null }));
jest.mock("emoji-mart/css/emoji-mart.css", () => ({}), { virtual: true });
jest.mock("emoji-mart", () => ({ Picker: () => null }));

const baseMessage = { id: 77, ticketId: 5, body: "Olá, tudo bem?", fromMe: true, mediaUrl: null, isDeleted: false, oldMessages: [] };

const abrir = (message, extra = {}) => {
  const setReplyingMessage = jest.fn();
  const setEditingMessage = jest.fn();
  const handleClose = jest.fn();
  const anchor = document.createElement("div");
  document.body.appendChild(anchor);
  render(
    <ReplyMessageContext.Provider value={{ setReplyingMessage }}>
      <EditMessageContext.Provider value={{ setEditingMessage }}>
        <MessageOptionsMenu message={message} data={{}} menuOpen anchorEl={anchor} handleClose={handleClose} {...extra} />
      </EditMessageContext.Provider>
    </ReplyMessageContext.Provider>
  );

  return { setReplyingMessage, setEditingMessage, handleClose };
};

const rotulos = () => screen.getAllByRole("menuitem").filter(el => el.textContent && !/^(👍|❤️|😂|🎉|😮|😢|🙏|\+)$/.test(el.textContent)).map(el => el.textContent.trim());

describe("MessageOptionsMenu (menu estilo WhatsApp)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.post.mockResolvedValue({}); // o Jest do projeto zera os mocks entre os testes
    api.delete.mockResolvedValue({});
    Object.assign(navigator, { clipboard: { writeText: jest.fn(() => Promise.resolve()) } });
  });

  test("mensagem minha de texto: Responder, Copiar, Encaminhar, Editar e Apagar, nessa ordem", () => {
    abrir(baseMessage);
    expect(rotulos()).toEqual([
      i18n.t("messageOptionsMenu.reply"),
      i18n.t("messageOptionsMenu.copy"),
      i18n.t("messageOptionsMenu.forward"),
      i18n.t("messageOptionsMenu.edit"),
      i18n.t("messageOptionsMenu.delete")
    ]);
  });

  test("mensagem do cliente: sem Editar e sem Apagar", () => {
    abrir({ ...baseMessage, fromMe: false });
    expect(rotulos()).toEqual([
      i18n.t("messageOptionsMenu.reply"),
      i18n.t("messageOptionsMenu.copy"),
      i18n.t("messageOptionsMenu.forward")
    ]);
  });

  test("Histórico só aparece quando a mensagem foi editada", () => {
    abrir({ ...baseMessage, oldMessages: [{ body: "antes" }] });
    expect(rotulos()).toContain(i18n.t("messageOptionsMenu.history"));
  });

  test("mídia e mensagem apagada não têm Copiar", () => {
    const { unmount } = render(<div />);
    unmount();
    abrir({ ...baseMessage, mediaUrl: "foto.jpg" });
    expect(rotulos()).not.toContain(i18n.t("messageOptionsMenu.copy"));
  });

  test("Copiar leva o texto da mensagem para a área de transferência e avisa", async () => {
    const { handleClose } = abrir(baseMessage);
    fireEvent.click(screen.getByText(i18n.t("messageOptionsMenu.copy")));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Olá, tudo bem?"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(i18n.t("messageOptionsMenu.copied")));
    expect(handleClose).toHaveBeenCalled();
  });

  test("Responder chama o contexto de resposta com a mensagem", () => {
    const { setReplyingMessage, handleClose } = abrir(baseMessage);
    fireEvent.click(screen.getByText(i18n.t("messageOptionsMenu.reply")));
    expect(setReplyingMessage).toHaveBeenCalledWith(baseMessage);
    expect(handleClose).toHaveBeenCalled();
  });

  test("Editar chama o contexto de edição", () => {
    const { setEditingMessage } = abrir(baseMessage);
    fireEvent.click(screen.getByText(i18n.t("messageOptionsMenu.edit")));
    expect(setEditingMessage).toHaveBeenCalledWith(baseMessage);
  });

  test("reação 👍 envia para a API", () => {
    abrir(baseMessage);
    fireEvent.click(screen.getByText("👍"));
    expect(api.post).toHaveBeenCalledWith("/messages/react/77", { ticketId: 5, emoji: "👍" });
  });

  test("abre na posição do mouse quando recebe anchorPosition (clique direito)", () => {
    abrir(baseMessage, { anchorPosition: { top: 120, left: 340 } });
    expect(rotulos().length).toBeGreaterThan(0);
  });
});
