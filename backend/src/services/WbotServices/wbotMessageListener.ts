import path from "path";
import fs from "fs";
import * as Sentry from "@sentry/node";
import { isNil, head, keys } from "lodash";

import {
  WASocket,
  downloadContentFromMessage,
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  MessageUpsertType,
  proto,
  WAMessage,
  WAMessageUpdate,
  WAMessageStubType,
  WAGenericMediaMessage,
  WALocationMessage,
  WAMessageStatus
} from "libzapitu-rf";
import { Mutex } from "async-mutex";
import { Op } from "sequelize";
import moment from "moment";
import { Transform } from "stream";
import { Throttle } from "stream-throttle";
import { Sequelize } from "sequelize-typescript";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message, { MessageErrorPayload } from "../../models/Message";
import OldMessage from "../../models/OldMessage";

import { getIO } from "../../libs/socket";
import CreateMessageService, {
  websocketCreateMessage
} from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService, {
  UpdateTicketData
} from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import TicketTraking from "../../models/TicketTraking";
import UserRating from "../../models/UserRating";
import SendWhatsAppMessage from "./SendWhatsAppMessage";
import Queue from "../../models/Queue";
import QueueOption from "../../models/QueueOption";
import VerifyCurrentSchedule, {
  ScheduleResult
} from "../CompanyService/VerifyCurrentSchedule";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import { campaignQueue } from "../../queues/campaign";
import User from "../../models/User";
import Setting from "../../models/Setting";
import { debounce } from "../../helpers/Debounce";
import { getMessageFileOptions, MediaInfo } from "./SendWhatsAppMedia";
import { makeRandomId } from "../../helpers/MakeRandomId";
import CheckSettings, { GetCompanySetting } from "../../helpers/CheckSettings";
import Whatsapp from "../../models/Whatsapp";
import { SimpleObjectCache } from "../../helpers/simpleObjectCache";
import { getPublicPath } from "../../helpers/GetPublicPath";
import { Session } from "../../libs/wbot";
import { checkCompanyCompliant } from "../../helpers/CheckCompanyCompliant";
import { transcriber } from "../../helpers/transcriber";
import { parseToMilliseconds } from "../../helpers/parseToMilliseconds";
import { randomValue } from "../../helpers/randomValue";
import { getJidOf } from "./getJidOf";
import { verifyContact } from "./verifyContact";
import { decryptMessageEdit } from "./decryptMessageEdit";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import saveMediaToFile from "../../helpers/saveMediaFile";
import { _t } from "../TranslationServices/i18nService";
import WhatsappLidMap from "../../models/WhatsappLidMap";
import RunN8nWebhookService from "../N8nServices/RunN8nWebhookService";
import CreateTicketNoteService from "../TicketNoteService/CreateTicketNoteService";
import {
  getRoutingBotMessage,
  resolveSalesRoutingInbound,
  RoutingInbound
} from "../SalesRoutingServices/SalesRoutingService";

export interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

export interface MentionPayload {
  contactId?: number;
  name?: string;
  number?: string;
}

interface IMe {
  name: string;
  id: string;
}

const wbotMutex = new Mutex();
const ackMutex = new Mutex();

const groupContactCache = new SimpleObjectCache(1000 * 30, logger);
const outOfHoursCache = new SimpleObjectCache(1000 * 60 * 5, logger);

const DEFAULT_AUTOMATED_REPLY_WINDOW_MINUTES = 5;
const DEFAULT_AUTOMATED_REPLY_LIMIT = 6;
const DEFAULT_AUTOMATED_DUPLICATE_REPLY_LIMIT = 2;
const AUTOMATED_REPLY_MANUAL_TRIAGE_ENABLED = "enabled";

const getBoundedCompanyNumberSetting = async (
  companyId: number,
  key: string,
  defaultValue: number,
  minimum: number,
  maximum: number
) => {
  const value = Number.parseInt(
    await GetCompanySetting(companyId, key, String(defaultValue)),
    10
  );

  if (!Number.isFinite(value)) return defaultValue;
  return Math.min(Math.max(value, minimum), maximum);
};

const replaceTextMessageBody = (msg: WAMessage, body: string) => {
  const message: any = msg.message;
  if (!message) return;
  if (typeof message.conversation === "string") {
    message.conversation = body;
  } else if (message.extendedTextMessage?.text !== undefined) {
    message.extendedTextMessage.text = body;
  } else if (message.imageMessage?.caption !== undefined) {
    message.imageMessage.caption = body;
  } else if (message.videoMessage?.caption !== undefined) {
    message.videoMessage.caption = body;
  }
};

const sendSalesRoutingMessage = async (
  wbot: Session,
  ticket: Ticket,
  body: string
) => {
  await sendAutomatedTextMessage(wbot, ticket, body);
};

const handleSalesRoutingBot = async ({
  ticket,
  contact,
  wbot,
  routing,
  justCreated
}: {
  ticket: Ticket;
  contact: Contact;
  wbot: Session;
  routing: RoutingInbound;
  justCreated: boolean;
}): Promise<boolean> => {
  if (ticket.status !== "pending" || ticket.userId) return false;

  if (routing.source === "link") {
    await UpdateTicketService({
      ticketData: { queueId: routing.queueId, chatbot: false, status: "pending" },
      ticketId: ticket.id,
      companyId: ticket.companyId,
      dontRunChatbot: true
    });
    await sendSalesRoutingMessage(
      wbot,
      ticket,
      getRoutingBotMessage(
        routing.config,
        routing.selectedKind === "consultant" ? "selectedConsultant" : "newConsultant",
        { consultora: routing.selectedLabel || "a equipe comercial" }
      )
    );
    return true;
  }

  if (routing.source === "preference") {
    return false;
  }

  // Existing open work must remain with its current owner. The automatic
  // distribution only applies when the incoming message created the ticket.
  if (!justCreated) {
    return false;
  }

  if (routing.source === "random") {
    await ticket.update({ chatbot: false, salesRoutingPending: false });
    await sendSalesRoutingMessage(
      wbot,
      ticket,
      getRoutingBotMessage(routing.config, "newConsultant")
    );
    return true;
  }

  await ticket.update({ chatbot: false, salesRoutingPending: true });
  await sendSalesRoutingMessage(
    wbot,
    ticket,
    getRoutingBotMessage(routing.config, "noConsultants")
  );
  return true;
};

const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const getTypeMessage = (msg: proto.IWebMessageInfo): string => {
  return getContentType(msg.message);
};

const msgLocationBody = (locationMessage: WALocationMessage) => {
  if (!locationMessage) return "";

  let body = "📍\n";

  if (locationMessage.name) {
    body += `*${locationMessage.name}*\n`;
  }

  if (locationMessage.address) {
    body += `_${locationMessage.address}_\n`;
  }

  if (locationMessage.degreesLatitude && locationMessage.degreesLongitude) {
    body += `https://maps.google.com/maps?q=${locationMessage.degreesLatitude}%2C${locationMessage.degreesLongitude}&z=17&hl=pt-BR\n`;
  }

  return body;
};

export const getBodyFromTemplateMessage = (
  templateMessage: proto.Message.ITemplateMessage
) => {
  const title =
    templateMessage.interactiveMessageTemplate?.header?.title?.trim() ||
    templateMessage.hydratedTemplate?.hydratedTitleText?.trim();

  const body =
    templateMessage.interactiveMessageTemplate?.body?.text?.trim() ||
    templateMessage.hydratedTemplate?.hydratedContentText?.trim() ||
    "";

  const footer =
    templateMessage.interactiveMessageTemplate?.footer?.text?.trim() ||
    templateMessage.hydratedTemplate?.hydratedFooterText?.trim();

  return (
    (title ? `*${title}*\n\n` : "") +
    (body || "") +
    (footer ? `\n\n⣿${footer}⣿` : "")
  );
};

const processMention = async (body: string, mention: string) => {
  const payload: MentionPayload = {};

  let contact: Contact;
  if (mention.endsWith("@lid")) {
    const lidMap = await WhatsappLidMap.findOne({
      where: { lid: mention },
      include: [Contact]
    });
    contact = lidMap?.contact;
  }

  if (!contact) {
    contact = await Contact.findOne({
      where: {
        number: {
          [Op.or]: [mention, mention.split("@")[0]]
        }
      }
    });
  }

  if (contact) {
    payload.contactId = contact.id;
    payload.name = contact.name;
    payload.number = contact.number;
  } else {
    // eslint-disable-next-line prefer-destructuring
    payload.number = mention.split("@")[0];
  }

  const b64payload = Buffer.from(JSON.stringify(payload)).toString("base64");
  body = body.replace(`@${mention.split("@")[0]}`, `@[${b64payload}]`);
  return body;
};

