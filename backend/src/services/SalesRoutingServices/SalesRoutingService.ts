import { randomBytes } from "crypto";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import SalesRoutingConfig from "../../models/SalesRoutingConfig";
import SalesRoutingConsultant from "../../models/SalesRoutingConsultant";
import SalesRoutingSession from "../../models/SalesRoutingSession";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import UserSocketSession from "../../models/UserSocketSession";
import Whatsapp from "../../models/Whatsapp";
import sequelize from "../../database";
import ShowTicketService from "../TicketServices/ShowTicketService";

const CODE_PATTERN = /(?:^|\s)#sr([a-z0-9]{20})(?=\s|$)/i;
const SESSION_TTL_MS = 20 * 60 * 1000;

export const DEFAULT_BOT_MESSAGES = {
  menuIntro: "Olá! Para agilizar seu atendimento, escolha uma opção:",
  consultantPrompt: "Escolha sua consultora:",
  noConsultants:
    "No momento não há consultoras disponíveis. Vou encaminhar você para novos atendimentos.",
  newConsultant:
    "Certo! Vou encaminhar você para uma consultora disponível. Aguarde um instante.",
  selectedConsultant:
    "Perfeito! Vou encaminhar seu atendimento para {{consultora}}. Aguarde um instante.",
  invalidOption: "Não entendi essa opção."
};

export type BotMessages = typeof DEFAULT_BOT_MESSAGES;

export type ConsultantInput = {
  queueId: number;
  label?: string;
  active?: boolean;
  sortOrder?: number;
};

export type ConfigInput = {
  enabled?: boolean;
  whatsappId?: number | null;
  whatsappNumber?: string;
  newQueueId?: number | null;
  receptionQueueId?: number | null;
  title?: string;
  botMessages?: string;
  consultants?: ConsultantInput[];
};

export type RoutingInbound = {
  config: SalesRoutingConfig;
  queueId: number | null;
  cleanBody: string;
  source: "link" | "preference" | "random" | "reception";
  selectedLabel?: string;
  selectedKind?: "new" | "consultant";
};

const configIncludes = [
  { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "status"] },
  { model: Queue, as: "newQueue", attributes: ["id", "name", "color"] },
  { model: Queue, as: "receptionQueue", attributes: ["id", "name", "color"] },
  {
    model: SalesRoutingConsultant,
    as: "consultants",
    include: [{ model: Queue, as: "queue", attributes: ["id", "name", "color"] }]
  }
];

const randomPublicId = () => randomBytes(12).toString("hex");
const randomSessionCode = () => randomBytes(10).toString("hex");

const normalizePhone = (value?: string) => (value || "").replace(/\D/g, "");

export const parseBotMessages = (value?: string | null): BotMessages => {
  if (!value) return { ...DEFAULT_BOT_MESSAGES };

  try {
    const parsed = JSON.parse(value);
    return Object.keys(DEFAULT_BOT_MESSAGES).reduce((messages, key) => {
      const messageKey = key as keyof BotMessages;
      const candidate = parsed?.[messageKey];
      messages[messageKey] =
        typeof candidate === "string" && candidate.trim()
          ? candidate.trim()
          : DEFAULT_BOT_MESSAGES[messageKey];
      return messages;
    }, {} as BotMessages);
  } catch {
    return { ...DEFAULT_BOT_MESSAGES };
  }
};

const serializeBotMessages = (value?: string | null) =>
  JSON.stringify(parseBotMessages(value));

export const getRoutingBotMessage = (
  config: SalesRoutingConfig,
  key: keyof BotMessages,
  variables: Record<string, string> = {}
) =>
  Object.entries(variables).reduce(
    (message, [name, value]) =>
      message.replace(new RegExp(`{{\\s*${name}\\s*}}`, "gi"), value),
    parseBotMessages(config.botMessages)[key]
  );

const getConfig = async (companyId: number, include = true) =>
  SalesRoutingConfig.findOne({
    where: { companyId },
    ...(include ? { include: configIncludes, order: [["consultants", "sortOrder", "ASC"]] } : {})
  });

