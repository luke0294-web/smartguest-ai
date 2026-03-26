import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import hostRouter from "./host";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(hostRouter);

export default router;