export const getBodyMessage = async (msg: proto.IMessage): Promise<string> => {
  try {
    if (!msg) {
      return "";
    }

    const type = getContentType(msg);

    const types = {
      conversation: msg?.conversation,
      editedMessage:
        msg?.editedMessage?.message?.protocolMessage?.editedMessage
          ?.conversation,
      imageMessage: msg?.imageMessage?.caption,
      videoMessage: msg?.videoMessage?.caption,
      extendedTextMessage: msg?.extendedTextMessage?.text,
      buttonsMessage: msg?.buttonsMessage?.contentText,
      listMessage: msg?.listMessage?.description,
      templateMessage:
        msg?.templateMessage && getBodyFromTemplateMessage(msg.templateMessage),
      buttonsResponseMessage: msg?.buttonsResponseMessage?.selectedButtonId,
      templateButtonReplyMessage: msg?.templateButtonReplyMessage?.selectedId,
      messageContextInfo:
        msg?.buttonsResponseMessage?.selectedButtonId ||
        msg?.listResponseMessage?.title,
      viewOnceMessageV2:
        msg?.viewOnceMessageV2?.message?.imageMessage?.caption || "",
      stickerMessage: "sticker",
      contactMessage:
        msg?.contactMessage?.vcard &&
        JSON.stringify({
          ticketzvCard: [
            {
              displayName: msg.contactMessage.displayName,
              vcard: msg.contactMessage.vcard
            }
          ]
        }),
      contactsArrayMessage:
        msg?.contactsArrayMessage &&
        JSON.stringify({
          ticketzvCard: msg.contactsArrayMessage.contacts
        }),
      locationMessage: msgLocationBody(msg?.locationMessage),
      liveLocationMessage: `Latitude: ${msg?.liveLocationMessage?.degreesLatitude} - Longitude: ${msg?.liveLocationMessage?.degreesLongitude}`,
      documentMessage: msg?.documentMessage?.caption,
      documentWithCaptionMessage:
        msg?.documentWithCaptionMessage?.message?.documentMessage?.caption,
      audioMessage: "🔊",
      listResponseMessage:
        msg?.listResponseMessage?.singleSelectReply?.selectedRowId,
      reactionMessage: msg?.reactionMessage?.text || "reaction"
    };

    const objKey = Object.keys(types).find(key => key === type);

    if (!objKey) {
      logger.warn({ type, msg }, "received unsupported message");
      return `unsupported message: ${type}`;
    }
    let body = types[type] || "";
    if (!body && type !== "imageMessage") {
      logger.debug({ msg, type }, "Body is empty");
    }
    if (typeof body !== "string") {
      body = "unsupported body content";
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const mention of (msg[type] as any)?.contextInfo?.mentionedJid ?? []) {
      // eslint-disable-next-line no-await-in-loop
      body = await processMention(body, mention);
    }

    return body;
  } catch (error) {
    logger.error({ error, msg }, `getBodyMessage: error: ${error?.message}`);
    return null;
  }
};

type QuotedMessage = {
  quotedId: string;
  quotedMsg: proto.IMessage | undefined;
  participant: string;
};

/**
 * @description: extract quoted message info from a message
 * @param {proto.IWebMessageInfo} msg - message to extract quoted info from
 * @return {QuotedMessage} - object containing quotedId and quotedMsg
 */
const getQuotedMessage = (msg: proto.IWebMessageInfo): QuotedMessage => {
  const message = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];

  return {
    quotedId:
      message?.contextInfo?.stanzaId || msg?.message?.reactionMessage?.key?.id,
    quotedMsg: message?.contextInfo?.quotedMessage,
    participant: message?.contextInfo?.participant
  };
};

const getMeSocket = (wbot: Session): IMe => {
  return {
    id: jidNormalizedUser((wbot as WASocket).user.id),
    name: (wbot as WASocket).user.name
  };
};

const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;

  const senderId =
    msg.participant || msg.key.participant || msg.key.remoteJid || undefined;

  return senderId && jidNormalizedUser(senderId);
};

const getContactMessage = async (msg: WAMessage, wbot: Session) => {
  const isGroup = msg.key.remoteJid.includes("g.us");
  const rawNumber = msg.key.remoteJid.replace(/\D/g, "");
  return isGroup
    ? {
        id: getSenderMessage(msg, wbot),
        name: msg.pushName
      }
    : {
        id: msg.key.remoteJid,
        lid: msg?.key?.sender_lid,
        jid: msg?.key?.sender_pn,
        name: msg.key.fromMe ? rawNumber : msg.pushName || msg.verifiedBizName
      };
};

const getUnpackedMessage = (msg: proto.IWebMessageInfo) => {
  return (
    msg.message?.documentWithCaptionMessage?.message ||
    msg.message?.ephemeralMessage?.message ||
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.ephemeralMessage?.message ||
    msg.message?.interactiveMessage?.header ||
    msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate ||
    msg.message
  );
};

const getMessageMedia = (message: proto.IMessage) => {
  return (
    message?.imageMessage ||
    message?.audioMessage ||
    message?.videoMessage ||
    message?.stickerMessage ||
    message?.documentMessage ||
    message?.documentWithCaptionMessage?.message?.documentMessage ||
    message?.templateMessage?.interactiveMessageTemplate?.header
      ?.imageMessage ||
    message?.templateMessage?.interactiveMessageTemplate?.header
      ?.videoMessage ||
    message?.templateMessage?.interactiveMessageTemplate?.header
      ?.documentMessage ||
    message?.templateMessage?.hydratedTemplate?.imageMessage ||
    message?.templateMessage?.hydratedTemplate?.videoMessage ||
    message?.templateMessage?.hydratedTemplate?.documentMessage ||
    null
  );
};

