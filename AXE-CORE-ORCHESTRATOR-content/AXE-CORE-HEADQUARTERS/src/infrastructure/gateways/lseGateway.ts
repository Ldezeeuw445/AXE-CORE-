/**
 * lseGateway — London Strategic Edge, reached through the VPS backend.
 *
 * ## Why nothing here talks to LSE directly
 *
 * Measured 2026-09-09: their CORS preflight answers with
 * `access-control-allow-methods: GET, POST, OPTIONS` and
 * `access-control-allow-headers: Content-Type, x-api-key` — but no
 * `access-control-allow-origin`. Without that header the browser discards the
 * response no matter how good the key is, and the failure arrives as a bare
 * "Load failed". That is the FRED trap: it reads as a broken key, and sends you
 * off to regenerate one that was never the problem. The packaged Tauri shell
 * does not escape this either — it carries no HTTP plugin, so its webview is
 * bound by CORS exactly like a browser.
 *
 * ## Why not /api/* either
 *
 * Measured the same day: axeheadquarters.com is served by Cloudflare, and every
 * /api/ path answers `text/html` with the SPA shell — /api/weather included,
 * which has existed for months. The serverless functions did not move with the
 * host, so anything routed there gets a web page where it expects JSON. Calls
 * go to the FastAPI backend on the VPS instead (api.axecompanion.com), which is
 * alive, holds the key, and is already the app's documented way around CORS.
 *
 * ## What may be built on this
 *
 * LSE permit their data in your own research, trading, models and internal work
 * INCLUDING commercially, and forbid making it available to third parties. This
 * is AXE Core — one operator, no third parties — so it is squarely inside that.
 * Companion and Trading OS have paying subscribers, which is the other side of
 * that line: nothing from here goes into those apps until LSE answer on an
 * enterprise licence. Derived conclusions are arguable; raw series, charts and
 * exports are not.
 */
import { lseVault } from '@/infrastructure/gateways/axeCoreApiService';

export interface LseResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Short human line for the data-sources panel. */
  detail?: string;
}

/**
 * The vault routes that exist. Verified live by calling without a key: 401
 * "missing x-api-key" means the route is real, 404 means it is not.
 * /vault/candle, /vault/chains, /vault/options, /vault/symbols and /vault/macro
 * all 404 despite looking plausible — options data comes through candles with a
 * dataset parameter, not a path of its own.
 */
export type LseVaultPath = 'candles' | 'series' | 'catalog' | 'reference';

async function vault<T>(
  path: LseVaultPath,
  params: Record<string, string | number | undefined> = {},
): Promise<LseResult<T>> {
  try {
    const body = await lseVault<T>(path, params);
    if (body.ok === false) {
      // Upstream's own refusal, kept whole: "429 rate limit" and "401 bad key"
      // need opposite fixes and a tidy message hides which one you have.
      return { ok: false, error: body.error ?? 'lse_error', detail: body.detail };
    }
    return { ok: true, data: body.data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'vps_backend_unreachable' };
  }
}

/**
 * Cheapest call that proves the whole chain: app → VPS backend → key → LSE.
 * Used by DataSourcesPanel, which asks providers rather than checking that a
 * string is present — "key set" would show a tick and tell you nothing.
 */
export async function lseCatalogProbe(): Promise<LseResult> {
  const res = await vault('catalog', { limit: 1 });
  if (!res.ok) return res;
  const n = Array.isArray(res.data)
    ? res.data.length
    : Array.isArray((res.data as { datasets?: unknown[] })?.datasets)
      ? (res.data as { datasets: unknown[] }).datasets.length
      : null;
  return { ok: true, detail: n === null ? 'catalog reachable' : `catalog reachable · ${n} row(s)` };
}

/** What LSE holds. Use it to discover symbols and datasets before pulling. */
export async function lseCatalog(params: {
  dataset?: string;
  search?: string;
  limit?: number;
} = {}): Promise<LseResult> {
  return vault('catalog', params);
}

/** OHLCV for any catalog symbol, at any stored resolution. */
export async function lseCandles(params: {
  symbol: string;
  dataset?: string;
  resolution?: string;
  start?: string;
  end?: string;
  limit?: number;
}): Promise<LseResult> {
  return vault('candles', params);
}

/**
 * Economic series and bond yields — date/value rows.
 * 14,640 series across 100+ countries, some back to 1900, which is the piece
 * FRED cannot give: FRED is US-only.
 */
export async function lseSeries(params: {
  series: string;
  start?: string;
  end?: string;
}): Promise<LseResult> {
  return vault('series', params);
}
