/**
 * Vercel Serverless Function (Node runtime) — AXE Core API passthrough proxy.
 * ANY /api/proxy/axecore/<path> -> ${AXE_CORE_API_URL}/<path>
 *
 * Why this exists: the browser used to call https://api.axecompanion.com
 * directly with a bearer key baked into a VITE_-prefixed env var. Two
 * problems with that: (1) VITE_ vars are bundled into the public JS, so the
 * key was readable by anyone who opened dev tools, and (2) the VPS only
 * allow-lists a couple of known origins, so every domain the app has ever
 * been served from (Vercel previews, Replit, future custom domains) needed
 * its own VPS-side CORS change to work at all.
 *
 * Routing every call through this function fixes both: the browser only
 * ever talks to its own origin (no CORS, ever, regardless of what domain
 * serves the app), and the real key lives only in this server-side env var
 * (AXE_CORE_API_KEY, deliberately NOT VITE_-prefixed) — it never reaches
 * the client bundle.
 *
 * Node runtime (not Edge) on purpose: some paths this proxies to
 * (/crew/run, /internal/*\/execute) can run a multi-agent task for a while,
 * and Edge Functions cannot send an initial response after 25s no matter
 * what — see api/proxy/ai.ts for the bug that caused. Node functions don't
 * have that ceiling (maxDuration below controls it explicitly instead).
 * This also needs to pass through binary bodies (the /tts endpoint returns
 * audio, not JSON), which a byte-for-byte stream pipe handles for free.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";

export const maxDuration = 60; // raise if your Vercel plan allows more and /crew/run needs it

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const upstreamBase = process.env.AXE_CORE_API_URL || "https://api.axecompanion.com";
  const apiKey = process.env.AXE_CORE_API_KEY || "";

  if (!apiKey) {
    res.status(503).json({ error: "AXE_CORE_API_KEY is not set on the server (Vercel project env vars)." });
    return;
  }

  // Parse the real path straight out of the request URL instead of trusting
  // Vercel's dynamic catch-all param (req.query.path) to be populated — when
  // it isn't, path silently becomes "" and every request collapses onto the
  // upstream's bare root ("/"), which 404s identically no matter what the
  // caller actually asked for (exactly what was observed: /health and a
  // made-up path both came back with byte-identical 404s).
  const url = req.url || "";
  const pathname = url.split("?")[0];
  const prefix = "/api/proxy/axecore";
  const path = pathname.startsWith(prefix) ? pathname.slice(prefix.length).replace(/^\//, "") : "";
  const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const upstreamUrl = `${upstreamBase.replace(/\/$/, "")}/${path}${search}`;

  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(hasBody ? { "Content-Type": req.headers["content-type"] || "application/json" } : {}),
      },
      body: hasBody ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {})) : undefined,
      signal: AbortSignal.timeout(55_000),
    });

    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as import("stream/web").ReadableStream<Uint8Array>).pipe(res);
  } catch (err: unknown) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