const downloadStream = async (stream: Transform): Promise<Buffer> => {
  const MAX_SPEED = (5 * 1024 * 1024) / 8; // 5Mbps
  const THROTTLE_SPEED = (1024 * 1024) / 8; // 1Mbps
  const LARGE_FILE_SIZE = 1024 * 1024; // 1 MiB

  const throttle = new Throttle({ rate: MAX_SPEED });
  let buffer = Buffer.from([]);
  let totalSize = 0;

  try {
    // eslint-disable-next-line no-restricted-syntax
    for await (const chunk of stream.pipe(throttle)) {
      buffer = Buffer.concat([buffer, chunk]);
      totalSize += chunk.length;

      if (totalSize > LARGE_FILE_SIZE) {
        throttle.rate = THROTTLE_SPEED;
      }
    }
  } catch (error) {
    Sentry.setExtra("ERR_WAPP_DOWNLOAD_MEDIA", { error });
    Sentry.captureException(new Error("ERR_WAPP_DOWNLOAD_MEDIA"));
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  return buffer;
};

type ThumbnailMessage = {
  mediaKey?: Uint8Array | null;
  thumbnailDirectPath?: string | null;
  mimetype?: string;
};

export const normalizeThumbnailMediaType = (
  mimetype: string
): "thumbnail-video" | "thumbnail-image" | "thumbnail-document" => {
  const types = ["thumbnail-video", "thumbnail-image", "thumbnail-document"];
  const type = `thumbnail-${mimetype.split("/")[0]}`;

  if (!types.includes(type)) {
    return "thumbnail-document";
  }

  return type as "thumbnail-video" | "thumbnail-image" | "thumbnail-document";
};

const downloadThumbnail = async ({
  thumbnailDirectPath: directPath,
  mediaKey,
  mimetype
}: ThumbnailMessage) => {
  if (!directPath || !mediaKey) {
    return null;
  }

  const mediaType = mimetype
    ? normalizeThumbnailMediaType(mimetype)
    : "thumbnail-link";

  const stream = await downloadContentFromMessage(
    { mediaKey, directPath },
    mediaType
  );

  if (!stream) {
    throw new Error("Failed to get stream");
  }

  const buffer = await downloadStream(stream);

  if (!buffer) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  const filename = `thumbnail-${makeRandomId(5)}-${new Date().getTime()}.jpg`;

  const media = {
    data: buffer,
    mimetype: "image/jpeg",
    filename
  };
  return media;
};

export const normalizeMediaType = (
  mimetype: string
): "audio" | "video" | "image" | "document" => {
  const types = ["audio", "video", "image", "document"];
  const type = mimetype.split("/")[0];

  if (!types.includes(type)) {
    return "document";
  }

  return type as "audio" | "video" | "image" | "document";
};

const downloadMedia = async (
  msg: proto.IMessage,
  wbot: Session,
  ticket: Ticket,
  fromMe: boolean
) => {
  const message = getMessageMedia(msg);

  if (!message) {
    return null;
  }

  const fileLimit = parseInt(await CheckSettings("downloadLimit", "15"), 10);
  if (
    wbot &&
    message?.fileLength &&
    +message.fileLength > fileLimit * 1024 * 1024
  ) {
    const autoMessage = _t("*Automated message*", ticket);
    const limitMessage = _t("Our system only accepts files up to ", ticket);
    const limitInstructions = _t(
      "We received a file beyond the size limit, If necessary, it can be obtained in the WhatsApp application.",
      ticket
    );
    const fileLimitMessage = {
      text: `${autoMessage}: ${limitMessage} ${fileLimit} MiB`
    };

    if (!ticket.isGroup && !fromMe) {
      const sendMsg = await wbot.sendMessage(
        getJidOf(ticket.contact),
        fileLimitMessage
      );

      sendMsg.message.extendedTextMessage.text = `${autoMessage}: ${limitInstructions}.`;

      // eslint-disable-next-line no-use-before-define
      await verifyMessage(sendMsg, ticket, ticket.contact);
    }
    throw new Error("ERR_FILESIZE_OVER_LIMIT");
  }

  const messageType = msg?.documentMessage
    ? "document"
    : normalizeMediaType(message.mimetype);

  let stream: Transform;
  let contDownload = 0;

  while (contDownload < 10 && !stream) {
    try {
      const tmpMessage = { ...message };
      if (tmpMessage?.directPath) {
        tmpMessage.url = "";
      }

      // eslint-disable-next-line no-await-in-loop
      stream = await downloadContentFromMessage(tmpMessage, messageType);
    } catch (error) {
      contDownload += 1;
      // eslint-disable-next-line no-await-in-loop, no-loop-func
      await new Promise(resolve => {
        setTimeout(resolve, 1000 * contDownload * 2);
      });
      logger.warn({ msg }, `>>>> erro ${contDownload} de baixar o arquivo`);
    }
  }

  if (!stream) {
    throw new Error("Failed to get stream");
  }

  const buffer = await downloadStream(stream);

  if (!buffer) {
    Sentry.setExtra("ERR_WAPP_DOWNLOAD_MEDIA", { msg });
    Sentry.captureException(new Error("ERR_WAPP_DOWNLOAD_MEDIA"));
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  let filename = msg?.documentMessage?.fileName || "";

  if (!filename) {
    const ext = message.mimetype.split("/")[1].split(";")[0];
    filename = `${makeRandomId(5)}-${new Date().getTime()}.${ext}`;
  }

  const media = {
    data: buffer,
    mimetype: message.mimetype,
    filename
  };
  return media;
};

const storeQuotedMessage = async (
  quotedMessage: QuotedMessage,
  ticket: Ticket,
  wbot: Session
): Promise<Message> => {
  const { quotedId, quotedMsg, participant } = quotedMessage;

  if (!quotedMsg || !quotedId || !participant) return null;

  if (!wbot) {
    wbot = await GetTicketWbot(ticket);
  }

  const body = (await getBodyMessage(quotedMsg)) || "";
  const fromMe = !!wbot.myJid && participant === wbot.myJid;

  const messageMedia = getMessageMedia(quotedMsg);

  const thumbnailMsg =
    messageMedia && keys(messageMedia).includes("thumbnailDirectPath")
      ? messageMedia
      : null;
  const thumbnailMedia =
    thumbnailMsg && (await downloadThumbnail(thumbnailMsg));
  const media =
    messageMedia && (await downloadMedia(quotedMsg, wbot, ticket, fromMe));

  let mediaUrl = null;
  if (media) {
    // eslint-disable-next-line no-use-before-define
    mediaUrl = await saveMediaToFile(media, { destination: ticket });
  }

  let thumbnailUrl = null;
  if (thumbnailMedia) {
    // eslint-disable-next-line no-use-before-define
    thumbnailUrl = await saveMediaToFile(thumbnailMedia, {
      destination: ticket
    });
  }

  const mediaType = media?.mimetype.split("/")[0];

  const messageData = {
    id: `${quotedId}-${ticket.id}`,
    ticketId: ticket.id,
    body,
    fromMe,
    mediaType,
    mediaUrl,
    thumbnailUrl,
    read: true,
    dataJson: JSON.stringify(quotedMsg)
  };

  return CreateMessageService({
    messageData,
    companyId: ticket.companyId
  });
};

const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  wbot?: Session
): Promise<Message | null> => {
  if (!msg) return null;
  const quotedMessage = getQuotedMessage(msg);
  const { quotedId } = quotedMessage;

  if (!quotedId) return null;

  const quotedTicketId = `${quotedId}-${ticket.id}`;

  // find message for any of quotedId and quotedTicketId
  const dbQuotedMsg = await Message.findOne({
    where: {
      id: {
        [Op.or]: [quotedId, quotedTicketId]
      },
      ticketId: ticket?.id
    }
  });

  if (!dbQuotedMsg) {
    return storeQuotedMessage(quotedMessage, ticket, wbot);
  }

  return dbQuotedMsg;
};

/**
 * @description: call UpdateTicketService to update ticket status, if ticketData have a queue id it will not run the chatbot
 * @params {Ticket} ticket - ticket to be updated
 * @params {UpdateTicketData} ticketData - data to be updated
 * @returns {Promise<Ticket>} - updated ticket
 */
async function updateTicket(
  ticket: Ticket,
  ticketData: UpdateTicketData
): Promise<Ticket> {
  await UpdateTicketService({
    ticketData,
    ticketId: ticket.id,
    companyId: ticket.companyId,
    dontRunChatbot: !!ticketData.queueId
  });
  await ticket.reload();
  return ticket;
}

const getN8nActionData = (action: any) =>
  action?.type === "command" && action?.data ? action.data : action;

const getN8nActionText = (action: any) => {
  if (action?.type === "message") return action.text || action.content;
  if (action?.type === "text") return action.content || action.text;
  if (action?.message?.content) return action.message.content;
  return null;
};

const getN8nInternalNote = (data: any) =>
  data?.note || data?.internalNote || data?.summary || data?.transferNote;

const createN8nNote = async (ticket: Ticket, note: string) => {
  const user = await User.findOne({
    where: { companyId: ticket.companyId, profile: "admin" }
  });

  if (!user) return;

  await CreateTicketNoteService({
    note,
    userId: user.id,
    contactId: ticket.contactId,
    ticketId: ticket.id
  });
};

const pauseAutomatedRepliesAfterBurst = async (
  ticket: Ticket,
  body?: string
) => {
  const [
    windowMinutes,
    replyLimit,
    duplicateReplyLimit,
    manualTriage,
    manualTriageQueueId
  ] = await Promise.all([
    getBoundedCompanyNumberSetting(
      ticket.companyId,
      "automatedReplyWindowMinutes",
      DEFAULT_AUTOMATED_REPLY_WINDOW_MINUTES,
      1,
      60
    ),
    getBoundedCompanyNumberSetting(
      ticket.companyId,
      "automatedReplyLimit",
      DEFAULT_AUTOMATED_REPLY_LIMIT,
      2,
      50
    ),
    getBoundedCompanyNumberSetting(
      ticket.companyId,
      "automatedDuplicateReplyLimit",
      DEFAULT_AUTOMATED_DUPLICATE_REPLY_LIMIT,
      1,
      10
    ),
    GetCompanySetting(ticket.companyId, "automatedReplyManualTriage", "disabled"),
    GetCompanySetting(ticket.companyId, "automatedReplyManualTriageQueueId", "0")
  ]);
  const createdAfter = new Date(Date.now() - windowMinutes * 60 * 1000);
  const totalRepliesWhere = {
    ticketId: ticket.id,
    fromMe: true,
    createdAt: { [Op.gte]: createdAfter }
  };
  const duplicateRepliesWhere = body
    ? { ...totalRepliesWhere, body }
    : null;

  const [automaticReplies, duplicateReplies] = await Promise.all([
    Message.count({ where: totalRepliesWhere }),
    duplicateRepliesWhere ? Message.count({ where: duplicateRepliesWhere }) : 0
  ]);

  if (
    automaticReplies < replyLimit &&
    duplicateReplies < duplicateReplyLimit
  ) {
    return false;
  }

  const triageQueueId = Number.parseInt(manualTriageQueueId, 10);
  const triageQueue =
    manualTriage === AUTOMATED_REPLY_MANUAL_TRIAGE_ENABLED &&
    Number.isInteger(triageQueueId) &&
    triageQueueId > 0
      ? await Queue.findOne({
          where: { id: triageQueueId, companyId: ticket.companyId }
        })
      : null;

  await updateTicket(ticket, {
    chatbot: false,
    queueOptionId: null,
    ...(triageQueue
      ? {
          queueId: triageQueue.id,
          userId: null,
          status: "pending"
        }
      : {})
  });

  await createN8nNote(
    ticket,
    triageQueue
      ? `Anotacao automatica: as respostas do bot foram bloqueadas para evitar mensagens repetidas. O atendimento foi transferido para a fila ${triageQueue.name} para triagem manual.`
      : "Anotacao automatica: as respostas do bot foram bloqueadas para evitar mensagens repetidas. O atendimento aguarda intervencao humana."
  );

  logger.warn(
    {
      ticketId: ticket.id,
      companyId: ticket.companyId,
      whatsappId: ticket.whatsappId,
      automaticReplies,
      duplicateReplies,
      windowMinutes,
      replyLimit,
      duplicateReplyLimit,
      manualTriageQueueId: triageQueue?.id || null
    },
    "Automated replies blocked after burst detection"
  );

  return true;
};

async function sendAutomatedTextMessage(
  wbot: Session,
  ticket: Ticket,
  body: string
) {
  if (await pauseAutomatedRepliesAfterBurst(ticket, body)) {
    return false;
  }

  const message = await wbot.sendMessage(getJidOf(ticket), { text: body });
  await verifyMessage(message, ticket, ticket.contact);
  return true;
}

const wasInboundMessageAlreadyProcessed = async (
  msg: proto.IWebMessageInfo,
  contact: Contact,
  companyId: number,
  isGroup: boolean
) => {
  if (msg.key.fromMe || isGroup || !msg.key.id) {
    return false;
  }

  const duplicateMessage = await Message.findOne({
    where: {
      id: msg.key.id,
      companyId,
      contactId: contact.id,
      fromMe: false
    },
    order: [["createdAt", "DESC"]]
  });

  if (!duplicateMessage) {
    return false;
  }

  logger.info(
    {
      companyId,
      contactId: contact.id,
      messageId: msg.key.id,
      remoteJid: msg.key.remoteJid,
      originalTicketId: duplicateMessage.ticketId
    },
    "Ignoring duplicated incoming WhatsApp message before ticket lookup"
  );

  return true;
};

const handleN8nQueueWebhook = async (
  ticket: Ticket,
  message: Message,
  wbot: Session
) => {
  const reloadN8nTicket = async () => {
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: Contact, as: "contact" },
        { model: User, as: "user" },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });
  };

  const isHandledByAgent = () => ticket.status === "open" && !!ticket.userId;

  await reloadN8nTicket();

  if (!ticket.queue?.n8nWebhookEnabled || !ticket.queue?.n8nWebhookUrl) {
    return false;
  }

  if (isHandledByAgent()) {
    return false;
  }

  if (ticket.chatbot) {
    await updateTicket(ticket, {
      chatbot: false,
      queueOptionId: null
    });
  }

  const actions = await RunN8nWebhookService(
    ticket.queue,
    ticket,
    message,
    ticket.whatsapp
  );

  for (const action of actions) {
    await reloadN8nTicket();
    if (isHandledByAgent()) {
      return true;
    }

    const waitSeconds = Number(action?.trigger?.seconds || action?.waitSeconds);
    if (Number.isFinite(waitSeconds) && waitSeconds > 0) {
      await wait(Math.min(waitSeconds, 30) * 1000);
      await reloadN8nTicket();
      if (isHandledByAgent()) {
        return true;
      }
    }

    const text = getN8nActionText(action);
    if (text) {
      await sendAutomatedTextMessage(wbot, ticket, formatBody(text, ticket));
    }

    const data = getN8nActionData(action);

    const internalNote = getN8nInternalNote(data);
    if (internalNote) {
      await createN8nNote(ticket, internalNote);
    }

    if (data?.queueId) {
      await updateTicket(ticket, {
        queueId: Number(data.queueId),
        userId: null,
        status: "pending",
        chatbot: false,
        queueOptionId: null
      });
    }

    if (data?.closeTicket) {
      await updateTicket(ticket, {
        status: "closed",
        justClose: true,
        chatbot: false,
        queueOptionId: null
      });
    }
  }

  return true;
};

