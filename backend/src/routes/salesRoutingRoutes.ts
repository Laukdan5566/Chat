import { Router } from "express";
import isAdmin from "../middleware/isAdmin";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as SalesRoutingController from "../controllers/SalesRoutingController";

const salesRoutingRoutes = Router();

salesRoutingRoutes.get("/sales-routing-link/:publicId", SalesRoutingController.publicShow);
salesRoutingRoutes.post("/sales-routing-link/:publicId/select", SalesRoutingController.publicSelect);
salesRoutingRoutes.get("/sales-routing/company/:companyId", isAuth, isSuper, SalesRoutingController.showForCompany);
salesRoutingRoutes.put("/sales-routing/company/:companyId", isAuth, isSuper, SalesRoutingController.updateForCompany);
salesRoutingRoutes.get("/sales-routing", isAuth, isAdmin, SalesRoutingController.show);
salesRoutingRoutes.put("/sales-routing", isAuth, isAdmin, SalesRoutingController.update);

export default salesRoutingRoutes;
