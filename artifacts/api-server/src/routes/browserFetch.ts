/**
 * browserFetch.ts — server-side URL fetcher for the in-app browser
 *
 * Most websites block iframes via X-Frame-Options / CSP. Fetching from Node.js
 * bypasses that: no CORS, no iframe restrictions, just a real HTTP GET.
 *
 * GET /api/browse?url=<encoded-url>
 * Returns: { title, description, text, links, url }
 */

import { Router, type Request, type Response } from "express";

const router = Router();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

router.get("/browse", async (req: Request, res: Response) => {
  const url = String(req.query.url ?? "").trim();

  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "Missing or invalid url" });
    return;
  }

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(14_000),
      redirect: "follow",
    });

    if (!r.ok) {
      res.status(r.status).json({ error: `Remote returned HTTP ${r.status}` });
      return;
    }

    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("html")) {
      res.status(415).json({ error: "Remote did not return HTML" });
      return;
    }

    const html = await r.text();

    // ── Title ──────────────────────────────────────────────────────────
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? new URL(url).hostname;

    // ── Meta description ───────────────────────────────────────────────
    const metaMatch =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,300})["']/i,
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']{0,300})["'][^>]+name=["']description["']/i,
      );
    const description = metaMatch?.[1]?.trim() ?? "";

    // ── Readable text ──────────────────────────────────────────────────
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

    // ── Links ──────────────────────────────────────────────────────────
    const linkMatches = [...html.matchAll(/href="(https?:\/\/[^"#?]{4,})"/gi)];
    const links = [
      ...new Set(linkMatches.map((m) => m[1]).slice(0, 20)),
    ].slice(0, 12);

    res.json({ title, description, text, links, url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

export default router;