type VerifyMessageOptions = {
  userId?: number;
  skipWebsocket?: boolean;
};

type VerifyMediaMessageOptions = VerifyMessageOptions & {
  messageMedia?: WAGenericMediaMessage | null;
  mediaInfo?: MediaInfo | null;
  wbot?: Session | null;
};

export const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  {
    wbot,
    messageMedia,
    userId,
    mediaInfo,
    skipWebsocket
  }: VerifyMediaMessageOptions = {}
): Promise<Message> => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg, ticket, wbot);

  const thumbnailMsg = messageMedia || msg?.message?.extendedTextMessage;
  const thumbnailMedia =
    thumbnailMsg && (await downloadThumbnail(thumbnailMsg));
  const media =
    !mediaInfo &&
    (await downloadMedia(
      getUnpackedMessage(msg),
      wbot,
      ticket,
      msg.key?.fromMe
    ));

  if (!mediaInfo && !media && !thumbnailMedia) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  let mediaUrl = mediaInfo?.mediaUrl || null;
  if (media) {
    mediaUrl = await saveMediaToFile(media, { destination: ticket });
  }

  let thumbnailUrl = null;
  if (thumbnailMedia) {
    thumbnailUrl = await saveMediaToFile(thumbnailMedia, {
      destination: ticket
    });
  }

  const mimetype = mediaInfo?.mimetype || media?.mimetype || "";
  const mediaType = mimetype.split("/")[0];
  const filename = mediaInfo?.filename || media?.filename || "file.bin";

  let body = await getBodyMessage(msg?.message);

  if (
    mediaType === "audio" &&
    (await GetCompanySetting(
      ticket.companyId,
      "audioTranscriptions",
      "disabled"
    )) === "enabled"
  ) {
    const apiKey = await GetCompanySetting(ticket.companyId, "openAiKey", null);
    const provider = await GetCompanySetting(
      ticket.companyId,
      "aiProvider",
      "openai"
    );

    if (apiKey) {
      try {
        const audioTranscription = await transcriber(
          mediaUrl.startsWith("http")
            ? mediaUrl
            : `${getPublicPath()}/${mediaUrl}`,
          { apiKey, provider },
          filename
        );
        if (audioTranscription) {
          body = audioTranscription;
        }
      } catch (error) {
        logger.error(
          { message: error?.message },
          "Error transcribing audio message"
        );
      }
    }
  }

  const messageData = {
    id: msg.key.id,
    ticketId: ticket.id,
    userId,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body: body || "",
    fromMe: msg.key.fromMe,
    read: msg.key.fromMe,
    mediaUrl,
    mediaType,
    thumbnailUrl,
    quotedMsgId: quotedMsg?.id,
    ack: msg.status || 0,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg)
  };

  await ticket.update({
    lastMessage: body || filename ? `📎 ${filename}` : ""
  });

  const newMessage = await CreateMessageService({
    messageData,
    companyId: ticket.companyId,
    skipWebsocket
  });

  if (!msg.key.fromMe && ticket.status === "closed") {
    await updateTicket(ticket, { status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });

    io.to(`company-${ticket.companyId}-closed`)
      .to(`queue-${ticket.queueId}-closed`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "delete",
        ticket,
        ticketId: ticket.id
      });

    io.to(`company-${ticket.companyId}-${ticket.status}`)
      .to(`queue-${ticket.queueId}-${ticket.status}`)
      .to(ticket.id.toString())
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }

  return newMessage;
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  { userId, skipWebsocket }: VerifyMessageOptions = {}
) => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg, ticket);
  const body = await getBodyMessage(msg?.message);

  const messageData = {
    id: msg.key.id,
    ticketId: ticket.id,
    userId,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: msg.message.reactionMessage ? "reactionMessage" : null,
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack: msg.status || 0,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
    isEdited: false
  };

  await ticket.update({
    lastMessage: body.substring(0, 255).replace(/\n/g, " ")
  });

  const newMessage = await CreateMessageService({
    messageData,
    companyId: ticket.companyId,
    skipWebsocket
  });

  if (!msg.key.fromMe && ticket.status === "closed") {
    await updateTicket(ticket, { status: "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });

    io.to(`company-${ticket.companyId}-closed`)
      .to(`queue-${ticket.queueId}-closed`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "delete",
        ticket,
        ticketId: ticket.id
      });

    io.to(`company-${ticket.companyId}-${ticket.status}`)
      .to(`queue-${ticket.queueId}-${ticket.status}`)
      .to(ticket.id.toString())
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "update",
        ticket,
        ticketId: ticket.id
      });
  }

  return newMessage;
};

export const verifyEditedMessage = async (
  msg: proto.IMessage,
  ticket: Ticket,
  msgId: string
) => {
  const editedText =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.documentWithCaptionMessage?.message?.documentMessage?.caption;

  if (!editedText) return;

  const editedMsg = await Message.findByPk(msgId);
  const messageData = {
    id: editedMsg.id,
    ticketId: editedMsg.ticketId,
    contactId: editedMsg.contactId,
    body: editedText,
    fromMe: editedMsg.fromMe,
    mediaType: editedMsg.mediaType,
    read: editedMsg.read,
    quotedMsgId: editedMsg.quotedMsgId,
    ack: editedMsg.ack,
    remoteJid: editedMsg.remoteJid,
    participant: editedMsg.participant,
    dataJson: editedMsg.dataJson,
    isEdited: true
  };

  const oldMessage = {
    messageId: messageData.id,
    body: editedMsg.body,
    ticketId: editedMsg.ticketId
  };

  await OldMessage.upsert(oldMessage);

  await ticket.update({
    lastMessage: messageData.body
  });

  await CreateMessageService({ messageData, companyId: ticket.companyId });

  const io = getIO();

  io.to(ticket.status)
    .to(ticket.id.toString())
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};

