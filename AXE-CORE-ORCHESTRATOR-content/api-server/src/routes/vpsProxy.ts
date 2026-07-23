/**
 * vpsProxy.ts — browser fetch routed via VPS SSH tunnel
 *
 * Many sites block requests from Replit/Vercel data-center IPs.
 * By SSH-ing to the Strato VPS and running `curl` there we get a
 * residential-ish IP that bypasses most blocks.
 *
 * GET /api/browse-vps?url=<encoded-url>
 * Returns: { title, description, text, links, url }
 */

import { Router, type Request, type Response } from "express";
import { Client } from "ssh2";

const router = Router();

const VPS_HOST = process.env["VPS_HOST"] ?? "212.227.91.79";
const VPS_USER = process.env["VPS_USER"] ?? "root";
const VPS_PORT = Number(process.env["VPS_PORT"] ?? 22);
const VPS_KEY = process.env["AXE_VPS_SSH_PRIVATE_KEY"] ?? "";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Run a single command on the VPS via SSH and return stdout. */
function sshExec(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!VPS_KEY) {
      reject(new Error("AXE_VPS_SSH_PRIVATE_KEY is not set"));
      return;
    }

    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        stream
          .on("close", () => {
            conn.end();
            if (stdout) resolve(stdout);
            else reject(new Error(stderr || "VPS command returned no output"));
          })
          .on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
          })
          .stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
          });
      });
    });

    conn.on("error", (err) => reject(err));

    conn.connect({
      host: VPS_HOST,
      port: VPS_PORT,
      username: VPS_USER,
      privateKey: VPS_KEY,
      readyTimeout: 10_000,
    });
  });
}

/** Parse raw HTML into the same shape as /api/browse */
function parseHtml(html: string, url: string) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? new URL(url).hostname;

  const metaMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']{0,300})["'][^>]+name=["']description["']/i,
    );
  const description = metaMatch?.[1]?.trim() ?? "";

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10_000);

  const linkMatches = [...html.matchAll(/href="(https?:\/\/[^"#?]{4,})"/gi)];
  const links = [
    ...new Set(linkMatches.map((m) => m[1]).slice(0, 20)),
  ].slice(0, 12);

  return { title, description, text, links, url };
}

router.get("/browse-vps", async (req: Request, res: Response) => {
  const url = String(req.query.url ?? "").trim();

  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "Missing or invalid url" });
    return;
  }

  // Escape single quotes in the URL for the shell command
  const safeUrl = url.replace(/'/g, "'\\''");
  const cmd = [
    "curl",
    "-s",
    "-L",
    "--max-time 15",
    "--compressed",
    `-A '${UA}'`,
    `-H 'Accept: text/html,application/xhtml+xml,*/*;q=0.8'`,
    `-H 'Accept-Language: nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7'`,
    `'${safeUrl}'`,
  ].join(" ");

  try {
    const html = await sshExec(cmd);
    res.json(parseHtml(html, url));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `VPS fetch failed: ${msg}` });
  }
});

export default router;
