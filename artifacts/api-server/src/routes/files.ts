import { Router, type IRouter } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { requireAuth } from "../lib/auth";
import {
  WorkspacePathError,
  REPO_ROOT,
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

// Workspace-wide text search via ripgrep (/api/files/search)
// Body: { query, glob?, maxResults?, caseSensitive? }
// Returns: { results: Array<{ file, line, col, text }> }
router.post("/search", (req, res) => {
  const { query, glob, maxResults = 100, caseSensitive = false } =
    req.body as { query?: string; glob?: string; maxResults?: number; caseSensitive?: boolean };

  if (!query || typeof query !== "string" || query.trim() === "") {
    res.status(400).json({ error: "query is required" });
    return;
  }

  // ripgrep args: --json for structured output, -m for per-file limit
  const args = [
    "--json",
    "--line-number",
    "--column",
    `--max-count=${Math.min(maxResults, 500)}`,
    "--smart-case",
    "--hidden",
    "--iglob", "!node_modules",
    "--iglob", "!.git",
    "--iglob", "!dist",
    "--iglob", "!build",
    "--iglob", "!.pnpm-store",
  ];
  if (caseSensitive) { args.push("--case-sensitive"); } else { args.push("--ignore-case"); }
  if (glob) args.push("--glob", glob);
  args.push("--", query, REPO_ROOT);

  const rg = spawn("rg", args, { cwd: REPO_ROOT, env: process.env });
  const results: Array<{ file: string; line: number; col: number; text: string }> = [];
  let buf = "";

  rg.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const obj = JSON.parse(l) as { type: string; data: unknown };
        if (obj.type === "match") {
          const d = obj.data as {
            path: { text: string };
            line_number: number;
            absolute_offset: number;
            lines: { text: string };
            submatches: Array<{ start: number; end: number }>;
          };
          const relFile = path.relative(REPO_ROOT, d.path.text);
          results.push({
            file: relFile,
            line: d.line_number,
            col: (d.submatches[0]?.start ?? 0) + 1,
            text: d.lines.text.trimEnd(),
          });
        }
      } catch { /* skip non-JSON or malformed */ }
    }
  });

  rg.on("close", () => {
    res.json({ results: results.slice(0, maxResults) });
  });

  rg.on("error", (err) => {
    logger.error({ err }, "files/search rg failed");
    res.status(500).json({ error: "Search failed: " + err.message });
  });
});

export default router;