const assertQueue = async (queueId: number | null | undefined, companyId: number) => {
  if (!queueId) return null;
  const queue = await Queue.findOne({ where: { id: queueId, companyId } });
  if (!queue) throw new AppError("Fila de roteamento inv\u00e1lida", 400);
  return queue;
};

const assertWhatsapp = async (
  whatsappId: number | null | undefined,
  companyId: number
) => {
  if (!whatsappId) return null;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) throw new AppError("Conex\u00e3o de roteamento inv\u00e1lida", 400);
  return whatsapp;
};

export const getSalesRoutingConfig = async (companyId: number) =>
  getConfig(companyId);

/**
 * Returns the consultant queue that belongs exclusively to this user in an
 * active commercial routing configuration. An ambiguous membership must not
 * decide where a customer is routed automatically.
 */
export const getSalesRoutingConsultantQueueForUser = async ({
  companyId,
  currentQueueId,
  userQueueIds
}: {
  companyId: number;
  currentQueueId: number | null;
  userQueueIds: number[];
}): Promise<number | null> => {
  const config = await getConfig(companyId);

  if (
    !config?.enabled ||
    !config.newQueueId ||
    Number(config.newQueueId) !== Number(currentQueueId)
  ) {
    return null;
  }

  const matchingQueues = (config.consultants || [])
    .filter(
      consultant =>
        consultant.active && userQueueIds.includes(Number(consultant.queueId))
    )
    .map(consultant => Number(consultant.queueId));

  return matchingQueues.length === 1 ? matchingQueues[0] : null;
};

const getReceptionQueueId = (config: SalesRoutingConfig) =>
  Number(config.receptionQueueId || config.newQueueId) || null;

const getOnlineConsultantQueueIds = async (config: SalesRoutingConfig) => {
  const configuredQueueIds = new Set(
    (config.consultants || [])
      .filter(consultant => consultant.active)
      .map(consultant => Number(consultant.queueId))
  );

  if (!configuredQueueIds.size) return [];

  const onlineUsers = await User.findAll({
    attributes: ["id"],
    where: {
      companyId: config.companyId,
      profile: { [Op.ne]: "admin" }
    },
    include: [
      { model: Queue, attributes: ["id"], through: { attributes: [] } },
      {
        model: UserSocketSession,
        as: "socketSessions",
        attributes: [],
        where: { active: true },
        required: true
      }
    ]
  });

  return Array.from(
    new Set(
      onlineUsers.flatMap(user =>
        (user.queues || [])
          .map(queue => Number(queue.id))
          .filter(queueId => configuredQueueIds.has(queueId))
      )
    )
  );
};

const chooseRandomQueue = (queueIds: number[]) =>
  queueIds.length ? queueIds[Math.floor(Math.random() * queueIds.length)] : null;

/**
 * Delivers one queued direct-contact ticket to a consultant at the moment the
 * consultant becomes online. The ticket marker prevents regular reception
 * tickets from being moved by this automation.
 */
