import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import propertiesRouter from "./properties";
import leadsRouter from "./leads";
import hostDashboardRouter from "./host-dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(chatRouter);
router.use(leadsRouter);
router.use(hostDashboardRouter);

export default router;
