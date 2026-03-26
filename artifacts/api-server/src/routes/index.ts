import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import propertiesRouter from "./properties";
import leadsRouter from "./leads";
import hostDashboardRouter from "./host-dashboard";
import authRouter from "./auth";
import aiRouter from "./ai";
import adminHostsRouter from "./admin-hosts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(chatRouter);
router.use(leadsRouter);
router.use(hostDashboardRouter);
router.use(authRouter);
router.use(aiRouter);
router.use(adminHostsRouter);

export default router;
