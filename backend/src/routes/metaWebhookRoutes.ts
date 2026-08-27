import express from "express";
import * as MetaWebhookController from "../controllers/MetaWebhookController";

const metaWebhookRoutes = express.Router();

metaWebhookRoutes.get("/meta/webhook", MetaWebhookController.verify);
metaWebhookRoutes.post("/meta/webhook", MetaWebhookController.receive);

export default metaWebhookRoutes;
