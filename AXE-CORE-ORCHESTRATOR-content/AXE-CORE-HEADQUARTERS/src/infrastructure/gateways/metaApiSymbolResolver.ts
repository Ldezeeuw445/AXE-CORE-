/**
 * Different MT5 brokers list the same instrument under wildly different
 * tickers (one real account here has gold as "GOLD.pro" — not any XAUUSD
 * variant, not even a suffix). Rather than hardcode one broker's naming,
 * fetch the account's real symbol list once per session and fuzzy-match
 * against it whenever the canonical symbol the UI asked for doesn't exist.
 * Shared by metaApiMarketData.ts (candles) and metaApiService.ts (ticks) —
 * kept in its own module so neither has to import the other.
 */
import type { MetaApiRegion } from '@/infrastructure/gateways/metaApiService';

export const CLIENT_API_HOST: Record<MetaApiRegion, string> = {
  london: 'https://mt-client-api-v1.london.agiliumtrade.ai',
  'new-york': 'https://mt-client-api-v1.new-york.agiliumtrade.ai',
  singapore: 'https://mt-client-api-v1.singapore.agiliumtrade.ai',
  tokyo: 'https://mt-client-api-v1.tokyo.agiliumtrade.ai',
};

const ASSET_ALIASES: Record<string, string[]> = {
  XAUUSD: ['XAU', 'GOLD'],
  XAGUSD: ['XAG', 'SILVER'],
  WTIUSD: ['WTI', 'OIL', 'CRUDE'],
  BCOUSD: ['BRENT', 'UKOIL'],
  US30: ['DJ30', 'DOW', 'US30'],
  US500: ['SPX', 'SP500', 'US500'],
  NAS100: ['NAS100', 'NDX', 'USTEC'],
  GER40: ['GER40', 'DAX', 'DE40'],
  UK100: ['UK100', 'FTSE'],
};

const symbolListCache = new Map<string, string[]>();

export async function fetchAccountSymbols(cfg: { token: string; accountId: string; region: MetaApiRegion }): Promise<string[]> {
  const cached = symbolListCache.get(cfg.accountId);
  if (cached) return cached;
  const base = CLIENT_API_HOST[cfg.region] || CLIENT_API_HOST.london;
  try {
    const res = await fetch(`${base}/users/current/accounts/${encodeURIComponent(cfg.accountId)}/symbols`, {
      headers: { Accept: 'application/json', 'auth-token': cfg.token },
    });
    if (!res.ok) return [];
    const body = await res.json();
    const list = Array.isArray(body) ? body.filter((s): s is string => typeof s === 'string') : [];
    symbolListCache.set(cfg.accountId, list);
    return list;
  } catch {
    return [];
  }
}

/** Finds the broker's real ticker for a canonical symbol the UI asked for. */
export async function resolveBrokerSymbol(
  wanted: string,
  cfg: { token: string; accountId: string; region: MetaApiRegion },
): Promise<string | null> {
  const symbols = await fetchAccountSymbols(cfg);
  if (!symbols.length) return null;
  const upper = wanted.toUpperCase();
  // Exact/prefix match first (handles broker suffixes like XAUUSD.a, XAUUSDm).
  const prefixHit = symbols.find((s) => s.toUpperCase() === upper || s.toUpperCase().startsWith(upper));
  if (prefixHit) return prefixHit;
  const aliases = ASSET_ALIASES[upper] ?? [];
  for (const alias of aliases) {
    const hit = symbols.find((s) => s.toUpperCase().includes(alias));
    if (hit) return hit;
  }
  return null;
}
