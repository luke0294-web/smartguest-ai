import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import propertiesRouter from "./properties";
import leadsRouter from "./leads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(chatRouter);
router.use(leadsRouter);

export default router;
