/**
 * search.ts — web search endpoint (no API key required)
 *
 * GET /api/search?q=<query>
 * Returns: { query, results: [{ title, snippet, url }] }
 *
 * Sources used:
 *  1. DuckDuckGo Instant Answers (structured, keyless)
 *  2. Wikipedia REST API (factual fallback, keyless)
 */
import { Router, type Request, type Response } from "express";

const router = Router();

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source?: string;
}

router.get("/search", async (req: Request, res: Response) => {
  const q = ((req.query["q"] ?? "") as string).trim();
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  try {
    const results: SearchResult[] = [];

    // ── 1. DuckDuckGo Instant Answers ────────────────────────────────
    try {
      const ddgUrl =
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=axecore`;
      const ddgRes = await fetch(ddgUrl, {
        signal: AbortSignal.timeout(7_000),
        headers: { "User-Agent": "AXE-CORE/1.0 (search proxy)" },
      });
      if (ddgRes.ok) {
        const d = (await ddgRes.json()) as {
          Abstract?: string;
          AbstractURL?: string;
          Heading?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Name?: string; Topics?: unknown[] }>;
        };
        if (d.Abstract) {
          results.push({
            title: d.Heading ?? q,
            snippet: d.Abstract.slice(0, 500),
            url: d.AbstractURL ?? "",
            source: "DuckDuckGo",
          });
        }
        for (const rt of (d.RelatedTopics ?? []).slice(0, 4)) {
          if (!rt.Text || rt.Topics) continue; // skip category groups
          results.push({
            title: rt.Name ?? q,
            snippet: rt.Text.slice(0, 300),
            url: rt.FirstURL ?? "",
            source: "DuckDuckGo",
          });
        }
      }
    } catch { /* ddg failed, continue */ }

    // ── 2. Wikipedia fallback for factual short queries ───────────────
    if (results.length < 2) {
      try {
        const wTitle = q.trim().split(/\s+/).slice(0, 5).join("_");
        const wRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wTitle)}`,
          {
            signal: AbortSignal.timeout(5_000),
            headers: { "User-Agent": "AXE-CORE/1.0 (search proxy)" },
          },
        );
        if (wRes.ok) {
          const wd = (await wRes.json()) as {
            type?: string;
            title?: string;
            extract?: string;
            content_urls?: { desktop?: { page?: string } };
          };
          if (wd.extract && wd.type !== "disambiguation") {
            results.unshift({
              title: wd.title ?? q,
              snippet: wd.extract.slice(0, 500),
              url: wd.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${wTitle}`,
              source: "Wikipedia",
            });
          }
        }
      } catch { /* wikipedia failed */ }
    }

    res.json({ query: q, results: results.slice(0, 5) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

export default router;
