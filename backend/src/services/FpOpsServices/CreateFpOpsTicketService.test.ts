import axios from "axios";
import Setting from "../../models/Setting";
import User from "../../models/User";
import Message from "../../models/Message";
import TicketNote from "../../models/TicketNote";
import ShowTicketService from "../TicketServices/ShowTicketService";
import CreateTicketNoteService from "../TicketNoteService/CreateTicketNoteService";
import createTicket from "./CreateFpOpsTicketService";

jest.mock("axios", () => ({ post: jest.fn(), isAxiosError: (error: any) => !!error.isAxiosError }));
jest.mock("../../models/Setting", () => ({ findAll: jest.fn() }));
jest.mock("../../models/User", () => ({ findOne: jest.fn() }));
jest.mock("../../models/Message", () => ({ findAll: jest.fn() }));
jest.mock("../../models/TicketNote", () => ({ findOne: jest.fn() }));
jest.mock("../TicketServices/ShowTicketService", () => jest.fn());
jest.mock("../TicketNoteService/CreateTicketNoteService", () => jest.fn());

const request = { ticketId: 91, companyId: 2, userId: 7, title: "Impressora", summary: "Nao imprime", includeMessages: true };
beforeEach(() => {
  (Setting.findAll as jest.Mock).mockResolvedValue([
    { key: "fpOpsEnabled", value: "true" },
    { key: "fpOpsUrl", value: "https://ops.example.test" },
    { key: "_fpOpsToken", value: "test-token" }
  ]);
  (ShowTicketService as jest.Mock).mockResolvedValue({ id: 91, uuid: "conversation", contactId: 4, contact: { name: "Cliente", number: "5527999999999", email: "" } });
  (User.findOne as jest.Mock).mockResolvedValue({ id: 7, name: "Atendente" });
  (Message.findAll as jest.Mock).mockResolvedValue([{ fromMe: false, body: "Ajuda" }]);
  (TicketNote.findOne as jest.Mock).mockResolvedValue(null);
  (axios.post as jest.Mock).mockResolvedValue({ data: { ticket_id: 12, number: "HD-12", created: true, url: "http://internal:8000/wrong" } });
});

test("preserves requester and agent identities and uses the configured public URL", async () => {
  const result = await createTicket(request);
  expect(result.url).toBe("https://ops.example.test/helpdesk/tickets/12");
  expect(axios.post).toHaveBeenCalledWith(
    "https://ops.example.test/api/v1/integrations/ticketz/tickets",
    expect.objectContaining({
      company_id: "2", source_ticket_id: "91", source_ticket_uuid: "conversation",
      opened_by: { external_id: "7", name: "Atendente" },
      requester: expect.objectContaining({ name: "Cliente" }),
      messages: [{ author: "Cliente", body: "Ajuda" }], priority: "normal", category: "support"
    }),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }), maxRedirects: 0 })
  );
  expect(ShowTicketService).toHaveBeenCalledWith(91, 2);
  expect(User.findOne).toHaveBeenCalledWith({ where: { id: 7, companyId: 2 } });
  expect(CreateTicketNoteService).toHaveBeenCalledTimes(1);
});

test("reuses the remote ticket and does not repeat an existing note", async () => {
  (axios.post as jest.Mock).mockResolvedValue({ data: { ticket_id: 12, number: "HD-12", created: false } });
  (TicketNote.findOne as jest.Mock).mockResolvedValue({ id: 1 });
  expect((await createTicket(request)).created).toBe(false);
  expect(CreateTicketNoteService).not.toHaveBeenCalled();
});

test("rejects an agent outside the company before making an external call", async () => {
  (User.findOne as jest.Mock).mockResolvedValue(null);
  await expect(createTicket(request)).rejects.toMatchObject({ statusCode: 403 });
  expect(axios.post).not.toHaveBeenCalled();
});

test("rejects invalid classification", async () => {
  await expect(createTicket({ ...request, priority: "invalid" })).rejects.toMatchObject({ statusCode: 400 });
  expect(axios.post).not.toHaveBeenCalled();
});

test("does not expose provider error bodies or credentials", async () => {
  (axios.post as jest.Mock).mockRejectedValue({ isAxiosError: true, response: { status: 401, data: "test-token" } });
  await expect(createTicket(request)).rejects.toMatchObject({ statusCode: 502 });
  expect(CreateTicketNoteService).not.toHaveBeenCalled();
});

test("does not record success for an invalid response", async () => {
  (axios.post as jest.Mock).mockResolvedValue({ data: {} });
  await expect(createTicket(request)).rejects.toMatchObject({ statusCode: 502 });
  expect(CreateTicketNoteService).not.toHaveBeenCalled();
});

test("accepts priority values sent by a cached legacy frontend", async () => {
  await createTicket({ ...request, priority: "3 high" });
  expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ priority: "high" }), expect.any(Object));
});
