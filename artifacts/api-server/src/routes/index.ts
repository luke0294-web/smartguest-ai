import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import propertiesRouter from "./properties";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(chatRouter);

export default router;
