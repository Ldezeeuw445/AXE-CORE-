/**
 * lseGateway — London Strategic Edge, reached through /api/lse.
 *
 * ## Why nothing here talks to LSE directly
 *
 * Measured 2026-09-09: their CORS preflight answers with
 * `access-control-allow-methods: GET, POST, OPTIONS` and
 * `access-control-allow-headers: Content-Type, x-api-key` — but no
 * `access-control-allow-origin`. Without that header the browser discards the
 * response no matter how good the key is, and the failure arrives as a bare
 * "Load failed". That is the FRED trap: it reads as a broken key, and sends you
 * off to regenerate one that was never the problem. So every call goes to the
 * /api/lse Vercel function, which holds the key and has no such rule.
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
import { apiUrl } from '@/infrastructure/config/apiUrl';

export interface LseResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** Short human line for the data-sources panel. */
  detail?: string;
}

/** The vault routes that exist. Probed live; the rest 404. */
export type LseVaultPath = 'candles' | 'series' | 'catalog' | 'reference';

async function vault<T>(
  path: LseVaultPath,
  params: Record<string, string | number | undefined> = {},
): Promise<LseResult<T>> {
  // `path` rides as a query parameter, not a route segment: vercel.json only
  // rewrites /api/proxy/*, so /api/lse/<path> would fall through to index.html
  // and answer HTML to a JSON caller.
  const qs = new URLSearchParams({ path });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }

  try {
    const res = await fetch(apiUrl(`/api/lse?${qs}`), {
      signal: AbortSignal.timeout(35_000),
    });

    const body = (await res.json().catch(() => ({}))) as LseResult<T> & { detail?: string };

    if (!res.ok || body.ok === false) {
      // Upstream's own refusal, kept whole: "429 rate limit" and "401 bad key"
      // need opposite fixes and a tidy message hides which one you have.
      return {
        ok: false,
        error: body.error ?? `http_${res.status}`,
        detail: body.detail,
      };
    }

    return { ok: true, data: body.data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'api_box_unreachable' };
  }
}

/**
 * Cheapest call that proves the whole chain: app → API box → key → LSE.
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
