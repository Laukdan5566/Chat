import axios from "axios";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Setting from "../../models/Setting";
import Ticket from "../../models/Ticket";
import TicketNote from "../../models/TicketNote";
import User from "../../models/User";
import CreateTicketNoteService from "../TicketNoteService/CreateTicketNoteService";
import ShowTicketService from "../TicketServices/ShowTicketService";

type Request = {
  ticketId: number;
  companyId: number;
  userId?: number;
  title?: string;
  summary?: string;
  group?: string;
  priority?: string;
  includeMessages?: boolean;
  publicRequest?: boolean;
};

type ZammadSettingKey =
  | "zammadEnabled"
  | "zammadUrl"
  | "_zammadToken"
  | "zammadGroup"
  | "zammadPriority";

const getSetting = async (
  companyId: number,
  key: ZammadSettingKey,
  defaultValue = ""
) => {
  const setting = await Setting.findOne({ where: { companyId, key } });
  return setting?.value || defaultValue;
};

const getAuthorizationHeader = (token: string) => {
  if (token.startsWith("Bearer ") || token.startsWith("Token ")) {
    return token;
  }

  return `Token token=${token}`;
};

const getTicketzUrl = (ticket: Ticket) => {
  const frontendUrl =
    process.env.TICKETZ_PUBLIC_URL || process.env.FRONTEND_URL || "";

  return frontendUrl ? `${frontendUrl}/tickets/${ticket.uuid}` : "";
};

