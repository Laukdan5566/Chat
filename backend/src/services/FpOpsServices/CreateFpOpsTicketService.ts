import axios from "axios";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Setting from "../../models/Setting";
import Message from "../../models/Message";
import User from "../../models/User";
import TicketNote from "../../models/TicketNote";
import ShowTicketService from "../TicketServices/ShowTicketService";
import CreateTicketNoteService from "../TicketNoteService/CreateTicketNoteService";

export interface HelpdeskRequest {
  ticketId: number;
  companyId: number;
  userId?: number;
  title?: string;
  summary?: string;
  group?: string;
  priority?: string;
  category?: string;
  includeMessages?: boolean;
  publicRequest?: boolean;
}

const CreateFpOpsTicketService = async (request: HelpdeskRequest) => {
  const { ticketId, companyId, userId, publicRequest = false } = request;
  const settings = await Setting.findAll({ where: { companyId, key: ["fpOpsEnabled", "fpOpsUrl", "_fpOpsToken"] } });
  const value = (key: string) => settings.find(setting => setting.key === key)?.value || "";
  if (!["true", "enabled"].includes(value("fpOpsEnabled"))) {
    throw new AppError("FP Ops integration is disabled", 403);
  }
  let base: URL;
  try {
    base = new URL(value("fpOpsUrl"));
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error();
  } catch {
    throw new AppError("Configure uma URL HTTPS valida para o FP Ops", 400);
  }
  const token = value("_fpOpsToken");
  if (!token) throw new AppError("Configure o token de integracao do FP Ops", 400);
  const ticket = await ShowTicketService(ticketId, companyId);
  const actor = userId ? await User.findOne({ where: { id: userId, companyId } }) : null;
  if (!publicRequest && !actor) throw new AppError("ERR_NO_PERMISSION", 403);
  const legacyPriorities: Record<string, string> = { "1 low": "low", "2 normal": "normal", "3 high": "high" };
  const priority = legacyPriorities[request.priority] || request.priority || "normal";
  const category = request.category || "support";
  if (!["low", "normal", "high", "critical"].includes(priority) ||
      !["backup", "server", "pfsense", "internet", "windows", "support", "other"].includes(category)) {
    throw new AppError("Prioridade ou categoria invalida para o FP Ops", 400);
  }
  const history = request.includeMessages ? await Message.findAll({
    where: { ticketId, companyId, mediaType: { [Op.ne]: "internalNote" } },
    order: [["createdAt", "DESC"]], limit: 12
  }) : [];
  const frontendUrl = (process.env.TICKETZ_PUBLIC_URL || process.env.FRONTEND_URL || "").replace(/\/+$/, "");
  const baseUrl = base.toString().replace(/\/+$/, "");
  let response;
  try {
    response = await axios.post(`${baseUrl}/api/v1/integrations/ticketz/tickets`, {
      source_ticket_id: String(ticket.id),
      source_ticket_uuid: ticket.uuid,
      company_id: String(companyId),
      source_url: frontendUrl ? `${frontendUrl}/tickets/${ticket.uuid}` : "",
      opened_by: publicRequest ? { name: "Solicitacao pelo site" } : { external_id: String(actor.id), name: actor.name },
      requester: { name: ticket.contact.name, number: ticket.contact.number, email: ticket.contact.email },
      subject: (request.title?.trim() || `Atendimento - ${ticket.contact.name}`).slice(0, 200),
      description: (request.summary?.trim() || `Solicitacao pelo Chat CRM #${ticket.id}`).slice(0, 10000),
      priority, category,
      messages: history.reverse().map(message => ({ author: message.fromMe ? "Atendente" : "Cliente", body: (message.body || message.mediaUrl || "").slice(0, 1000) }))
    }, {
      headers: { Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}`, Accept: "application/json" },
      timeout: 30000,
      maxRedirects: 0
    });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    throw new AppError(status === 401 || status === 403
      ? "Token do FP Ops invalido ou sem permissao tickets:create"
      : "Nao foi possivel abrir o chamado no FP Ops. Tente novamente.", 502);
  }
  const id = Number(response.data?.ticket_id);
  if (!Number.isSafeInteger(id) || id <= 0 || !response.data?.number) {
    throw new AppError("Resposta invalida do FP Ops", 502);
  }
  const url = `${baseUrl}/helpdesk/tickets/${id}`;
  const number = String(response.data.number);
  const note = `Chamado FP Ops #${number} aberto.\n${url}`;
  const existingNote = await TicketNote.findOne({ where: { ticketId, note } });
  const noteUser = actor || (publicRequest ? await User.findOne({ where: { companyId }, order: [["id", "ASC"]] }) : null);
  if (!existingNote && noteUser) {
    await CreateTicketNoteService({ note, userId: noteUser.id, contactId: ticket.contactId, ticketId });
  }
  return { id, number, url, created: response.data.created, provider: "fpOps" };
};

export default CreateFpOpsTicketService;
