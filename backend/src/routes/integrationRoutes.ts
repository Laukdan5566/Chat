import { Router } from "express";
import tokenAuth from "../middleware/tokenAuth";
import isCompliant from "../middleware/isCompliant";
import * as IntegrationController from "../controllers/IntegrationController";

const integrationRoutes = Router();

integrationRoutes.get(
  "/integrations/listQueues",
  tokenAuth,
  isCompliant,
  IntegrationController.listQueues
);

integrationRoutes.post(
  "/integrations/webhook",
  tokenAuth,
  isCompliant,
  IntegrationController.webhook
);

export default integrationRoutes;
