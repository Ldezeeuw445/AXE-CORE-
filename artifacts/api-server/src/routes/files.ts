import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import {
  WorkspacePathError,
  listDirectory,
  readWorkspaceFile,
  writeWorkspaceFile,
  createWorkspaceEntry,
  deleteWorkspaceEntry,
} from "../lib/workspaceFs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use(requireAuth);

function pathParam(req: { query: Record<string, unknown> }): string {
  const p = req.query["path"];
  return typeof p === "string" ? p : "";
}

router.get("/tree", async (req, res) => {
  try {
    const nodes = await listDirectory(pathParam(req));
    res.json({ nodes });
  } catch (err) {
    if (err instanceof WorkspacePathError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, "files/tree failed");
    res.status(500).json({ error: "Failed to list directory" });
  }
});

router.get("/read", async (req, res) => {
  try {
    const content = await readWorkspaceFile(pathParam(req));
    res.json({ content });
  } catch (err) {
    if (err instanceof WorkspacePathError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, "files/read failed");
    res.status(404).json({ error: "File not found" });
  }
});

router.put("/write", async (req, res) => {
  const { path: relPath, content } = req.body as { path?: string; content?: string };
  if (typeof relPath !== "string" || typeof content !== "string") {
    res.status(400).json({ error: "path and content are required" });
    return;
  }
  try {
    await writeWorkspaceFile(relPath, content);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspacePathError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, "files/write failed");
    res.status(500).json({ error: "Failed to write file" });
  }
});

router.post("/create", async (req, res) => {
  const { path: relPath, type } = req.body as { path?: string; type?: string };
  if (typeof relPath !== "string" || (type !== "file" && type !== "folder")) {
    res.status(400).json({ error: "path and type ('file'|'folder') are required" });
    return;
  }
  try {
    await createWorkspaceEntry(relPath, type);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspacePathError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, "files/create failed");
    res.status(500).json({ error: "Failed to create entry (it may already exist)" });
  }
});

router.delete("/delete", async (req, res) => {
  try {
    await deleteWorkspaceEntry(pathParam(req));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspacePathError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, "files/delete failed");
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

export default router;
