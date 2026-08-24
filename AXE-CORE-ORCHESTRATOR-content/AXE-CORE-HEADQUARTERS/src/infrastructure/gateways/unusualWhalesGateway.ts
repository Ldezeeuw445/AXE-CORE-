/**
 * unusualWhalesGateway — options flow, dark pool and insider activity, direct.
 *
 * ## Why direct and not through the intel-proxy
 *
 * Trading OS's `intel-proxy` edge function already exposes these, and AXE CORE
 * called it — but every UW action came back 401 while the OSINT actions beside
 * them (GDELT, NOAA, jets, vessels) worked fine. The proxy looks for the key
 * under a name the project's secrets do not carry, and that is Trading OS's
 * deploy to fix, not this app's.
 *
 * Verified 2026-08-24: the same key called directly returns real data —
 * market tide with a net put premium of 19.5M against a net call premium of
 * -10.1M. So the key is good and the proxy is the broken link. Going direct
 * removes a dependency on another app's deploy rather than waiting on it.
 *
 * The OSINT layers still go through the proxy, because those genuinely live
 * there and work.
 *
 * ## What this refuses to do
 *
 * Every function returns null or [] on failure. Never a shaped placeholder,
 * never a "typical" value. An intel desk that invents a number is worse than
 * one that says nothing, because the invented one gets traded on.
 */
import { loadDurableConfig } from '@/infrastructure/persistence/durableConfigService';

const BASE = 'https://api.unusualwhales.com/api';

interface IntelSourceKeys {
  unusualWhales?: string;
  secApi?: string;
  fmp?: string;
  twelveData?: string;
}

/** Cached per session: the key does not change mid-run and this is called per lane. */
let cachedKey: string | null | undefined;

async function key(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  const cfg = await loadDurableConfig<IntelSourceKeys>('intel_sources', {});
  cachedKey = cfg.unusualWhales?.trim() || null;
  return cachedKey;
}

/** Test seam — the module-level cache would leak between cases. */
export function __resetUwKeyCache(): void {
  cachedKey = undefined;
}

async function uw<T>(path: string, timeoutMs = 20_000): Promise<T | null> {
  const k = await key();
  if (!k) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${k}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = await res.json() as { data?: T };
    return body?.data ?? null;
  } catch {
    return null;
  }
}

export interface MarketTide {
  timestamp: string;
  netCallPremium: number;
  netPutPremium: number;
}

/**
 * Net options premium across the market, newest last.
 *
 * The one UW read that is about direction rather than a single name: puts
 * outweighing calls is the market paying up for downside, which is a different
 * fact from price falling and often precedes it.
 */
export async function fetchMarketTide(): Promise<MarketTide[]> {
  const rows = await uw<Array<Record<string, unknown>>>('/market/market-tide');
  if (!Array.isArray(rows)) return [];
  return rows
    .map(r => ({
      timestamp: String(r.timestamp ?? ''),
      netCallPremium: Number(r.net_call_premium ?? 0),
      netPutPremium: Number(r.net_put_premium ?? 0),
    }))
    .filter(r => r.timestamp);
}

export interface FlowAlert {
  ticker: string;
  type: string;
  premium: number;
  strike: number | null;
  expiry: string | null;
}

/** Unusual options prints — size that does not fit the name's normal flow. */
export async function fetchFlowAlerts(limit = 30): Promise<FlowAlert[]> {
  const rows = await uw<Array<Record<string, unknown>>>(`/option-trades/flow-alerts?limit=${limit}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    ticker: String(r.ticker ?? ''),
    type: String(r.type ?? ''),
    premium: Number(r.total_premium ?? r.premium ?? 0),
    strike: r.strike != null ? Number(r.strike) : null,
    expiry: r.expiry ? String(r.expiry) : null,
  })).filter(r => r.ticker);
}

/**
 * A short, factual brief for the Intel lane.
 *
 * Returns null rather than a sentence when nothing answered, so the lane can
 * say "no data" instead of printing a confident paragraph built on zero rows —
 * which is the failure this whole gateway exists to avoid.
 */
export async function buildOptionsFlowBrief(): Promise<string | null> {
  const [tide, alerts] = await Promise.all([fetchMarketTide(), fetchFlowAlerts(12)]);
  if (!tide.length && !alerts.length) return null;

  const lines: string[] = [];

  if (tide.length) {
    const last = tide[tide.length - 1];
    const net = last.netCallPremium - last.netPutPremium;
    // Stated as a direction with its number attached, so the model cannot
    // reuse the wording without the evidence.
    lines.push(
      `Options tide ${last.timestamp}: net call ${Math.round(last.netCallPremium).toLocaleString()}, ` +
      `net put ${Math.round(last.netPutPremium).toLocaleString()} → ` +
      `${net >= 0 ? 'call-side' : 'put-side'} by ${Math.abs(Math.round(net)).toLocaleString()}.`,
    );
  }

  if (alerts.length) {
    const top = [...alerts].sort((a, b) => b.premium - a.premium).slice(0, 5);
    lines.push('Largest unusual prints: ' + top
      .map(a => `${a.ticker} ${a.type}${a.strike ? ` ${a.strike}` : ''} ${Math.round(a.premium).toLocaleString()}`)
      .join(' · '));
  }

  return lines.join('\n');
}
