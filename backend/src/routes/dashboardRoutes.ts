import express from "express";
import isAuth from "../middleware/isAuth";

import * as DashboardController from "../controllers/DashboardController";
import hasPermission from "../middleware/hasPermission";
import isCompliant from "../middleware/isCompliant";

const routes = express.Router();

routes.get(
  "/dashboard/status",
  isAuth,
  hasPermission("dashboard:view"),
  isCompliant,
  DashboardController.statusSummary
);

routes.get(
  "/dashboard/tickets",
  isAuth,
  hasPermission("dashboard:view"),
  isCompliant,
  DashboardController.ticketsStatistic
);

routes.get(
  "/dashboard/users",
  isAuth,
  hasPermission("dashboard:view"),
  isCompliant,
  DashboardController.usersReport
);

export default routes;
