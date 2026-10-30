/**
 * Vercel Serverless Function (Node runtime) — Exa search proxy.
 * POST /api/exa  { query, numResults?, key? }
 *
 * Why this exists: the browser called https://api.exa.ai/search directly,
 * which fails CORS (Exa doesn't allow browser origins) — so Exa "had a key
 * but never worked". Routing through this same-origin function fixes CORS.
 * The key is taken from the request (the user's key, saved in the app) or,
 * preferably, from a server-side EXA_API_KEY env var so it never ships to
 * the browser.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const body = (typeof req.body === "object" && req.body ? req.body : {}) as {
    query?: string;
    numResults?: number;
    key?: string;
  };
  const key = process.env.EXA_API_KEY || body.key || "";
  const query = (body.query || "").trim();
  if (!key) {
    res.status(503).json({ error: "Exa not configured (set EXA_API_KEY on the server, or save your key in the app)." });
    return;
  }
  if (!query) {
    res.status(400).json({ error: "Missing query" });
    return;
  }
  try {
    const r = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query,
        numResults: body.numResults || 5,
        type: "auto",
        // Ask Exa for the text so the app has a real snippet to show.
        contents: { text: { maxCharacters: 500 } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    res.status(r.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err: unknown) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
