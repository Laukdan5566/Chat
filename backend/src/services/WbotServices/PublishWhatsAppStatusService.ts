import fs from "fs";
import { AnyMessageContent } from "libzapitu-rf";
import AppError from "../../errors/AppError";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import saveMediaToFile from "../../helpers/saveMediaFile";
import BaileysContact from "../../models/BaileysContact";
import Whatsapp from "../../models/Whatsapp";
import WhatsAppStatusPost from "../../models/WhatsAppStatusPost";
import { getMessageFileOptions } from "./SendWhatsAppMedia";

const STATUS_JID = "status@broadcast";

const getRecipientJids = async (
  whatsappId: number,
  requestedRecipients: string[] | null
): Promise<string[]> => {
  const contacts = await BaileysContact.findAll({ where: { whatsappId } });
  const knownJids = contacts
    .map(contact => contact.contactId)
    .filter(contactId => contactId.endsWith("@s.whatsapp.net"));

  const allowedJids = new Set(knownJids);
  const recipientJids = requestedRecipients
    ? requestedRecipients.filter(contactId => allowedJids.has(contactId))
    : knownJids;

  return Array.from(new Set(recipientJids));
};

interface Request {
  whatsapp: Whatsapp;
  companyId: number;
  userId: number;
  body: string;
  backgroundColor?: string;
  recipientIds?: string[] | null;
  media?: Express.Multer.File;
}

const PublishWhatsAppStatusService = async ({
  whatsapp,
  companyId,
  userId,
  body,
  backgroundColor,
  recipientIds,
  media
}: Request): Promise<WhatsAppStatusPost> => {
  const normalizedBody = body?.trim() || "";

  if (!normalizedBody && !media) {
    throw new AppError("Informe uma mensagem ou selecione uma mídia.");
  }

  if (media && !/^(image|video|audio)\//.test(media.mimetype)) {
    throw new AppError("O status aceita somente imagem, vídeo ou áudio.");
  }

  const recipients = await getRecipientJids(whatsapp.id, recipientIds || null);
  if (!recipients.length) {
    throw new AppError(
      "Não há contatos sincronizados selecionados para receber este status."
    );
  }

  const wbot = await GetWhatsappWbot(whatsapp);
  let mediaUrl: string | null = null;
  let mediaOptions: AnyMessageContent | null = null;

  try {
    if (media) {
      mediaUrl = await saveMediaToFile(
        {
          data: fs.readFileSync(media.path),
          mimetype: media.mimetype,
          filename: media.originalname
        },
        {
          destination: companyId,
          persistant: true,
          baseFolder: "media-persistant/status"
        }
      );

      mediaOptions = await getMessageFileOptions(
        media.originalname,
        media.path,
        media.mimetype
      );
    }

    if (!mediaOptions && media) {
      throw new AppError("Não foi possível preparar a mídia do status.");
    }

    const message = await wbot.sendMessage(
      STATUS_JID,
      mediaOptions
        ? {
            ...mediaOptions,
            caption: normalizedBody || undefined
          }
        : { text: normalizedBody },
      {
        broadcast: true,
        statusJidList: recipients,
        backgroundColor: backgroundColor || "#1F2937",
        font: 1
      }
    );

    return WhatsAppStatusPost.create({
      companyId,
      userId,
      whatsappId: whatsapp.id,
      body: normalizedBody || null,
      mediaUrl,
      mediaType: media?.mimetype || null,
      mediaName: media?.originalname || null,
      messageId: message?.key?.id || null,
      recipientsCount: recipients.length,
      backgroundColor: backgroundColor || "#1F2937"
    });
  } finally {
    if (media?.path) {
      fs.promises.unlink(media.path).catch(() => undefined);
    }
  }
};

export default PublishWhatsAppStatusService;