export const dispatchWaitingSalesRoutingTicket = async ({
  companyId,
  userId
}: {
  companyId: number;
  userId: number;
}) => {
  const config = await getConfig(companyId);
  if (!config?.enabled) return null;

  const user = await User.findOne({
    where: { id: userId, companyId, profile: { [Op.ne]: "admin" } },
    include: [{ model: Queue, attributes: ["id"] }]
  });
  if (!user) return null;

  const consultantQueueIds = new Set(
    (config.consultants || [])
      .filter(consultant => consultant.active)
      .map(consultant => Number(consultant.queueId))
  );
  const targetQueueIds = (user.queues || [])
    .map(queue => Number(queue.id))
    .filter(queueId => consultantQueueIds.has(queueId));

  if (targetQueueIds.length !== 1) return null;

  const receptionQueueId = getReceptionQueueId(config);
  if (!receptionQueueId) return null;

  const transaction = await sequelize.transaction();
  try {
    const ticket = await Ticket.findOne({
      where: {
        companyId,
        queueId: receptionQueueId,
        status: "pending",
        userId: null,
        salesRoutingPending: true
      },
      order: [["createdAt", "ASC"]],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!ticket) {
      await transaction.commit();
      return null;
    }

    await ticket.update(
      { queueId: targetQueueIds[0], salesRoutingPending: false },
      { transaction }
    );
    await transaction.commit();
    return ShowTicketService(ticket.id, companyId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const saveSalesRoutingConfig = async (
  companyId: number,
  input: ConfigInput
) => {
  const whatsappId = input.whatsappId === undefined ? undefined : Number(input.whatsappId) || null;
  const newQueueId = input.newQueueId === undefined ? undefined : Number(input.newQueueId) || null;
  const receptionQueueId =
    input.receptionQueueId === undefined ? undefined : Number(input.receptionQueueId) || null;

  if (whatsappId !== undefined) await assertWhatsapp(whatsappId, companyId);
  if (newQueueId !== undefined) await assertQueue(newQueueId, companyId);
  if (receptionQueueId !== undefined) await assertQueue(receptionQueueId, companyId);

  let config = await getConfig(companyId, false);
  if (!config) {
    config = await SalesRoutingConfig.create({
      companyId,
      publicId: randomPublicId(),
      enabled: false,
      title: "Atendimento comercial"
    });
  }

  const update: Omit<ConfigInput, "consultants"> = {};
  if (input.enabled !== undefined) update.enabled = Boolean(input.enabled);
  if (whatsappId !== undefined) update.whatsappId = whatsappId;
  if (newQueueId !== undefined) update.newQueueId = newQueueId;
  if (receptionQueueId !== undefined) update.receptionQueueId = receptionQueueId;
  if (input.title !== undefined) update.title = input.title.trim() || "Atendimento comercial";
  if (input.botMessages !== undefined) {
    update.botMessages = serializeBotMessages(input.botMessages);
  }
  if (input.whatsappNumber !== undefined) {
    const whatsappNumber = normalizePhone(input.whatsappNumber);
    if (whatsappNumber && (whatsappNumber.length < 10 || whatsappNumber.length > 15)) {
      throw new AppError("Informe o n\u00famero central com DDD", 400);
    }
    update.whatsappNumber = whatsappNumber;
  }

  await config.update(update);

  if (input.consultants) {
    const sanitized = input.consultants.map((consultant, index) => ({
      queueId: Number(consultant.queueId),
      label: (consultant.label || "").trim(),
      active: consultant.active !== false,
      sortOrder: Number.isFinite(Number(consultant.sortOrder))
        ? Number(consultant.sortOrder)
        : index
    }));

    for (const consultant of sanitized) {
      const queue = await assertQueue(consultant.queueId, companyId);
      consultant.label = consultant.label || queue.name;
    }

    const uniqueQueueIds = new Set(sanitized.map(consultant => consultant.queueId));
    if (uniqueQueueIds.size !== sanitized.length) {
      throw new AppError("Cada consultora precisa apontar para uma fila diferente", 400);
    }

    await SalesRoutingConsultant.destroy({
      where: { salesRoutingConfigId: config.id }
    });
    if (sanitized.length) {
      await SalesRoutingConsultant.bulkCreate(
        sanitized.map(consultant => ({
          ...consultant,
          salesRoutingConfigId: config.id
        }))
      );
    }
  }

  return getConfig(companyId);
};

export const getPublicSalesRouting = async (publicId: string) => {
  const config = await SalesRoutingConfig.findOne({
    where: { publicId, enabled: true },
    include: [
      {
        model: SalesRoutingConsultant,
        as: "consultants",
        where: { active: true },
        required: false,
        include: [{ model: Queue, as: "queue", attributes: ["id", "name"] }]
      }
    ],
    order: [["consultants", "sortOrder", "ASC"]]
  });

  if (!config || !config.whatsappNumber || !config.whatsappId || !config.newQueueId) {
    throw new AppError("Este atendimento ainda n\u00e3o est\u00e1 dispon\u00edvel", 404);
  }

  return {
    title: config.title,
    consultants: (config.consultants || []).map(consultant => ({
      id: consultant.id,
      label: consultant.label,
      queueId: consultant.queueId
    }))
  };
};

export const createPublicSalesRoutingSession = async (
  publicId: string,
  kind: "new" | "consultant",
  consultantId?: number
) => {
  const config = await SalesRoutingConfig.findOne({
    where: { publicId, enabled: true },
    include: [{ model: SalesRoutingConsultant, as: "consultants", required: false }]
  });

  if (!config?.whatsappId || !config.newQueueId || !config.whatsappNumber) {
    throw new AppError("Este atendimento ainda n\u00e3o est\u00e1 dispon\u00edvel", 404);
  }

  let queueId = config.newQueueId;
  if (kind === "consultant") {
    const consultant = (config.consultants || []).find(
      item => item.id === Number(consultantId) && item.active
    );
    if (!consultant) throw new AppError("Consultora n\u00e3o dispon\u00edvel", 400);
    queueId = consultant.queueId;
  }

  const code = randomSessionCode();
  await SalesRoutingSession.create({
    salesRoutingConfigId: config.id,
    code,
    queueId,
    kind,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  });

  const message = "Ol\u00e1! Vim pelo link de atendimento. #sr" + code;
  return {
    whatsappUrl: `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`
  };
};

export const resolveSalesRoutingInbound = async ({
  companyId,
  whatsappId,
  contact,
  body
}: {
  companyId: number;
  whatsappId: number;
  contact: Contact;
  body: string;
}): Promise<RoutingInbound | null> => {
  const config = await SalesRoutingConfig.findOne({
    where: { companyId, whatsappId, enabled: true },
    include: [
      { model: Queue, as: "newQueue", attributes: ["id", "name"] },
      {
        model: SalesRoutingConsultant,
        as: "consultants",
        include: [{ model: Queue, as: "queue", attributes: ["id", "name"] }]
      }
    ],
    order: [["consultants", "sortOrder", "ASC"]]
  });

  if (!config || !config.whatsappNumber || !config.newQueueId) return null;

  const codeMatch = body.match(CODE_PATTERN);
  const cleanBody = codeMatch
    ? body.replace(CODE_PATTERN, "").replace(/\s{2,}/g, " ").trim()
    : body;
  if (codeMatch) {
    const session = await SalesRoutingSession.findOne({
      where: {
        salesRoutingConfigId: config.id,
        code: codeMatch[1].toLowerCase(),
        consumedAt: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (session?.queueId) {
      const consultant = (config.consultants || []).find(
        item => item.queueId === session.queueId && item.active
      );
      await session.update({ consumedAt: new Date() });
      await contact.update({
        preferredQueueId: session.kind === "consultant" ? session.queueId : null,
        salesRoutingStep: null
      });
      return {
        config,
        queueId: session.queueId,
        cleanBody,
        source: "link",
        selectedLabel: consultant?.label || config.newQueue?.name,
        selectedKind: session.kind === "consultant" ? "consultant" : "new"
      };
    }

    return {
      config,
      queueId: getReceptionQueueId(config),
      cleanBody,
      source: "reception"
    };
  }

  if (contact.preferredQueueId) {
    const preferredConsultant = (config.consultants || []).find(
      item => item.queueId === contact.preferredQueueId && item.active
    );
    if (preferredConsultant) {
      return {
        config,
        queueId: preferredConsultant.queueId,
        cleanBody: body,
        source: "preference",
        selectedLabel: preferredConsultant.label
      };
    }
    await contact.update({ preferredQueueId: null, salesRoutingStep: null });
  }

  const randomQueueId = chooseRandomQueue(await getOnlineConsultantQueueIds(config));
  return {
    config,
    queueId: randomQueueId || getReceptionQueueId(config),
    cleanBody: body,
    source: randomQueueId ? "random" : "reception"
  };
};

export const getRoutingMenuText = (config: SalesRoutingConfig) =>
  [
    getRoutingBotMessage(config, "menuIntro"),
    "1 - J\u00e1 tenho uma consultora",
    "2 - Quero falar com uma nova consultora"
  ].join("\n");

export const getConsultantsMenuText = (config: SalesRoutingConfig) => {
  const options = (config.consultants || [])
    .filter(consultant => consultant.active)
    .map((consultant, index) => `${index + 1} - ${consultant.label}`);
  return [getRoutingBotMessage(config, "consultantPrompt"), ...options, "0 - Voltar"].join("\n");
};

export const selectSalesRoutingQueue = async (
  contact: Contact,
  queueId: number
) => contact.update({ preferredQueueId: queueId, salesRoutingStep: null });
