import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import osintRouter from "./osint";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/files", filesRouter);
router.use("/osint", osintRouter);

export default router;
