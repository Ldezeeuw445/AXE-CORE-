/**
 * Vercel Edge Function — London Strategic Edge market data.
 * GET /api/lse?path=<candles|series|catalog|reference>&…
 *
 * ## Why a proxy and not a direct call from the app
 *
 * Measured 2026-09-09: api.londonstrategicedge.com answers the CORS preflight
 * with `access-control-allow-methods` and `access-control-allow-headers` but NO
 * `access-control-allow-origin`. A browser discards the response however good
 * the key is, and the failure arrives as a bare "Load failed" — the FRED trap,
 * where a working key reads as a broken one and someone regenerates a key that
 * was never the problem.
 *
 * It also keeps the key off the client. LSE permit their data in your own
 * research, models and internal work commercially, and forbid making it
 * available to third parties. A key shipped to a browser is a key anyone can
 * lift and run as their own feed, which is the thing that clause exists to
 * prevent.
 *
 * ## Routes
 *
 * Verified live by probing without a key — 401 "missing x-api-key" means the
 * route exists, 404 means it does not:
 *
 *   /vault/candles    OHLCV for any catalog symbol
 *   /vault/series     economic series and bond yields
 *   /vault/catalog    what is available
 *   /vault/reference  reference files
 *
 * Not routes despite looking like them: /vault/candle, /vault/chains,
 * /vault/options, /vault/symbols, /vault/macro. Options data comes through
 * candles with a dataset parameter, not a path of its own.
 *
 * `path` is a query parameter rather than a nested dynamic route so this stays
 * one file and needs no vercel.json rewrite — the rewrite list there only
 * covers /api/proxy/*, and anything not listed would fall through to
 * index.html and answer HTML to a JSON caller.
 */

export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders });
}

const LSE_BASE = "https://api.londonstrategicedge.com";

/** Only these reach upstream. An open proxy to an authenticated API is a gift. */
const ALLOWED_PATHS = new Set(["candles", "series", "catalog", "reference"]);

/** Never forwarded: the caller does not get to choose the key or the target. */
const BLOCKED_PARAMS = new Set(["path", "api_key", "apikey", "key", "x-api-key"]);

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);

  const url = new URL(request.url);
  const path = (url.searchParams.get("path") ?? "").trim();

  if (!ALLOWED_PATHS.has(path)) {
    return json(
      { ok: false, error: `unknown_lse_path:${path || "(none)"}`, allowed: [...ALLOWED_PATHS] },
      404,
    );
  }

  const key = (process.env["LSE_API_KEY"] ?? "").trim();
  if (!key) return json({ ok: false, error: "lse_key_not_configured" }, 503);

  const qs = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (!BLOCKED_PARAMS.has(k.toLowerCase())) qs.set(k, v);
  }

  const target = `${LSE_BASE}/vault/${path}${qs.toString() ? `?${qs}` : ""}`;

  try {
    const upstream = await fetch(target, {
      headers: { "x-api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      // Upstream's own words, verbatim. "429 rate limit" and "401 bad key" need
      // opposite fixes, and a tidy generic message hides which one you have.
      return json(
        { ok: false, error: `lse_http_${upstream.status}`, detail: text.slice(0, 400) },
        upstream.status,
      );
    }

    try {
      return json({ ok: true, data: JSON.parse(text) });
    } catch {
      // Not every vault route answers JSON — reference files may not.
      return json({ ok: true, raw: text.slice(0, 200_000) });
    }
  } catch (err) {
    return json(
      { ok: false, error: "lse_unreachable", detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
}
