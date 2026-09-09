/**
 * lse.ts — London Strategic Edge market data, proxied server-side.
 *
 * ## Why a proxy and not a direct call
 *
 * Measured 2026-09-09: `api.londonstrategicedge.com` answers the CORS preflight
 * with `access-control-allow-methods` and `access-control-allow-headers` but
 * NO `access-control-allow-origin`. A browser will not accept that, so a fetch
 * straight from the app fails as "Load failed" — the same trap FRED sits in,
 * where a perfectly good key reads as a broken one and someone goes off to
 * regenerate it. Asking this box instead removes the whole failure class.
 *
 * It also keeps the key on the server. LSE's terms allow their data in your own
 * research, models and internal work commercially, but NOT redistribution to
 * third parties. A key that ships to a browser is a key anyone can lift and use
 * as their own feed, which is exactly the thing that clause forbids.
 *
 * ## Routes (verified live 2026-09-09 by probing without a key —
 *     401 "missing x-api-key" means the route exists, 404 means it does not)
 *
 *   GET  /vault/candles    OHLCV for any catalog symbol
 *   GET  /vault/series     economic series and bond yields
 *   GET  /vault/catalog    what is available
 *   GET  /vault/reference  reference files
 *   POST /vault/export     bulk export job (405 on GET, so POST-only)
 *
 * Not routes, despite looking like them: /vault/candle, /vault/chains,
 * /vault/options, /vault/symbols, /vault/macro — all 404. Options data comes
 * through /vault/candles with a dataset parameter, not its own path.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

const LSE_BASE = "https://api.londonstrategicedge.com";

/** Only these reach upstream. An open proxy to an authenticated API is a gift. */
const ALLOWED_PATHS = new Set(["candles", "series", "catalog", "reference"]);

const TIMEOUT_MS = 30_000;

function apiKey(): string {
  return (process.env["LSE_API_KEY"] ?? "").trim();
}

/**
 * GET /api/lse/:path?…  — forwards the query string to the matching vault route.
 *
 * Behind requireAuth: this box is Luka's, and an unauthenticated proxy would
 * hand his rate limit to anyone who found the URL.
 */
router.get("/lse/:path", requireAuth, async (req: Request, res: Response) => {
  const path = String(req.params["path"] ?? "");
  if (!ALLOWED_PATHS.has(path)) {
    res.status(404).json({ ok: false, error: `unknown_lse_path:${path}` });
    return;
  }

  const key = apiKey();
  if (!key) {
    res.status(503).json({ ok: false, error: "lse_key_not_configured" });
    return;
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const url = `${LSE_BASE}/vault/${path}${qs.toString() ? `?${qs}` : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: { "x-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      // Upstream's own words, verbatim. "429 rate limit" and "401 bad key" need
      // opposite fixes, and a tidy generic message hides which one you have —
      // the same reason DataSourcesPanel keeps provider refusals unedited.
      logger.warn({ path, status: upstream.status }, "LSE upstream refused");
      res.status(upstream.status).json({
        ok: false,
        error: `lse_http_${upstream.status}`,
        detail: text.slice(0, 400),
      });
      return;
    }

    try {
      res.json({ ok: true, data: JSON.parse(text) });
    } catch {
      // Not every vault route answers JSON; reference files may not.
      res.json({ ok: true, raw: text.slice(0, 200_000) });
    }
  } catch (err) {
    logger.error({ err, path }, "LSE request failed");
    res.status(502).json({
      ok: false,
      error: "lse_unreachable",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
