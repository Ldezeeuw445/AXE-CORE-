/**
 * Turns a canonical AXE pair into the ticker THIS broker actually lists it
 * under, by matching the registry against the account's real symbol list.
 *
 * Different MT5 brokers list the same instrument under wildly different names.
 * Measured 2026-08-21 across the two live accounts:
 *
 *   XAUUSD → "XAUUSD" on MetaQuotes-Demo, "GOLD.pro" on OANDA
 *   NAS100 → "USTEC"  on MetaQuotes-Demo, "US100.pro" on OANDA
 *   BTCUSD → absent   on MetaQuotes-Demo, "BTCUSD" on OANDA
 *
 * The alias table and the matching rules now live in
 * domain/tradingIntel/pairRegistry.ts — one vocabulary, shared with the UI and
 * the autopilot, rather than a second private copy here.
 *
 * What changed and why it mattered: this module used to alias-match with
 * `symbol.toUpperCase().includes(alias)`. Against MetaQuotes-Demo's 12.524
 * mostly-US-equity tickers, `includes('GOLD')` also matches GOLDMAN. A loose
 * alias does not cost you a trade, it puts one in the wrong instrument.
 */
import type { MetaApiRegion } from '@/infrastructure/gateways/metaApiService';
import { budgetedFetch } from '@/infrastructure/gateways/metaApiBudget';
import { resolvePairTicker, tradablePairsFor } from '@/domain/tradingIntel/pairRegistry';

export const CLIENT_API_HOST: Record<MetaApiRegion, string> = {
  london: 'https://mt-client-api-v1.london.agiliumtrade.ai',
  'new-york': 'https://mt-client-api-v1.new-york.agiliumtrade.ai',
  singapore: 'https://mt-client-api-v1.singapore.agiliumtrade.ai',
  tokyo: 'https://mt-client-api-v1.tokyo.agiliumtrade.ai',
};

interface Entry { at: number; symbols: string[] }
const symbolListCache = new Map<string, Entry>();
/** A broker's instrument list does not change between cycles. */
const TTL_MS = 60 * 60_000;

export async function fetchAccountSymbols(
  cfg: { token: string; accountId: string; region: MetaApiRegion },
): Promise<string[]> {
  const cached = symbolListCache.get(cfg.accountId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.symbols;

  const base = CLIENT_API_HOST[cfg.region] || CLIENT_API_HOST.london;
  const path = `/users/current/accounts/${encodeURIComponent(cfg.accountId)}/symbols`;
  try {
    // Through the budget like every other MetaAPI call. This was a raw fetch —
    // the fifth unmetered path found in this codebase, and the standing rule
    // exists because each one was found the same expensive way.
    const res = await budgetedFetch({
      accountKey: cfg.accountId,
      quotaKey: cfg.token,
      path,
      method: 'GET',
      priority: 'background',
      doFetch: () => fetch(`${base}${path}`, {
        headers: { Accept: 'application/json', 'auth-token': cfg.token },
      }),
    });
    if (!res.ok) return cached?.symbols ?? [];
    const body = await res.json();
    const list = Array.isArray(body)
      ? body
          .map(s => (typeof s === 'string' ? s : (s as { symbol?: string })?.symbol))
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [];
    if (!list.length) return cached?.symbols ?? [];
    symbolListCache.set(cfg.accountId, { at: Date.now(), symbols: list });
    return list;
  } catch {
    return cached?.symbols ?? [];
  }
}

/** The broker's real ticker for a canonical pair, or null if it has none. */
export async function resolveBrokerSymbol(
  wanted: string,
  cfg: { token: string; accountId: string; region: MetaApiRegion },
): Promise<string | null> {
  const symbols = await fetchAccountSymbols(cfg);
  // An unreadable list must not read as "this broker carries nothing" — that
  // is a lookup failure, and the caller falls back to the bare name.
  if (!symbols.length) return null;
  return resolvePairTicker(wanted, symbols);
}

/** Every registry pair this account can trade, as canonical AXE ids. */
export async function tradablePairsForAccount(
  cfg: { token: string; accountId: string; region: MetaApiRegion },
): Promise<string[]> {
  return tradablePairsFor(await fetchAccountSymbols(cfg));
}

/** Test seam — the cache is module-wide and would leak between cases. */
export function __resetSymbolListCache(): void {
  symbolListCache.clear();
}
