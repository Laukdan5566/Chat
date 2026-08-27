import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import {
  getSafeWebChatOriginalName,
  WEBCHAT_MEDIA_MAX_BYTES
} from "./WebChatMedia";

const execFileAsync = promisify(execFile);

const extensionByMimeType: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/x-m4a": "m4a"
};

const getMp3OriginalName = (originalName: string): string => {
  const safeName = getSafeWebChatOriginalName(originalName);
  const nameWithoutExtension = path.basename(
    safeName,
    path.extname(safeName)
  );

  return `${nameWithoutExtension || "audio-atendimento"}.mp3`.slice(0, 120);
};

export const normalizeWebChatAudio = async (
  file: Express.Multer.File
): Promise<Express.Multer.File> => {
  const mimetype = (file.mimetype || "").toLowerCase();
  if (!mimetype.startsWith("audio/") || mimetype === "audio/mpeg") {
    return file;
  }

  const inputExtension = extensionByMimeType[mimetype];
  if (!inputExtension) {
    throw new AppError("Formato de áudio não permitido", 400);
  }

  const workDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "ticketz-webchat-audio-")
  );
  const inputPath = path.join(workDirectory, `entrada.${inputExtension}`);
  const outputPath = path.join(workDirectory, "audio-atendimento.mp3");

  try {
    await fs.promises.writeFile(inputPath, new Uint8Array(file.buffer));
    await execFileAsync(
      ffmpegPath.path,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        outputPath
      ],
      {
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024
      }
    );

    const buffer = await fs.promises.readFile(outputPath);
    if (!buffer.length || buffer.length > WEBCHAT_MEDIA_MAX_BYTES) {
      throw new AppError(
        "Áudio inválido ou maior que o limite de 12 MB",
        400
      );
    }

    return {
      ...file,
      buffer,
      mimetype: "audio/mpeg",
      originalname: getMp3OriginalName(file.originalname),
      size: buffer.length
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        mimetype,
        originalName: file.originalname
      },
      "Failed to convert webchat audio to MP3"
    );
    throw new AppError("Não foi possível processar o áudio", 422);
  } finally {
    await fs.promises.rm(workDirectory, {
      recursive: true,
      force: true
    });
  }
};

export default normalizeWebChatAudio;
