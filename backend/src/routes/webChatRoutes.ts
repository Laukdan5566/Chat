import { Router } from "express";
import multer from "multer";

import * as WebChatController from "../controllers/WebChatController";
import { WEBCHAT_MEDIA_MAX_BYTES } from "../helpers/WebChatMedia";

const webChatRoutes = Router();
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: WEBCHAT_MEDIA_MAX_BYTES,
    files: 1
  }
});

webChatRoutes.post("/webchat/session", WebChatController.start);
webChatRoutes.get(
  "/webchat/:conversationId/messages",
  WebChatController.messages
);
webChatRoutes.post(
  "/webchat/:conversationId/messages",
  WebChatController.sendMessage
);
webChatRoutes.post(
  "/webchat/:conversationId/media",
  WebChatController.authorizeMedia,
  mediaUpload.single("file"),
  WebChatController.sendMedia
);
webChatRoutes.post(
  "/webchat/:conversationId/close",
  WebChatController.close
);
webChatRoutes.post(
  "/webchat/:conversationId/zammad",
  WebChatController.createZammadTicket
);

export default webChatRoutes;
