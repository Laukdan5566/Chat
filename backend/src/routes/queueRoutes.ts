import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import hasPermission from "../middleware/hasPermission";

import * as QueueController from "../controllers/QueueController";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);
const queueRoutes = Router();

queueRoutes.get("/queue", isAuth, QueueController.index);

queueRoutes.post("/queue", isAuth, hasPermission("queues:view"), QueueController.store);

queueRoutes.get("/queue/:queueId", isAuth, QueueController.show);

queueRoutes.put(
  "/queue/:queueId",
  isAuth,
  hasPermission("queues:view"),
  QueueController.update
);

queueRoutes.delete(
  "/queue/:queueId",
  isAuth,
  hasPermission("queues:view"),
  QueueController.remove
);

queueRoutes.post(
  "/queue/:queueId/media-upload",
  isAuth,
  hasPermission("queues:view"),
  upload.array("file"),
  QueueController.mediaUpload
);

queueRoutes.delete(
  "/queue/:queueId/media-upload",
  isAuth,
  hasPermission("queues:view"),
  QueueController.deleteMedia
);

export default queueRoutes;
