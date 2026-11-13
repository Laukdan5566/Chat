import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";

const publicFolder = __dirname.endsWith("/dist")
  ? path.resolve(__dirname, "..", "public")
  : path.resolve(__dirname, "..", "..", "public");

export default {
  directory: publicFolder,

  storage: multer.diskStorage({
    destination: publicFolder,
    filename(req, file, cb) {
      // Multiple files from the same request can arrive in the same millisecond.
      // A UUID prevents one upload from overwriting another temporary file.
      // a extensão vem do cliente: só letras e números entram no nome em disco
      const ext = path.extname(file.originalname);
      const safeExt = /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : "";
      const fileName = `${Date.now()}-${randomUUID()}${safeExt}`;

      return cb(null, fileName);
    }
  })
};