const markEditedMessageWithError = async (ticket: Ticket, msgId: string) => {
  const editedMsg = await Message.findByPk(msgId);
  if (!editedMsg) {
    return;
  }

  const editErrorLabel = _t("Failed to process message edit", ticket);
  const errorBody = editedMsg.body
    ? `${editedMsg.body}\n[${editErrorLabel}]`
    : `[${editErrorLabel}]`;

  const messageData = {
    id: editedMsg.id,
    ticketId: editedMsg.ticketId,
    contactId: editedMsg.contactId,
    body: errorBody,
    fromMe: editedMsg.fromMe,
    mediaType: editedMsg.mediaType,
    read: editedMsg.read,
    quotedMsgId: editedMsg.quotedMsgId,
    ack: editedMsg.ack,
    remoteJid: editedMsg.remoteJid,
    participant: editedMsg.participant,
    dataJson: editedMsg.dataJson,
    isEdited: true
  };

  const oldMessage = {
    messageId: messageData.id,
    body: editedMsg.body,
    ticketId: editedMsg.ticketId
  };

  await OldMessage.upsert(oldMessage);

  await ticket.update({
    lastMessage: messageData.body.substring(0, 255).replace(/\n/g, " ")
  });

  await CreateMessageService({ messageData, companyId: ticket.companyId });

  const io = getIO();

  io.to(ticket.status)
    .to(ticket.id.toString())
    .emit(`company-${ticket.companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};

export const verifyDeleteMessage = async (
  msg: proto.Message.IProtocolMessage,
  ticket: Ticket
) => {
  const message = await Message.findByPk(msg.key.id, {
    include: [
      "contact",
      {
        model: Ticket,
        include: [
          {
            model: Contact
          }
        ]
      }
    ]
  });

  if (!message) {
    return;
  }

  await message.update({
    isDeleted: true
  });

  const io = getIO();
  io.to(message.ticketId.toString())
    .to(message.ticket.status)
    .to("notification")
    .emit(`company-${ticket.companyId}-appMessage`, {
      action: "create",
      message,
      ticket: message.ticket,
      contact: message.ticket.contact
    });
};

const quickMessage = async (
  wbot: Session,
  ticket: Ticket,
  text: string,
  saveOnTicket = false
) => {
  const debouncedSentMessage = debounce(
    async () => {
      const sentMessage = await wbot.sendMessage(getJidOf(ticket.contact), {
        text: `\u200e${text}`
      });
      if (saveOnTicket) {
        verifyMessage(sentMessage, ticket, ticket.contact);
      }
    },
    1000,
    ticket.id
  );
  debouncedSentMessage();
};

const isValidMsg = (msg: proto.IWebMessageInfo): boolean => {
  if (msg.key.remoteJid === "status@broadcast") return false;
  try {
    const msgType = getTypeMessage(msg);
    if (!msgType) {
      return false;
    }

    const ifType =
      msgType === "conversation" ||
      msgType === "editedMessage" ||
      msgType === "secretEncryptedMessage" ||
      msgType === "extendedTextMessage" ||
      msgType === "audioMessage" ||
      msgType === "videoMessage" ||
      msgType === "imageMessage" ||
      msgType === "documentMessage" ||
      msgType === "documentWithCaptionMessage" ||
      msgType === "stickerMessage" ||
      msgType === "buttonsResponseMessage" ||
      msgType === "buttonsMessage" ||
      msgType === "templateButtonReplyMessage" ||
      msgType === "messageContextInfo" ||
      msgType === "locationMessage" ||
      msgType === "liveLocationMessage" ||
      msgType === "contactMessage" ||
      msgType === "voiceMessage" ||
      msgType === "mediaMessage" ||
      msgType === "contactsArrayMessage" ||
      msgType === "reactionMessage" ||
      msgType === "ephemeralMessage" ||
      msgType === "protocolMessage" ||
      msgType === "listResponseMessage" ||
      msgType === "listMessage" ||
      msgType === "templateMessage" ||
      msgType === "viewOnceMessage" ||
      msgType === "viewOnceMessageV2";

    if (!ifType) {
      logger.warn(`#### Nao achou o type em isValidMsg: ${msgType}
${JSON.stringify(msg?.message)}`);
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, msg, msgType });
      Sentry.captureException(new Error("Novo Tipo de Mensagem em isValidMsg"));
    }

    return !!ifType;
  } catch (error) {
    Sentry.setExtra("Error isValidMsg", { msg });
    Sentry.captureException(error);
    return false;
  }
};

const emojiNumberOption = (number: number): string => {
  const numEmojis = [
    "0️⃣",
    "1️⃣",
    "2️⃣",
    "3️⃣",
    "4️⃣",
    "5️⃣",
    "6️⃣",
    "7️⃣",
    "8️⃣",
    "9️⃣",
    "🔟"
  ];

  return number <= 10 ? numEmojis[number] : `[ ${number} ]`;
};

const sendMenu = async (
  wbot: Session,
  ticket: Ticket,
  currentOption: Queue | QueueOption,
  sendBackToMain = true,
  introMessage = ""
) => {
  const message =
    currentOption instanceof Queue
      ? (currentOption as Queue).greetingMessage
      : (currentOption as QueueOption).message;

  const botText = async () => {
    const showNumericIcons =
      currentOption.options.length <= 10 &&
      (await GetCompanySetting(
        ticket.companyId,
        "showNumericIcons",
        "disabled"
      )) === "enabled";

    let options = "";

    currentOption.options.forEach(option => {
      options += showNumericIcons
        ? `${emojiNumberOption(Number(option.option))} - `
        : `*[ ${option.option} ]* - `;
      options += `${option.title}\n`;
    });

    if (sendBackToMain) {
      options += `\n${showNumericIcons ? "#️⃣" : "[ # ]"} - ${_t(
        "Back to Main Menu",
        ticket
      )}`;
    }

    const textBody = introMessage
      ? `${introMessage}\n\n${message}\n\n${options}`
      : `${message}\n\n${options}`;

    const textMessage = {
      text: formatBody(textBody, ticket)
    };

    await sendAutomatedTextMessage(wbot, ticket, textMessage.text);
  };

  await botText();
};

const invalidChatbotOptionMessage = (ticket: Ticket) =>
  _t(
    "Opcao invalida. Por favor, escolha uma das opcoes abaixo.",
    ticket
  );

export const startQueue = async (
  wbot: Session,
  ticket: Ticket,
  queue: Queue = null,
  sendBackToMain = true
) => {
  if (!queue) {
    queue = await Queue.findByPk(ticket.queueId, {
      include: [
        {
          model: QueueOption,
          as: "options",
          where: { parentId: null },
          required: false
        }
      ],
      order: [["options", "option", "ASC"]]
    });
  }

  const { companyId, contact } = ticket;
  const n8nWebhookEnabled = Boolean(
    queue?.n8nWebhookEnabled && queue?.n8nWebhookUrl
  );
  let chatbot = false;

  if (!n8nWebhookEnabled && queue?.options) {
    chatbot = queue.options.length > 0;
  }
  await UpdateTicketService({
    ticketData: { queueId: queue.id, chatbot, status: "pending" },
    ticketId: ticket.id,
    companyId: ticket.companyId,
    dontRunChatbot: true
  });

  if (n8nWebhookEnabled) {
    return;
  }

  // do not process queue if company is not compliant with payments
  if (!(await checkCompanyCompliant(companyId))) {
    return;
  }

  let filePath = null;
  let optionsMsg = null;

  if (queue.mediaPath !== null && queue.mediaPath !== "") {
    filePath = path.resolve("public", queue.mediaPath);

    // check if file not exists
    if (!fs.existsSync(filePath)) {
      filePath = null;
    }
  }

  if (filePath) {
    optionsMsg = await getMessageFileOptions(queue.mediaName, filePath);
  }

  /* Tratamento para envio de mensagem quando a fila está fora do expediente */
  let currentSchedule: ScheduleResult;

  const scheduleType = await GetCompanySetting(
    companyId,
    "scheduleType",
    "disabled"
  );

  if (scheduleType === "queue") {
    currentSchedule = await VerifyCurrentSchedule(ticket.companyId, queue.id);

    if (
      !isNil(currentSchedule) &&
      (!currentSchedule || currentSchedule.inActivity === false)
    ) {
      outOfHoursCache.set(`ticket-${ticket.id}`, true);
      const outOfHoursMessage =
        queue.outOfHoursMessage?.trim() ||
        "Estamos fora do horário de expediente";
      await sendAutomatedTextMessage(
        wbot,
        ticket,
        formatBody(outOfHoursMessage, ticket)
      );
      const outOfHoursAction = await GetCompanySetting(
        companyId,
        "outOfHoursAction",
        "pending"
      );
      await UpdateTicketService({
        ticketData: {
          queueId: queue.id,
          chatbot: false,
          status: outOfHoursAction
        },
        ticketId: ticket.id,
        companyId: ticket.companyId
      });
      return;
    }
  }

  if (queue.options.length === 0) {
    if (queue.greetingMessage?.trim()) {
      const body = formatBody(`${queue.greetingMessage.trim()}`, ticket);

      if (filePath) {
        optionsMsg.caption = body;
      } else {
        await sendAutomatedTextMessage(wbot, ticket, body);
        return;
      }
    }

    if (filePath) {
      const sentMediaMessage = await wbot.sendMessage(getJidOf(ticket), {
        ...optionsMsg
      });
      await verifyMediaMessage(sentMediaMessage, ticket, contact);
    }
  } else {
    if (filePath) {
      const sentMediaMessage = await wbot.sendMessage(getJidOf(ticket), {
        ...optionsMsg
      });
      await verifyMediaMessage(sentMediaMessage, ticket, contact);
    }
    await sendMenu(wbot, ticket, queue, sendBackToMain);
  }
};

const verifyQueue = async (
  wbot: Session,
  msg: proto.IWebMessageInfo | null,
  ticket: Ticket,
  _contact: Contact
) => {
  const whatsapp = await ShowWhatsAppService(wbot.id!);

  if (!whatsapp) {
    throw new Error("ERR_NO_WAPP_FOUND");
  }

  const { queues, greetingMessage } = whatsapp;

  if (queues.length === 1) {
    await startQueue(wbot, ticket, head(queues), false);
    return;
  }

  const showNumericIcons =
    queues.length <= 10 &&
    (await GetCompanySetting(
      ticket.companyId,
      "showNumericIcons",
      "disabled"
    )) === "enabled";

  const selectedOption = msg ? await getBodyMessage(msg?.message) : null;
  const choosenQueue = selectedOption ? queues[+selectedOption - 1] : null;

  const botText = async () => {
    let options = "";

    queues.forEach((queue, index) => {
      options += showNumericIcons
        ? `${emojiNumberOption(index + 1)} - `
        : `*[ ${index + 1} ]* - `;
      options += `${queue.name}\n`;
    });

    const textMessage = {
      text: formatBody(`${greetingMessage}\n\n${options}`, ticket)
    };

    await sendAutomatedTextMessage(wbot, ticket, textMessage.text);
  };

  if (choosenQueue) {
    await startQueue(wbot, ticket, choosenQueue);
  } else {
    botText();
    await updateTicket(ticket, {
      chatbot: true
    });
  }
};

const handleRating = async (
  rate: number,
  ticket: Ticket,
  ticketTraking: TicketTraking,
  wbot: Session
) => {
  const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

  if (!whatsapp) {
    throw new Error("ERR_NO_WAPP_FOUND");
  }

  let finalRate = rate;

  if (rate < 1) {
    finalRate = 1;
  }
  if (rate > 5) {
    finalRate = 5;
  }

  await UserRating.create({
    ticketId: ticketTraking.ticketId,
    companyId: ticketTraking.companyId,
    userId: ticketTraking.userId,
    rate: finalRate
  });

  const complationMessage =
    whatsapp.complationMessage.trim() || _t("Service completed", ticket);

  const text = formatBody(`\u200e${complationMessage}`, ticket);

  wbot
    .sendMessage(getJidOf(ticket), {
      text
    })
    .then(
      () => {
        ticketTraking.update({
          rated: true
        });
      },
      e => logger.error({ e }, "error sending message")
    );
};

const handleChartbot = async (
  ticket: Ticket,
  msg: WAMessage,
  wbot: Session,
  dontReadTheFirstQuestion = false
) => {
  const queue = await Queue.findByPk(ticket.queueId, {
    include: [
      {
        model: QueueOption,
        as: "options",
        where: { parentId: null }
      }
    ],
    order: [["options", "option", "ASC"]]
  });

  const messageBody = await getBodyMessage(msg?.message);

  if (messageBody === "#") {
    // voltar para o menu inicial
    await updateTicket(ticket, {
      queueOptionId: null,
      chatbot: false,
      queueId: null
    });
    await verifyQueue(wbot, msg, ticket, ticket.contact);
    return;
  }

  // voltar para o menu anterior
  if (!isNil(queue) && !isNil(ticket.queueOptionId) && messageBody === "#") {
    const option = await QueueOption.findByPk(ticket.queueOptionId);
    await ticket.update({ queueOptionId: option?.parentId });

    // escolheu uma opção
  } else if (!isNil(queue) && !isNil(ticket.queueOptionId)) {
    const count = await QueueOption.count({
      where: { parentId: ticket.queueOptionId }
    });
    let option: QueueOption = null;
    if (count === 1) {
      option = await QueueOption.findOne({
        where: { parentId: ticket.queueOptionId }
      });
    } else {
      option = await QueueOption.findOne({
        where: {
          option: messageBody || "",
          parentId: ticket.queueOptionId
        }
      });
    }
    if (option) {
      await ticket.update({ queueOptionId: option?.id });
      // if (option.mediaPath !== null && option.mediaPath !== "")  {

      //   const filePath = path.resolve("public", option.mediaPath);

      //   const optionsMsg = await getMessageOptions(option.mediaName, filePath);

      //   let sentMessage = await wbot.sendMessage(`${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, { ...optionsMsg });

      //   await verifyMediaMessage(sentMessage, ticket, ticket.contact);
      // }
    } else {
      await ticket.update({ queueOptionId: null });
      await sendMenu(
        wbot,
        ticket,
        queue,
        true,
        invalidChatbotOptionMessage(ticket)
      );
      return;
    }

    // não linha a primeira pergunta
  } else if (
    !isNil(queue) &&
    isNil(ticket.queueOptionId) &&
    !dontReadTheFirstQuestion
  ) {
    const option = queue?.options.find(o => o.option === messageBody);
    if (option) {
      await ticket.update({ queueOptionId: option?.id });
    } else if (
      (await GetCompanySetting(
        ticket.companyId,
        "chatbotAutoExit",
        "disabled"
      )) === "enabled"
    ) {
      // message didn't identified an option and company setting to exit chatbot
      await updateTicket(ticket, { chatbot: false });
      const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
      if (whatsapp.transferMessage) {
        const body = formatBody(`${whatsapp.transferMessage}`, ticket);
        await SendWhatsAppMessage({ body, ticket });
      }
    } else {
      await sendMenu(
        wbot,
        ticket,
        queue,
        true,
        invalidChatbotOptionMessage(ticket)
      );
    }
  }

  await ticket.reload();

  /* * /
  if (!isNil(queue) && isNil(ticket.queueOptionId)) {
    await sendMenu(wbot, ticket, queue);
  } else /* */ if (!isNil(queue) && !isNil(ticket.queueOptionId)) {
    const currentOption = await QueueOption.findByPk(ticket.queueOptionId, {
      include: [
        {
          model: Queue,
          as: "forwardQueue",
          include: [
            {
              model: QueueOption,
              as: "options",
              where: { parentId: null },
              required: false
            }
          ]
        },
        {
          model: QueueOption,
          as: "options",
          required: false
        }
      ],
      order: [
        [
          Sequelize.cast(
            Sequelize.col("forwardQueue.options.option"),
            "INTEGER"
          ),
          "ASC"
        ],
        [Sequelize.cast(Sequelize.col("options.option"), "INTEGER"), "ASC"]
      ]
    });

    let filePath = null;
    let optionsMsg = null;
    if (currentOption.mediaPath !== null && currentOption.mediaPath !== "") {
      filePath = path.resolve("public", currentOption.mediaPath);
      if (!fs.existsSync(filePath)) {
        filePath = null;
      }
    }

    if (filePath) {
      optionsMsg = await getMessageFileOptions(
        currentOption.mediaName,
        filePath
      );
    }

    if (currentOption.exitChatbot || currentOption.forwardQueueId) {
      const text = formatBody(`${currentOption.message.trim()}`, ticket);

      if (filePath) {
        optionsMsg.caption = text || undefined;
        const sentMessage = await wbot.sendMessage(getJidOf(ticket), {
          ...optionsMsg
        });
        await verifyMediaMessage(sentMessage, ticket, ticket.contact);
      } else if (text) {
        await sendAutomatedTextMessage(wbot, ticket, text);
      }

      if (currentOption.exitChatbot) {
        await updateTicket(ticket, {
          chatbot: false,
          queueOptionId: null
        });
      } else if (currentOption.forwardQueueId) {
        await updateTicket(ticket, {
          queueOptionId: null,
          chatbot: false,
          queueId: currentOption.forwardQueueId
        });
        await startQueue(wbot, ticket, currentOption.forwardQueue);
      }
      return;
    }

    if (filePath) {
      const sentMessage = await wbot.sendMessage(getJidOf(ticket), {
        ...optionsMsg
      });
      await verifyMediaMessage(sentMessage, ticket, ticket.contact);
    }

    if (currentOption.options.length > -1) {
      await sendMenu(wbot, ticket, currentOption);
    }
  }
};

