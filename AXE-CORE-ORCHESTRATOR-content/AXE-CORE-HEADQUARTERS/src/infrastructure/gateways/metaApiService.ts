/**
 * metaApiService — MetaAPI.cloud bridge for MT5/MT4 demo (and later live) accounts.
 *
 * Setup (user):
 *  1. Create token at https://app.metaapi.cloud/
 *  2. Add MT5 demo account → copy account id
 *  3. Paste token + accountId in Trading Intel → Agent → MetaAPI
 *
 * Security: token stored in localStorage + settings mirror (same pattern as other keys).
 * Prefer later: keep token only on VPS and proxy /metaapi/* through axe-core API.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

export type MetaApiRegion = 'new-york' | 'london' | 'singapore' | 'tokyo';

export interface MetaApiConfig {
  token: string;
  accountId: string;
  region: MetaApiRegion;
  /** When true, agent routes fills here instead of internal paper book */
  enabled: boolean;
  updatedAt: string;
}

const KEY = 'axe_metaapi_config';

const REGION_HOST: Record<MetaApiRegion, string> = {
  'new-york': 'mt-client-api-v1.new-york.agiliumtrade.ai',
  london: 'mt-client-api-v1.london.agiliumtrade.ai',
  singapore: 'mt-client-api-v1.singapore.agiliumtrade.ai',
  tokyo: 'mt-client-api-v1.tokyo.agiliumtrade.ai',
};

export async function getMetaApiConfig(): Promise<MetaApiConfig | null> {
  const cloud = await loadSetting<MetaApiConfig | null>(KEY, null);
  if (cloud?.token && cloud?.accountId) return cloud;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as MetaApiConfig;
      if (p.token && p.accountId) return p;
    }
  } catch { /* ignore */ }
  return null;
}

export async function saveMetaApiConfig(
  partial: Partial<MetaApiConfig> & { token: string; accountId: string },
): Promise<MetaApiConfig> {
  const prev = await getMetaApiConfig();
  const next: MetaApiConfig = {
    token: partial.token.trim(),
    accountId: partial.accountId.trim(),
    region: partial.region || prev?.region || 'london',
    enabled: partial.enabled ?? prev?.enabled ?? true,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  void saveSetting(KEY, next);
  return next;
}

export async function clearMetaApiConfig(): Promise<void> {
  localStorage.removeItem(KEY);
  void saveSetting(KEY, null);
}

function clientBase(region: MetaApiRegion): string {
  return `https://${REGION_HOST[region]}`;
}

async function metaFetch(
  cfg: MetaApiConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${clientBase(cfg.region)}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      'auth-token': cfg.token,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

/** Map AXE symbols → common MT5 symbol names */
export function toMt5Symbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.endsWith('USDT')) return s.replace(/USDT$/, 'USD');
  if (s.includes('BTC') && !s.includes('USD')) return 'BTCUSD';
  if (s.includes('ETH') && !s.includes('USD')) return 'ETHUSD';
  // EUR-USD → EURUSD
  return s;
}

export interface MetaApiAccountInfo {
  id?: string;
  name?: string;
  broker?: string;
  login?: string;
  server?: string;
  platform?: string;
  connectionStatus?: string;
}

export async function metaApiGetAccount(): Promise<
  | { ok: true; account: MetaApiAccountInfo }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}`);
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `MetaAPI account ${res.status}: ${t.slice(0, 200)}` };
    }
    const account = (await res.json()) as MetaApiAccountInfo;
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function metaApiGetPositions(): Promise<
  | { ok: true; positions: unknown[] }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  try {
    const res = await metaFetch(
      cfg,
      `/users/current/accounts/${cfg.accountId}/positions`,
    );
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `positions ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, positions: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Place market order on MT5 via MetaAPI.
 * volume is in lots (e.g. 0.01). Caller converts qty → lots.
 */
export async function metaApiMarketOrder(input: {
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  comment?: string;
}): Promise<{ ok: true; orderId?: string; raw?: unknown } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };

  const volume = Math.round(input.volume * 100) / 100;
  if (!(volume >= 0.01)) {
    return { ok: false, error: 'Volume must be ≥ 0.01 lots' };
  }

  const symbol = toMt5Symbol(input.symbol);
  const actionType = input.side === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';

  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/trade`, {
      method: 'POST',
      body: JSON.stringify({
        actionType,
        symbol,
        volume,
        comment: (input.comment || 'AXE CORE').slice(0, 31),
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (raw as { message?: string; error?: string })?.message ||
        (raw as { error?: string })?.error ||
        JSON.stringify(raw).slice(0, 200);
      return { ok: false, error: `MetaAPI trade ${res.status}: ${msg}` };
    }
    const orderId =
      String(
        (raw as { orderId?: string; stringCode?: string })?.orderId ||
          (raw as { numericCode?: number })?.numericCode ||
          '',
      ) || undefined;
    return { ok: true, orderId, raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Rough qty (units) → lots for crypto/FX — conservative floor */
export function qtyToLots(symbol: string, qty: number, price: number): number {
  const s = symbol.toUpperCase();
  // FX-style: treat qty as notional USD / (price * 100000) for majors is complex;
  // for crypto CFDs many brokers use 1 lot ≈ 1 unit — use small default.
  if (/BTC|ETH|SOL|XRP/.test(s)) {
    // qty was coin amount from paper sizer — map to min 0.01 lots
    const lots = Math.max(0.01, Math.floor(qty * 100) / 100);
    return Math.min(lots, 1); // hard cap 1 lot until user sets risk on MT5 side
  }
  // equity / index: 0.01 lots min
  if (price > 0 && qty * price < 50) return 0.01;
  return Math.max(0.01, Math.min(1, Math.floor(qty * 100) / 100));
}
