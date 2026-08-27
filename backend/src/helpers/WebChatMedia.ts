import path from "path";
import { v4 as uuidv4 } from "uuid";

import AppError from "../errors/AppError";

export const WEBCHAT_MEDIA_MAX_BYTES = 12 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "video/mp4"
]);

const extensionsByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/x-m4a": "m4a",
  "video/mp4": "mp4"
};

export const isAllowedWebChatMedia = (mimetype: string): boolean =>
  allowedMimeTypes.has((mimetype || "").toLowerCase());

export const assertAllowedWebChatMedia = (
  file: Express.Multer.File
): void => {
  if (
    !file ||
    !isAllowedWebChatMedia(file.mimetype) ||
    !Number.isFinite(file.size) ||
    file.size <= 0 ||
    file.size > WEBCHAT_MEDIA_MAX_BYTES
  ) {
    throw new AppError(
      "Arquivo invÃ¡lido ou maior que o limite de 12 MB",
      400
    );
  }
};

export const getSafeWebChatOriginalName = (name: string): string => {
  const baseName = path.basename(name || "anexo");
  const cleaned = baseName
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || "anexo").slice(0, 120);
};

export const getWebChatStoredName = (mimetype: string): string => {
  const extension = extensionsByMimeType[(mimetype || "").toLowerCase()];
  if (!extension) {
    throw new AppError("Formato de arquivo nÃ£o permitido", 400);
  }

  return `${uuidv4()}.${extension}`;
};

export const getWebChatMediaType = (mimetype: string): string => {
  const category = (mimetype || "").split("/")[0];
  return ["image", "audio", "video"].includes(category)
    ? category
    : "document";
};

export const getWebChatMediaDataJson = (
  mediaType: string,
  originalName: string,
  mimetype: string
): string => {
  if (mediaType !== "document") return "{}";

  return JSON.stringify({
    message: {
      documentMessage: {
        fileName: originalName,
        mimetype
      }
    }
  });
};