const normalizeZammadError = (data: unknown) => {
  if (!data) return "";

  if (typeof data === "string") {
    return data
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  if (typeof data === "object") {
    const errorData = data as {
      error?: string;
      error_human?: string;
      message?: string;
      errors?: unknown;
    };

    return (
      errorData.error_human ||
      errorData.error ||
      errorData.message ||
      JSON.stringify(errorData.errors || errorData)
    ).slice(0, 300);
  }

  return "";
};

const resolveZammadGroupName = async (
  zammadUrl: string,
  zammadToken: string,
  groupName: string
) => {
  const trimmedGroupName = groupName.trim();

  if (!trimmedGroupName) return trimmedGroupName;

  try {
    const response = await axios.get(`${zammadUrl}/api/v1/groups`, {
      headers: {
        Accept: "application/json",
        Authorization: getAuthorizationHeader(zammadToken)
      },
      timeout: 10000
    });

    const groups = Array.isArray(response.data) ? response.data : [];
    const matchedGroup = groups.find(
      item =>
        typeof item?.name === "string" &&
        item.name.toLowerCase() === trimmedGroupName.toLowerCase()
    );

    return matchedGroup?.name || trimmedGroupName;
  } catch (error) {
    return trimmedGroupName;
  }
};

const formatMessages = async (ticketId: number) => {
  const messages = await Message.findAll({
    where: {
      ticketId,
      mediaType: {
        [Op.ne]: "internalNote"
      }
    },
    order: [["createdAt", "DESC"]],
    limit: 12
  });

  return messages
    .reverse()
    .map(message => {
      const author = message.fromMe ? "Atendente/IA" : "Cliente";
      const body = message.body || message.mediaUrl || `[${message.mediaType}]`;
      return `${author}: ${body}`;
    })
    .join("\n");
};

const CreateZammadTicketService = async ({
  ticketId,
  companyId,
  userId,
  title,
  summary,
  group,
  priority,
  includeMessages,
  publicRequest = false
}: Request) => {
  const enabled = await getSetting(companyId, "zammadEnabled", "false");

  if (enabled !== "true" && enabled !== "enabled") {
    throw new AppError("Zammad integration is disabled", 403);
  }

  const zammadUrl = (await getSetting(companyId, "zammadUrl")).replace(
    /\/+$/,
    ""
  );
  const zammadToken = await getSetting(companyId, "_zammadToken");
  const defaultGroup = await getSetting(companyId, "zammadGroup", "Users");
  const defaultPriority = await getSetting(
    companyId,
    "zammadPriority",
    "2 normal"
  );

  if (!zammadUrl || !zammadToken) {
    throw new AppError("Zammad integration is not configured", 400);
  }

  const ticket = await ShowTicketService(ticketId, companyId);
  const existingZammadNote = publicRequest
    ? await TicketNote.findOne({
        where: {
          ticketId,
          note: {
            [Op.like]: "Chamado Zammad #%"
          }
        },
        order: [["id", "DESC"]]
      })
    : null;

  if (existingZammadNote?.note) {
    const [headline, savedUrl] = existingZammadNote.note.split("\n");
    const number = headline.replace(/^Chamado Zammad #/, "").replace(/ aberto\.$/, "");
    const idMatch = savedUrl?.match(/\/ticket\/zoom\/(\d+)/);

    return {
      id: idMatch ? Number(idMatch[1]) : undefined,
      number,
      url: savedUrl || zammadUrl
    };
  }

  const requestUser = userId
    ? await User.findOne({ where: { id: userId, companyId } })
    : await User.findOne({ where: { companyId }, order: [["id", "ASC"]] });
  const ticketzUrl = getTicketzUrl(ticket);
  const messageHistory = includeMessages ? await formatMessages(ticketId) : "";
  const contactEmail =
    ticket.contact.email ||
    `${ticket.contact.number || ticket.contactId}@chatcrm.local`;
  const zammadGroup = await resolveZammadGroupName(
    zammadUrl,
    zammadToken,
    group?.trim() || defaultGroup
  );
  const defaultTitle = publicRequest
    ? `Solicitação pelo site - ${ticket.contact.name}`
    : `Suporte interno - ${ticket.contact.name}`;

  const body = [
    summary?.trim(),
    "",
    publicRequest
      ? `Origem: site da FP Informática (protocolo ${ticket.id})`
      : `Chat CRM: #${ticket.id}`,
    ticketzUrl ? `Conversa: ${ticketzUrl}` : null,
    `Cliente: ${ticket.contact.name}`,
    `Telefone: ${ticket.contact.number}`,
    ticket.queue?.name ? `Fila: ${ticket.queue.name}` : null,
    requestUser?.name ? `Aberto por: ${requestUser.name}` : null,
    messageHistory ? `\nUltimas mensagens:\n${messageHistory}` : null
  ]
    .filter(Boolean)
    .join("\n");

  let response;

  try {
    response = await axios.post(
      `${zammadUrl}/api/v1/tickets`,
      {
        title: title?.trim() || defaultTitle,
        group: zammadGroup,
        customer_id: `guess:${contactEmail}`,
        priority: priority || defaultPriority,
        state: "new",
        article: {
          subject: title?.trim() || defaultTitle,
          body,
          type: "note",
          internal: !publicRequest
        }
      },
      {
        headers: {
          Accept: "application/json",
          Authorization: getAuthorizationHeader(zammadToken)
        },
        timeout: 30000
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const zammadMessage = normalizeZammadError(error.response?.data);
      const details = zammadMessage ? `: ${zammadMessage}` : "";
      throw new AppError(
        `Erro ao criar chamado no Zammad${details}`,
        error.response?.status || 502
      );
    }

    throw error;
  }

  const zammadTicketId = response.data?.id;
  const zammadTicketNumber = response.data?.number || zammadTicketId;
  const zammadTicketUrl = zammadTicketId
    ? `${zammadUrl}/#ticket/zoom/${zammadTicketId}`
    : zammadUrl;

  if (requestUser) {
    await CreateTicketNoteService({
      note: `Chamado Zammad #${zammadTicketNumber} aberto.\n${zammadTicketUrl}`,
      userId: requestUser.id,
      contactId: ticket.contactId,
      ticketId: ticket.id
    });
  }

  return {
    id: zammadTicketId,
    number: zammadTicketNumber,
    url: zammadTicketUrl
  };
};

export default CreateZammadTicketService;