const handleMessage = async (
  msg: WAMessage,
  wbot: Session,
  companyId: number,
  queueId?: number
): Promise<void> => {
  if (!isValidMsg(msg)) return;

  if (msg.message?.ephemeralMessage) {
    msg.message = msg.message.ephemeralMessage.message;
  }

  try {
    let msgContact: IMe;
    let groupContact: Contact | undefined;

    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    if (isGroup) {
      const msgIsGroupBlock = await Setting.findOne({
        where: {
          companyId,
          key: "CheckMsgIsGroup"
        }
      });

      if (!msgIsGroupBlock || msgIsGroupBlock.value === "enabled") {
        return;
      }
    }

    let bodyMessage = await getBodyMessage(msg?.message);
    const msgType = getTypeMessage(msg);

    const unpackedMessage = getUnpackedMessage(msg);
    const messageMedia = unpackedMessage && getMessageMedia(unpackedMessage);
    if (msg.key.fromMe) {
      if (bodyMessage?.startsWith("\u200e")) return;

      if (
        !messageMedia &&
        msgType !== "conversation" &&
        msgType !== "extendedTextMessage" &&
        msgType !== "vcard" &&
        msgType !== "protocolMessage"
      )
        return;
      msgContact = await getContactMessage(msg, wbot);
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    if (isGroup) {
      groupContact = await wbotMutex.runExclusive(async () => {
        let result = groupContactCache.get(msg.key.remoteJid);
        if (!result) {
          const groupMetadata = await wbot.groupMetadata(msg.key.remoteJid);
          const msgGroupContact = {
            id: groupMetadata.id,
            name: groupMetadata.subject
          };
          result = await verifyContact(msgGroupContact, wbot, companyId);
          groupContactCache.set(msg.key.remoteJid, result);
        }
        return result;
      });
    }

    const whatsapp = await ShowWhatsAppService(wbot.id!);

    if (!whatsapp) {
      throw new Error("ERR_NO_WAPP_FOUND");
    }

    const contact = await verifyContact(msgContact, wbot, companyId);

    const salesRouting = !msg.key.fromMe && !isGroup
      ? await resolveSalesRoutingInbound({
          companyId,
          whatsappId: wbot.id!,
          contact,
          body: bodyMessage || ""
        })
      : null;

    if (salesRouting && salesRouting.cleanBody !== bodyMessage) {
      bodyMessage = salesRouting.cleanBody || "Ol\u00e1!";
      replaceTextMessageBody(msg, bodyMessage);
    }

    if (
      await wasInboundMessageAlreadyProcessed(msg, contact, companyId, isGroup)
    ) {
      return;
    }

    if (!msg.key.fromMe && !contact.isGroup) {
      const userRatingEnabled =
        (await GetCompanySetting(companyId, "userRating", "")) === "enabled";

      const ticketTracking =
        userRatingEnabled &&
        (await TicketTraking.findOne({
          where: {
            whatsappId: whatsapp.id,
            rated: false,
            expired: false,
            ratingAt: { [Op.not]: null }
          },
          include: [
            {
              model: Ticket,
              where: {
                status: "closed",
                contactId: contact.id
              },
              include: [
                {
                  model: Contact
                },
                {
                  model: User,
                  as: "user"
                },
                {
                  model: Queue
                }
              ]
            }
          ]
        }));

      if (ticketTracking) {
        try {
          /**
           * Tratamento para avaliação do atendente
           */

          logger.debug(
            { ticketTracking },
            `start handling tracking rating for ticket ${ticketTracking.ticketId}`
          );

          const rate = Number(bodyMessage);

          if (Number.isFinite(rate)) {
            logger.debug(
              `received rate ${rate} for ticket ${ticketTracking.ticketId}`
            );
            handleRating(rate, ticketTracking.ticket, ticketTracking, wbot);
            return;
          }
          if (bodyMessage.trim() === "!") {
            // abort rating and reopen ticket
            logger.debug(
              `ticket ${ticketTracking.ticketId} reopen by contact request`
            );
            ticketTracking.update({
              ratingAt: null
            });
            updateTicket(ticketTracking.ticket, {
              status: "open",
              userId: ticketTracking.userId
            });
            quickMessage(
              wbot,
              ticketTracking.ticket,
              _t("Service reopened", ticketTracking.ticket),
              true
            );
            return;
          }
          // expire rating
          logger.debug(
            `tracking of ticket ${ticketTracking.ticketId} expired by wrong rate ${bodyMessage}`
          );
          ticketTracking.update({
            expired: true
          });
          quickMessage(
            wbot,
            ticketTracking.ticket,
            _t("Rating Cancelled", ticketTracking.ticket)
          );
          if (bodyMessage.length < 10) {
            // short message just stop the processing
            return;
          }
        } catch (e) {
          Sentry.captureException(e);
          console.log(e);
        }
      }
    }

    const scheduleType = await GetCompanySetting(
      companyId,
      "scheduleType",
      "disabled"
    );

    const outOfHoursAction = await GetCompanySetting(
      companyId,
      "outOfHoursAction",
      "pending"
    );
    let currentSchedule: ScheduleResult = null;

    if (scheduleType === "company") {
      currentSchedule = await VerifyCurrentSchedule(companyId);
    }

    let defaultQueue: Queue;

    if (
      (msg.key.fromMe ||
        contact.disableBot ||
        currentSchedule?.inActivity === false) &&
      !contact.isGroup &&
      whatsapp.queues.length === 1
    ) {
      defaultQueue = await Queue.findByPk(whatsapp.queues[0].id);
    }

    const findOnly = [
      "reactionMessage",
      "stickerMessage",
      "editedMessage",
      "protocolMessage"
    ].includes(msgType);

    const { ticket, justCreated } = await FindOrCreateTicketService(
      contact,
      wbot.id!,
      companyId,
      {
        groupContact,
        incrementUnread: !msg.key.fromMe,
        findOnly,
        queue: salesRouting?.queueId || queueId
          ? (await Queue.findByPk(salesRouting?.queueId || queueId)) || defaultQueue
          : defaultQueue
      }
    );

    if (!ticket) {
      return;
    }

    // voltar para o menu inicial

    if (bodyMessage === "#" && !isGroup) {
      await updateTicket(ticket, {
        queueOptionId: null,
        chatbot: false,
        queueId: null
      });
      await verifyQueue(wbot, msg, ticket, ticket.contact);
      return;
    }

    let newMessage: Message;

    if (
      messageMedia ||
      msg?.message?.extendedTextMessage?.thumbnailDirectPath
    ) {
      newMessage = await verifyMediaMessage(msg, ticket, contact, {
        wbot,
        messageMedia,
        skipWebsocket: justCreated
      });
    } else if (
      msg.message?.editedMessage?.message?.protocolMessage?.editedMessage
    ) {
      // message edited by Whatsapp App
      await verifyEditedMessage(
        msg.message.editedMessage.message.protocolMessage.editedMessage,
        ticket,
        msg.message.editedMessage.message.protocolMessage.key.id
      );
    } else if (msg.message?.protocolMessage?.editedMessage) {
      // message edited by Whatsapp Web
      await verifyEditedMessage(
        msg.message.protocolMessage.editedMessage,
        ticket,
        msg.message.protocolMessage.key.id
      );
    } else if (msg.message?.secretEncryptedMessage) {
      // message edited using secret encrypted payload
      const targetId = msg.message.secretEncryptedMessage.targetMessageKey?.id;

      if (!targetId) {
        logger.warn("[secretEnc] Message edit received without target id");
      } else {
        try {
          const originalDbMessage = await Message.findByPk(targetId);

          if (!originalDbMessage?.dataJson) {
            await markEditedMessageWithError(ticket, targetId);
          } else {
            let originalMsg: proto.IWebMessageInfo | null = null;

            try {
              originalMsg = JSON.parse(originalDbMessage.dataJson);
            } catch (error) {
              logger.warn(
                { error, targetId },
                "[secretEnc] Failed to parse original message dataJson"
              );
              throw error;
            }

            if (!originalMsg) {
              await markEditedMessageWithError(ticket, targetId);
            } else {
              const decryptedMessage = decryptMessageEdit(msg, originalMsg);

              if (
                decryptedMessage &&
                decryptedMessage.protocolMessage?.editedMessage
              ) {
                await verifyEditedMessage(
                  decryptedMessage.protocolMessage.editedMessage,
                  ticket,
                  targetId
                );
              } else {
                await markEditedMessageWithError(ticket, targetId);
              }
            }
          }
        } catch (error) {
          logger.error(
            { error, targetId },
            "[secretEnc] Failed to decrypt message edit"
          );
          await markEditedMessageWithError(ticket, targetId);
        }
      }
    } else if (msg.message?.protocolMessage?.type === 0) {
      await verifyDeleteMessage(msg.message.protocolMessage, ticket);
    } else {
      newMessage = await verifyMessage(msg, ticket, contact, {
        skipWebsocket: justCreated
      });
    }

    if (isGroup || contact.disableBot || msg.key.fromMe) {
      if (ticket.chatbot) {
        await updateTicket(ticket, { chatbot: false });
        await ticket.reload();
      }
      if (justCreated && newMessage) {
        websocketCreateMessage(newMessage);
      }
      return;
    }

    try {
      if (scheduleType) {
        const isOpenOnline =
          ticket.status === "open" && ticket.user.socketSessions.length > 0;

        const avoidResend =
          !isOpenOnline && outOfHoursCache.get(`ticket-${ticket.id}`);

        if (scheduleType === "company" && !isOpenOnline) {
          if (
            !isNil(currentSchedule) &&
            (!currentSchedule || currentSchedule.inActivity === false)
          ) {
            if (!avoidResend) {
              outOfHoursCache.set(`ticket-${ticket.id}`, true);
              const outOfHoursMessage =
                whatsapp.outOfHoursMessage.trim() ||
                _t("We are out of office hours right now", ticket);
              await sendAutomatedTextMessage(
                wbot,
                ticket,
                formatBody(outOfHoursMessage, ticket)
              );
            }
            if (ticket.status !== "open") {
              await UpdateTicketService({
                ticketData: { chatbot: false, status: outOfHoursAction },
                ticketId: ticket.id,
                companyId: ticket.companyId
              });
            }
            return;
          }
        }

        if (
          scheduleType === "queue" &&
          ticket.queueId !== null &&
          !isOpenOnline
        ) {
          currentSchedule = await VerifyCurrentSchedule(
            companyId,
            ticket.queueId
          );
          const queue = await Queue.findByPk(ticket.queueId);

          if (
            !isNil(currentSchedule) &&
            (!currentSchedule || currentSchedule.inActivity === false)
          ) {
            if (!avoidResend) {
              outOfHoursCache.set(`ticket-${ticket.id}`, true);
              const outOfHoursMessage =
                queue.outOfHoursMessage?.trim() ||
                _t("We are out of office hours right now", ticket);
              await sendAutomatedTextMessage(
                wbot,
                ticket,
                formatBody(outOfHoursMessage, ticket)
              );
            }
            if (ticket.status !== "open") {
              await UpdateTicketService({
                ticketData: { chatbot: false, status: outOfHoursAction },
                ticketId: ticket.id,
                companyId: ticket.companyId
              });
            }
            return;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
      console.log(e);
    }

    if (
      !ticket.queue &&
      !isGroup &&
      !ticket.userId &&
      whatsapp.queues.length >= 1
    ) {
      await verifyQueue(wbot, msg, ticket, ticket.contact);
    }

    if (justCreated && newMessage) {
      await newMessage.reload();
      websocketCreateMessage(newMessage);
    }

    if (salesRouting && newMessage) {
      if (
        await handleSalesRoutingBot({
          ticket,
          contact,
          wbot,
          routing: salesRouting,
          justCreated
        })
      ) {
        return;
      }
    }

    const dontReadTheFirstQuestion = ticket.queue === null;

    await ticket.reload();

    if (newMessage && (await handleN8nQueueWebhook(ticket, newMessage, wbot))) {
      return;
    }

    if (
      justCreated &&
      !whatsapp?.queues?.length &&
      !ticket.userId &&
      !isGroup
    ) {
      const message = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: true
        },
        order: [["createdAt", "DESC"]]
      });

      if (message && message.body.includes(whatsapp.greetingMessage)) {
        return;
      }

      if (whatsapp.greetingMessage) {
        const debouncedSentMessage = debounce(
          async () => {
            await sendAutomatedTextMessage(
              wbot,
              ticket,
              formatBody(`${whatsapp.greetingMessage}`, ticket)
            );
          },
          1000,
          ticket.id
        );
        debouncedSentMessage();
        return;
      }
    }

    if (ticket.queue && ticket.chatbot) {
      if (await pauseAutomatedRepliesAfterBurst(ticket)) {
        return;
      }

      await handleChartbot(ticket, msg, wbot, dontReadTheFirstQuestion);
    }
  } catch (err) {
    console.log(err);
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (
  id: string,
  whatsappId: number,
  update: { status?: number; messageStubParameters?: string[] }
) => {
  if (!update) return;

  const io = getIO();

  try {
    const messageToUpdate = await Message.findOne({
      where: {
        id
      },
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        },
        {
          model: Ticket,
          where: { whatsappId },
          required: true,
          include: [
            {
              model: User,
              as: "participants",
              attributes: ["id"],
              through: { attributes: [] }
            }
          ]
        }
      ]
    });

    const status = update.status;

    if (
      !messageToUpdate ||
      status === undefined ||
      (status > 0 && status <= messageToUpdate.ack)
    ) {
      return;
    }

    let error: MessageErrorPayload;

    if (status === WAMessageStatus.ERROR) {
      logger.error({ id, whatsappId, update }, "Message failed to send.");

      error = {
        code: `ZAPITU-${status}`,
        message: update.messageStubParameters?.[1]
          ? update.messageStubParameters[1]
          : "Message failed to send",
        rawPayload: update
      };
    }

    await messageToUpdate.update({ ack: error ? -1 : status, error });
    const participantRooms =
      messageToUpdate.ticket?.participants?.map(
        participant => `user-${participant.id}`
      ) || [];

    let ioStack = io
      .to(messageToUpdate.ticketId.toString())
      .to(`company-${messageToUpdate.companyId}-${messageToUpdate.ticket.status}`)
      .to(`company-${messageToUpdate.companyId}-notification`);

    if (messageToUpdate.ticket.queueId) {
      ioStack = ioStack
        .to(
          `queue-${messageToUpdate.ticket.queueId}-${messageToUpdate.ticket.status}`
        )
        .to(`queue-${messageToUpdate.ticket.queueId}-notification`);
    }

    if (messageToUpdate.ticket.userId) {
      ioStack = ioStack.to(`user-${messageToUpdate.ticket.userId}`);
    }

    ioStack.to(participantRooms).emit(
      `company-${messageToUpdate.companyId}-appMessage`,
      {
        action: "update",
        message: messageToUpdate
      }
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const verifyRecentCampaign = async (
  message: proto.IWebMessageInfo,
  companyId: number
) => {
  if (!message.key.fromMe) {
    const number = message.key.remoteJid.replace(/\D/g, "");
    const campaigns = await Campaign.findAll({
      where: { companyId, status: "EM_ANDAMENTO", confirmation: true }
    });
    if (campaigns) {
      const ids = campaigns.map(c => c.id);
      const campaignShipping = await CampaignShipping.findOne({
        where: { campaignId: { [Op.in]: ids }, number, confirmation: null }
      });

      if (campaignShipping) {
        await campaignShipping.update({
          confirmedAt: moment(),
          confirmation: true
        });
        await campaignQueue.add(
          "DispatchConfirmedCampaign",
          {
            campaignShippingId: campaignShipping.id,
            campaignId: campaignShipping.campaignId
          },
          {
            delay: parseToMilliseconds(randomValue(0, 10))
          }
        );
        return true;
      }
    }
  }
  return false;
};

const filterMessages = (msg: WAMessage): boolean => {
  // receiving edited message
  if (msg.message?.protocolMessage?.editedMessage) return true;
  // receiving message deletion info
  if (msg.message?.protocolMessage?.type === 0) return true;
  // ignore other protocolMessages
  if (msg.message?.protocolMessage) return false;

  if (
    [
      WAMessageStubType.REVOKE,
      WAMessageStubType.E2E_DEVICE_CHANGED,
      WAMessageStubType.E2E_IDENTITY_CHANGED,
      WAMessageStubType.CIPHERTEXT
    ].includes(msg.messageStubType)
  )
    return false;

  return true;
};

const wbotMessageListener = async (
  wbot: Session,
  companyId: number
): Promise<void> => {
  try {
    wbot.ev.on("messages.upsert", async (messageUpsert: ImessageUpsert) => {
      logger.trace({ messageUpsert }, "wbotMessageListener: messages.upsert");
      const messages = messageUpsert.messages
        .filter(filterMessages)
        .map(msg => msg);

      if (!messages) return;

      messages.forEach(async (message: proto.IWebMessageInfo) => {
        if (!message?.message) {
          logger.warn(
            { message },
            "wbotMessageListener: messages.upsert without supported content"
          );
          return;
        }

        await wbot.sendReceipts([message.key], undefined);

        if (await verifyRecentCampaign(message, companyId)) {
          return;
        }
        await handleMessage(message, wbot, companyId);
      });
    });

    wbot.ev.on("message-receipt.update", async (messageReceipt: any) => {
      logger.trace(
        { messageReceipt },
        "wbotMessageListener: message-receipt.update"
      );
      if (messageReceipt.length === 0) return;
      messageReceipt.forEach(async (receipt: any) => {
        await ackMutex.runExclusive(async () => {
          handleMsgAck(receipt.key.id, wbot.id, { status: 2 });
        });
      });
    });

    wbot.ev.on("messages.update", (messageUpdate: WAMessageUpdate[]) => {
      logger.trace({ messageUpdate }, "wbotMessageListener: messages.update");
      if (messageUpdate.length === 0) return;
      messageUpdate.forEach(async (message: WAMessageUpdate) => {
        (wbot as WASocket)!.readMessages([message.key]);

        await ackMutex.runExclusive(async () => {
          handleMsgAck(message.key.id, wbot.id, message.update);
        });
      });
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(`Error handling wbot message listener. Err: ${error}`);
  }
};

export { wbotMessageListener, handleMessage };
