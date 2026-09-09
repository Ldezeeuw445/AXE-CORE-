import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import osintRouter from "./osint";
import aiProxyRouter from "./aiProxy";
import browserFetchRouter from "./browserFetch";
import searchRouter from "./search";
import vpsProxyRouter from "./vpsProxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/files", filesRouter);
router.use("/osint", osintRouter);
router.use(aiProxyRouter);        // POST /api/proxy/ai  — server-side AI proxy
router.use(browserFetchRouter);   // GET  /api/browse    — server-side URL fetcher
router.use(searchRouter);         // GET  /api/search    — web search (DuckDuckGo + Wikipedia)
router.use(vpsProxyRouter);       // GET  /api/browse-vps — SSH to VPS, bypass IP blocks

export default router;
