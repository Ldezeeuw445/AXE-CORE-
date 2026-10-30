/**
 * Vercel Serverless Function (Node runtime) — Airtop passthrough proxy.
 * ANY /api/proxy/airtop/<path> -> https://api.airtop.ai/api/v1/<path>
 *
 * Same reason as api/proxy/axecore.ts: the Airtop key must never reach the
 * bundle. `AIRTOP_API_KEY` is deliberately NOT VITE_-prefixed — a VITE_ var is
 * compiled into the public JS, and this one bills real money and can drive a
 * browser, so it is worth more to an attacker than most of the others.
 *
 * Routing through the app's own origin also means the phone gets this for
 * free: the Android shell serves the same bundle from
 * appassets.androidplatform.net, and Airtop is a cloud API, so the browser
 * agent works from the Samsung exactly as it does from the Mac. The ADB tools
 * cannot make that trip — that bridge is loopback on one machine.
 *
 * Node runtime, not Edge: page-query runs a model over the page and routinely
 * takes longer than Edge's fixed 25s first-byte ceiling (the bug documented in
 * api/proxy/ai.ts).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 60;

const UPSTREAM = "https://api.airtop.ai/api/v1";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const apiKey = process.env.AIRTOP_API_KEY || "";
  if (!apiKey) {
    res.status(503).json({ error: "AIRTOP_API_KEY is not set on the server (Vercel project env vars)." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Everything after /api/proxy/airtop/ is the upstream path, query included.
  const raw = String(req.url ?? "");
  const path = raw.replace(/^\/api\/proxy\/airtop\/?/, "");
  if (path.startsWith("http") || path.includes("..")) {
    res.status(400).json({ error: "invalid path" });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/${path}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: req.method === "GET" || req.method === "DELETE" || req.body == null
        ? undefined
        : typeof req.body === "string" ? req.body : JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    // DELETE /sessions answers 2xx with an EMPTY body. Returning that as-is
    // rather than inventing `{}` keeps the client's own parser honest about
    // when there is nothing to parse.
    res.send(text);
  } catch (err) {
    res.status(502).json({
      error: `airtop upstream failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
