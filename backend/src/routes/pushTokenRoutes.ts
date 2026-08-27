import express from "express";
import isAuth from "../middleware/isAuth";
import * as PushTokenController from "../controllers/PushTokenController";

const routes = express.Router();

routes.post("/push-tokens", isAuth, PushTokenController.store);
routes.delete("/push-tokens", isAuth, PushTokenController.remove);

export default routes;
