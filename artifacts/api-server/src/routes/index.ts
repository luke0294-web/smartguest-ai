import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import propertiesRouter from "./properties";
import leadsRouter from "./leads";
import hostDashboardRouter from "./host-dashboard";
import authRouter from "./auth";
import aiRouter from "./ai";
import adminHostsRouter from "./admin-hosts";
import sendPdfRouter from "./send-pdf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter); // 👇 SCAMBIATO! Ora le chat vengono prima!
router.use(propertiesRouter); // 👆 Le case vengono dopo
router.use(leadsRouter);
router.use(hostDashboardRouter);
router.use(authRouter);
router.use(aiRouter);
router.use(adminHostsRouter);
router.use(sendPdfRouter);

export default router;
