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
import { loadDurableConfig, saveDurableConfig } from '@/infrastructure/persistence/durableConfigService';
import { resolveBrokerSymbol, fetchAccountSymbols, __resetSymbolListCache } from '@/infrastructure/gateways/metaApiSymbolResolver';
import { resolvePairTicker } from '@/domain/tradingIntel/pairRegistry';

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

import { budgetedFetch } from '@/infrastructure/gateways/metaApiBudget';

const REGION_HOST: Record<MetaApiRegion, string> = {
  'new-york': 'mt-client-api-v1.new-york.agiliumtrade.ai',
  london: 'mt-client-api-v1.london.agiliumtrade.ai',
  singapore: 'mt-client-api-v1.singapore.agiliumtrade.ai',
  tokyo: 'mt-client-api-v1.tokyo.agiliumtrade.ai',
};

export async function getMetaApiConfig(): Promise<MetaApiConfig | null> {
  // Durable store first: it is what makes the config identical between the
  // browser (where it gets configured) and the packaged Tauri app (where
  // 24/7 autopilot actually runs) regardless of which one is signed into
  // Supabase. localStorage stays as a same-window fast path underneath it,
  // and as the last resort if the API is briefly unreachable.
  const durable = await loadDurableConfig<MetaApiConfig | null>('metaapi_config', null).catch(() => null);
  if (durable?.token && durable?.accountId) {
    localStorage.setItem(KEY, JSON.stringify(durable));
    return durable;
  }
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
  // Durable write is the one that actually reaches the other window — do
  // not let this be fire-and-forget the way the old saveSetting call was;
  // a config that only "looks" saved (localStorage updated, durable write
  // silently failed) is exactly the bug this replaces.
  await saveDurableConfig('metaapi_config', next);
  return next;
}

export async function clearMetaApiConfig(): Promise<void> {
  localStorage.removeItem(KEY);
  await saveDurableConfig('metaapi_config', null);
}

function clientBase(region: MetaApiRegion): string {
  return `https://${REGION_HOST[region]}`;
}

/**
 * Every trading read and write goes through the call budget — see
 * metaApiBudget.ts for why it exists and what it guarantees. This is only the
 * adapter that supplies the URL, the auth header and the account key.
 */
async function metaFetch(
  cfg: MetaApiConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return budgetedFetch({
    accountKey: cfg.accountId,
    // The subscription, not the account — see BudgetedRequest.quotaKey. The
    // tail is enough to tell two tokens apart without holding a whole secret
    // as a map key.
    quotaKey: cfg.token.slice(-12),
    path,
    method: (init?.method ?? 'GET').toUpperCase(),
    doFetch: () => fetch(`${clientBase(cfg.region)}${path}`, {
      ...init,
      headers: {
        'auth-token': cfg.token,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    }),
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
    // PROVISIONING, not the client host. The bare `/users/current/accounts/{id}`
    // route describes the account itself and only exists on the provisioning
    // API; asking the regional client host for it returns
    // "Could not find path /users/current/accounts/..." — a 404 that reads like
    // a missing account and is nothing of the sort.
    //
    // That 404 is what wrote `connected: false` and "MT5 MetaAPI (check token)"
    // into axe_broker_connection, and everything downstream believed it: no
    // equity, no positions, no account snapshot, and a trading agent that
    // refused to size because it could not see a balance. Verified 2026-08-19
    // that the account is DEPLOYED and CONNECTED with €48,454.38 on it, and
    // that the regional client host answers /account-information fine.
    // Provisioning is the same subscription and the same meter. This was a raw
    // fetch, so it counted against MetaAPI's quota while being invisible to the
    // budget — the budget then reported headroom that did not exist. Any call
    // that spends the quota has to be seen by the thing rationing it.
    const res = await budgetedFetch({
      accountKey: cfg.accountId,
      quotaKey: cfg.token.slice(-12),
      path: `provisioning:/users/current/accounts/${cfg.accountId}`,
      method: 'GET',
      doFetch: () => fetch(
        `${PROVISIONING_BASE}/users/current/accounts/${cfg.accountId}`,
        { headers: provisioningHeaders(cfg.token) },
      ),
    });
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

/**
 * Positions for a SPECIFIC account, rather than whichever one is active.
 *
 * The Accounts tab has to show every account at once, and every function in
 * this file resolves its account inside getMetaApiConfig(). Reading a second
 * account therefore needs the config passed in — so the body lives here once
 * and the no-argument version below resolves the active config and calls it.
 * Two copies of a request that must agree is how the two views end up
 * disagreeing about the same broker.
 */
export async function metaApiPositionsFor(cfg: MetaApiConfig): Promise<
  | { ok: true; positions: unknown[] }
  | { ok: false; error: string }
> {
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

export async function metaApiGetPositions(): Promise<
  | { ok: true; positions: unknown[] }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  return metaApiPositionsFor(cfg);
}

/**
 * Every instrument this account can actually trade.
 *
 * CLIENT host, not provisioning. The split is the one that cost this project a
 * long-standing bug: routes describing the ACCOUNT (`/users/current/accounts`,
 * `/users/current/accounts/{id}`) live on provisioning, routes describing what
 * the account can DO — positions, prices, history, and this — live on the
 * regional client host. Asking the wrong one returns a 404 that reads like a
 * missing account and is nothing of the sort. metaFetch already targets the
 * client host, which is why this uses it and metaApiGetAccount does not.
 *
 * Returns raw broker names, suffixes and all (XAUUSD.x, NDX1_CFD.DE). Folding
 * those into the names AXE's backtests use is canonicalPair()'s job in
 * liveTradeReconciler — deliberately not done here, because a watchlist has to
 * hold what the broker will accept in an order.
 */
export async function metaApiListSymbols(): Promise<
  | { ok: true; symbols: string[] }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  try {
    const res = await metaFetch(
      cfg,
      `/users/current/accounts/${cfg.accountId}/symbols`,
    );
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `symbols ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    const symbols = Array.isArray(data)
      ? data
          .map(v => (typeof v === 'string' ? v : (v as { symbol?: string })?.symbol))
          .filter((v): v is string => !!v && typeof v === 'string')
      : [];
    return { ok: true, symbols };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Which symbols THIS account can actually trade.
 *
 * Two accounts on one token do not offer the same market. Measured
 * 2026-08-21 on the two live demos:
 *
 *   MT5 100K (MetaQuotes-Demo) : XAUUSD, US30      — no BTCUSD/ETHUSD/NAS100
 *   OANDA 50K (OANDATMS-MT5)   : BTCUSD, ETHUSD    — no XAUUSD/US30/DJ30
 *
 * The autopilot fanned every symbol at every account, so each cycle spent
 * about seven requests on symbols the broker has never heard of. MetaAPI
 * answers those with NotFoundError and, past a threshold, throttles the whole
 * subscription with the words "The quota has been exceeded" — which is why
 * five rounds of pacing and caching never touched it, and why it only began
 * when the second account was added. The 404s were the cost, not the volume.
 *
 * Cached per account for an hour: a broker's instrument list is not something
 * that changes between cycles, and re-asking is the exact call being avoided.
 */
export async function metaApiListSymbolsFor(cfg: MetaApiConfig): Promise<
  | { ok: true; symbols: string[] }
  | { ok: false; error: string }
> {
  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/symbols`);
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `symbols ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    const symbols = Array.isArray(data)
      ? data
          .map(v => (typeof v === 'string' ? v : (v as { symbol?: string })?.symbol))
          .filter((v): v is string => !!v && typeof v === 'string')
      : [];
    return { ok: true, symbols };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * True when the account offers the symbol. On a failed lookup this returns
 * TRUE, not false: a broker that will not answer its instrument list is a
 * different fault from one that lacks the instrument, and silently grounding
 * an account because a list call failed would be the worse of the two
 * mistakes. The order itself remains the real gate.
 */
export async function accountSupportsSymbol(cfg: MetaApiConfig, symbol: string): Promise<boolean> {
  const symbols = await fetchAccountSymbols({
    token: cfg.token, accountId: cfg.accountId, region: cfg.region,
  });
  // An empty or unreadable list is a lookup failure, not a mute broker.
  if (!symbols.length) return true;
  // Registry-resolved, so a broker that calls gold GOLD.pro still counts as
  // carrying XAUUSD. An exact-name check here would have grounded OANDA on
  // gold, silver and four indices it does in fact offer.
  const broker = resolvePairTicker(toMt5Symbol(symbol), symbols);
  if (!broker) return false;
  // Listed is not the same as tradeable — see symbolIsTradeable.
  return symbolIsTradeable(cfg, broker);
}

/**
 * Everything below is about not paying for the check with the thing it protects.
 */

/**
 * Quoted is not tradeable.
 *
 * Measured 2026-08-25: MetaQuotes-Demo lists USTEC and US30, quotes live
 * prices for both, and reports `tradeMode: SYMBOL_TRADE_MODE_DISABLED` — the
 * indices are view-only on that account. The desk saw the symbol in the list,
 * decided SELL NAS100 at 61%, sent the order, and the terminal refused it.
 * That account has never held a position.
 *
 * Refused orders are not free. MetaAPI counts them, and enough of them earns
 * "It seems like you are trying to access too many unexisting or undeployed
 * trading accounts" — the 429 this project spent five fixes reading as a rate
 * limit. Asking a broker for something it has already said it will not do,
 * every cycle, is what buys that penalty.
 *
 * Cached hard, and deliberately: a trade mode changes when a broker changes
 * its product, not between cycles. One lookup per account per symbol per day
 * is the whole cost.
 */
const TRADE_MODE_TTL_MS = 24 * 60 * 60 * 1000;
const tradeModeCache = new Map<string, { tradeable: boolean; at: number }>();
const tradeModeInFlight = new Set<string>();

export function __resetTradeModeCache(): void {
  tradeModeCache.clear();
  // The in-flight set too. It is module-wide, and a lookup whose fetch never
  // settles never reaches its `finally` — so without this a test that stubs a
  // hanging response leaves the symbol permanently "already being asked", and
  // the NEXT test silently skips its own fetch.
  tradeModeInFlight.clear();
}

/**
 * Answers from cache, and NEVER waits on the network.
 *
 * The first version awaited the specification inline. That put up to one
 * lookup per account per symbol — about thirty on a cold cycle — into the
 * trading path, paced by the same budget as the orders. The cycle that
 * followed ran past twenty-three minutes against a fifteen-minute interval,
 * where the one before it took nine and a half.
 *
 * That is the check paying for itself with the thing it exists to protect:
 * it is here to stop wasted MetaAPI calls, and it was making thirty of them
 * before the first order went out.
 *
 * So an unknown symbol is allowed through — the order itself is still the real
 * gate, and readTradeResult now reports a refusal honestly instead of inventing
 * a fill — while the mode is fetched in the background for the NEXT cycle. One
 * cycle of already-known-bad orders, once, is a far smaller bill than every
 * cycle waiting on a lookup.
 */
function symbolIsTradeable(cfg: MetaApiConfig, brokerSymbol: string): boolean {
  const cacheKey = `${cfg.accountId}:${brokerSymbol}`;
  const hit = tradeModeCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TRADE_MODE_TTL_MS) return hit.tradeable;

  void learnTradeMode(cfg, brokerSymbol, cacheKey);
  // Not known yet — let the order decide, and know the answer next time.
  return true;
}

async function learnTradeMode(cfg: MetaApiConfig, brokerSymbol: string, cacheKey: string): Promise<void> {
  if (tradeModeInFlight.has(cacheKey)) return;
  tradeModeInFlight.add(cacheKey);
  try {
    const res = await metaFetch(
      cfg,
      `/users/current/accounts/${cfg.accountId}/symbols/${encodeURIComponent(brokerSymbol)}/specification`,
      { method: 'GET' },
    );
    // A lookup that fails is not a broker saying no: leave it unknown rather
    // than caching a refusal we did not hear, and try again next cycle.
    if (!res.ok) return;
    const spec = (await res.json()) as { tradeMode?: string };
    const mode = String(spec?.tradeMode ?? '').toUpperCase();
    // Anything not explicitly a no counts as yes: brokers use LONGONLY,
    // SHORTONLY and CLOSEONLY too, and those can still fill something. Only
    // DISABLED is a flat refusal.
    const tradeable = !mode.includes('DISABLED');
    tradeModeCache.set(cacheKey, { tradeable, at: Date.now() });
    if (!tradeable) {
      console.info(`[metaapi] ${brokerSymbol} is quote-only on ${cfg.accountId.slice(0, 8)} (${mode}) — skipping it from the next cycle`);
    }
  } catch {
    /* unknown stays unknown */
  } finally {
    tradeModeInFlight.delete(cacheKey);
  }
}

/**
 * Test seam: await the background lookups the trading path deliberately does not.
 *
 * Real delays, not microtasks: these go through metaFetch's pacing layer, so a
 * queue of `await Promise.resolve()` returns long before the fetch does and the
 * assertion lands on an empty cache.
 */
export async function __settleTradeModes(timeoutMs = 5000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (tradeModeInFlight.size && Date.now() < until) {
    await new Promise(r => setTimeout(r, 10));
  }
}

/** Test seam — the cache is process-wide and would leak between cases. */
export function __resetSymbolCache(): void {
  __resetSymbolListCache();
}

const PROVISIONING_BASE = 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

function provisioningHeaders(token: string, extra?: Record<string, string>): HeadersInit {
  return { Accept: 'application/json', 'Content-Type': 'application/json', 'auth-token': token, ...extra };
}

export interface MetaApiTradingAccount {
  /** MetaAPI's list/provisioning endpoints return `_id`; some return `id`. Always resolve via metaApiAccountId(). */
  id?: string;
  _id?: string;
  connectionStatus?: string;
  state?: string;
  region?: string;
  login?: string;
  server?: string;
  name?: string;
  type?: string;
}

/** Resolves the real account UUID regardless of which field MetaAPI used for a given endpoint. */
export function metaApiAccountId(account: MetaApiTradingAccount): string | null {
  const id = account.id ?? account._id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Lists every MT5/MT4 account already provisioned under this MetaAPI token. */
export async function metaApiListAccounts(token: string): Promise<
  { ok: true; accounts: MetaApiTradingAccount[] } | { ok: false; error: string }
> {
  if (!token) return { ok: false, error: 'Token required' };
  try {
    const res = await fetch(`${PROVISIONING_BASE}/users/current/accounts`, {
      method: 'GET',
      headers: provisioningHeaders(token),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `List accounts ${res.status}: ${JSON.stringify(body).slice(0, 200)}` };
    }
    const accounts = (Array.isArray(body) ? body : []).filter((a: MetaApiTradingAccount) => metaApiAccountId(a) != null);
    return { ok: true, accounts };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ProvisionMt5AccountInput {
  token: string;
  login: string;
  /** Master (trading) password — required so AXE can place orders, not just read data. */
  password: string;
  name: string;
  server: string;
  region: MetaApiRegion;
}

/**
 * Registers a new MT5 account with MetaAPI from raw broker credentials
 * (login/password/server), mirroring AXE Companion's account-creation flow.
 * MetaAPI stores the broker credentials on its side; AXE only ever holds
 * the token + the resulting accountId afterwards.
 */
export async function metaApiProvisionAccount(
  input: ProvisionMt5AccountInput,
): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const body = {
    login: input.login.replace(/\D/g, ''),
    password: input.password,
    name: input.name || `AXE CORE ${input.login}`,
    server: input.server.trim(),
    platform: 'mt5',
    type: 'cloud-g2',
    manualTrades: false,
    magic: 0,
    region: input.region,
  };

  const maxPasses = 20;
  for (let pass = 0; pass < maxPasses; pass++) {
    let res: Response;
    try {
      res = await fetch(`${PROVISIONING_BASE}/users/current/accounts`, {
        method: 'POST',
        headers: provisioningHeaders(input.token, { 'transaction-id': crypto.randomUUID().replace(/-/g, '') }),
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const payload = await res.json().catch(() => null);

    if (res.status === 201) {
      const id = (payload as { id?: string })?.id;
      if (!id) return { ok: false, error: 'MetaAPI did not return an account id' };
      return { ok: true, accountId: id };
    }
    if (res.status === 202) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15_000));
      continue;
    }
    return { ok: false, error: `Provisioning ${res.status}: ${JSON.stringify(payload).slice(0, 220)}` };
  }
  return { ok: false, error: 'Provisioning timed out — MetaAPI kept returning 202 (still deploying)' };
}

export interface MetaApiAccountBalance {
  balance: number | null;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  currency: string | null;
}

/** Live balance/equity/margin for the connected MT5 account (not the paper/demo book). */
/** Balance/equity for a SPECIFIC account — see metaApiPositionsFor. */
export async function metaApiAccountInfoFor(cfg: MetaApiConfig): Promise<
  | { ok: true; info: MetaApiAccountBalance }
  | { ok: false; error: string }
> {
  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/account-information`);
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `account-information ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      balance?: number; equity?: number; margin?: number; freeMargin?: number; currency?: string;
    };
    return {
      ok: true,
      info: {
        balance: typeof data.balance === 'number' ? data.balance : null,
        equity: typeof data.equity === 'number' ? data.equity : null,
        margin: typeof data.margin === 'number' ? data.margin : null,
        freeMargin: typeof data.freeMargin === 'number' ? data.freeMargin : null,
        currency: data.currency ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function metaApiGetAccountInfo(): Promise<
  | { ok: true; info: MetaApiAccountBalance }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  return metaApiAccountInfoFor(cfg);
}

export async function metaApiGetOrders(): Promise<
  | { ok: true; orders: unknown[] }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/orders`);
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `orders ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, orders: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface MetaApiSymbolPrice {
  symbol: string;
  bid: number | null;
  ask: number | null;
  time: string | null;
}

export async function metaApiGetSymbolPrice(symbol: string): Promise<
  | { ok: true; price: MetaApiSymbolPrice }
  | { ok: false; error: string }
> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  let mt5Symbol = toMt5Symbol(symbol);
  try {
    let res = await metaFetch(
      cfg,
      `/users/current/accounts/${cfg.accountId}/symbols/${encodeURIComponent(mt5Symbol)}/current-price`,
    );
    let errText = res.ok ? '' : await res.text();
    if (!res.ok && /does not exist|not found|invalid symbol/i.test(errText)) {
      const resolved = await resolveBrokerSymbol(mt5Symbol, { token: cfg.token, accountId: cfg.accountId, region: cfg.region });
      if (resolved && resolved.toUpperCase() !== mt5Symbol.toUpperCase()) {
        mt5Symbol = resolved;
        res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/symbols/${encodeURIComponent(mt5Symbol)}/current-price`);
        errText = res.ok ? '' : await res.text();
      }
    }
    if (!res.ok) {
      return { ok: false, error: `current-price ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = (await res.json()) as { bid?: number; ask?: number; time?: string };
    return {
      ok: true,
      price: {
        symbol: mt5Symbol,
        bid: typeof data.bid === 'number' ? data.bid : null,
        ask: typeof data.ask === 'number' ? data.ask : null,
        time: data.time ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Resolves the broker's actual tradeable symbol name before an order goes
 * out. Price lookups (metaApiGetSymbolPrice) already did this via
 * resolveBrokerSymbol; order placement never did — it only ever sent
 * toMt5Symbol's bare uppercase strip. That's a real mismatch risk: MT5
 * brokers commonly suffix symbols per account type (XAUUSD.c, EURUSD.x,
 * US30.ecn, ...), so the chart could quote a correct price for the
 * resolved symbol while an order silently failed (or worse, hit a
 * differently-configured instrument) on the unresolved bare name. Falls
 * back to the bare name only when the account's symbol list can't be
 * fetched at all (e.g. not connected yet).
 */
async function resolveTradableSymbol(cfg: MetaApiConfig, wanted: string): Promise<string> {
  const bare = toMt5Symbol(wanted);
  const resolved = await resolveBrokerSymbol(bare, { token: cfg.token, accountId: cfg.accountId, region: cfg.region });
  return resolved ?? bare;
}


/* ------------------------------------------------------- order preflight */

/**
 * Is this account in a state where an order could possibly fill?
 *
 * MetaAPI has two separate facts and only one of them was ever checked. An
 * account can exist, be configured correctly, hold the right credentials —
 * and be UNDEPLOYED, which means MetaAPI has no running instance for it. Every
 * call then times out, and every order is a request against something that is
 * not there.
 *
 * That is what MetaAPI's 429 has been telling this project all along: "you are
 * trying to access too many unexisting or undeployed trading accounts". The
 * throttle is not about volume. It counts requests to accounts that are not
 * running, and the autopilot was generating them every cycle.
 *
 * Measured 2026-08-26: after six accounts were registered, ALL eight went
 * UNDEPLOYED — including the two that had been trading for days. Nothing on
 * any screen said so; `connectionStatus` was read once, rendered as a caption,
 * and never used as a gate.
 *
 * ## Only a definite no blocks
 *
 * An unreadable state is not a refusal. If the provisioning API cannot be
 * reached, the order goes out and the broker decides — same rule as the
 * trade-mode check. Blocking on a failed lookup would let one bad network
 * moment stop a desk that was working fine.
 */
interface DeploymentFact { tradeable: boolean; reason: string; at: number }

const deploymentCache = new Map<string, DeploymentFact>();

/** Deployment changes rarely, but when it changes it matters within minutes. */
const DEPLOYMENT_TTL_MS = 5 * 60 * 1000;

/** Forget what we knew — called when an order is rejected, since a rejection
 *  is evidence the cached answer is stale. */
export function __forgetDeployment(accountId: string): void {
  deploymentCache.delete(accountId);
}

export async function accountIsDeployed(
  cfg: MetaApiConfig,
): Promise<{ tradeable: boolean; reason: string }> {
  const hit = deploymentCache.get(cfg.accountId);
  if (hit && Date.now() - hit.at < DEPLOYMENT_TTL_MS) {
    return { tradeable: hit.tradeable, reason: hit.reason };
  }

  try {
    const res = await fetch(
      `${PROVISIONING_BASE}/users/current/accounts/${cfg.accountId}`,
      { headers: provisioningHeaders(cfg.token) },
    );
    // 404 is the most definite no there is: MetaAPI has no such account. It is
    // also the exact request its 429 counts — "unexisting or undeployed" — so
    // treating it as unknown and letting the order through would keep
    // generating the very calls that earn the throttle.
    //
    // This happens the moment an account is deleted at MetaAPI while its row
    // stays in the desk's config, which is a normal thing to do and left three
    // such rows behind on 2026-08-27.
    if (res.status === 404) {
      const fact = {
        tradeable: false,
        reason: 'no such account at MetaAPI — it was deleted there, remove it from Accounts',
        at: Date.now(),
      };
      deploymentCache.set(cfg.accountId, fact);
      return { tradeable: fact.tradeable, reason: fact.reason };
    }
    if (!res.ok) {
      // Anything else is unknown, not refused.
      return { tradeable: true, reason: `deployment state unreadable (${res.status})` };
    }
    const a = (await res.json()) as MetaApiTradingAccount;
    const state = String(a?.state ?? '').toUpperCase();
    const conn = String(a?.connectionStatus ?? '').toUpperCase();

    // DEPLOYING is a definite "not yet" rather than a definite no, but an
    // order sent into it fails just the same, so it is held back too — with a
    // reason that says to wait rather than to fix something.
    let fact: DeploymentFact;
    if (state === 'UNDEPLOYED') {
      fact = { tradeable: false, reason: 'account is UNDEPLOYED at MetaAPI — deploy it there first', at: Date.now() };
    } else if (state === 'DEPLOYING' || state === 'UNDEPLOYING') {
      fact = { tradeable: false, reason: `account is ${state} — not ready yet`, at: Date.now() };
    } else if (conn === 'DISCONNECTED') {
      fact = { tradeable: false, reason: 'account is deployed but DISCONNECTED from the broker', at: Date.now() };
    } else {
      fact = { tradeable: true, reason: `${state || 'DEPLOYED'} · ${conn || 'CONNECTED'}`, at: Date.now() };
    }
    deploymentCache.set(cfg.accountId, fact);
    return { tradeable: fact.tradeable, reason: fact.reason };
  } catch (e) {
    return { tradeable: true, reason: `deployment state unreadable (${e instanceof Error ? e.message : 'error'})` };
  }
}

/**
 * What MetaAPI actually said about an order.
 *
 * ## The bug this replaces
 *
 * This read `orderId || numericCode`, and returned `{ ok: true }` for anything
 * that came back HTTP 200. Both halves are wrong:
 *
 *   - `numericCode` is the TERMINAL's return code, not an order id. It is the
 *     MT5 retcode (10009 = DONE) or an MQL error. Falling back to it meant a
 *     rejection was reported as a fill whose id was the rejection code.
 *   - A REJECTED trade is still HTTP 200. MetaAPI answers 200 and puts the
 *     terminal's verdict in the body, so `res.ok` says the request was
 *     delivered — never that the order was filled.
 *
 * Measured 2026-08-25 on the live desk: `MT5 100K DEMO: SELL NAS100 conf=61%
 * · fill -12`, printed alongside two genuine fills (a UUID and 527028940).
 * MT5 had zero open positions at that moment and has never had one. The desk
 * reported a trade that does not exist, and the ledger learned from it.
 *
 * So: a fill needs a real order id, or the terminal's own word that it is
 * done. A return code is never an id, and 200 is never a fill.
 */
export function readTradeResult(
  raw: unknown,
): { ok: true; orderId?: string; raw?: unknown } | { ok: false; error: string } {
  const r = (raw ?? {}) as { orderId?: unknown; numericCode?: unknown; stringCode?: unknown; message?: unknown };

  const orderId = r.orderId != null && String(r.orderId).trim() !== ''
    ? String(r.orderId)
    : undefined;

  const stringCode = typeof r.stringCode === 'string' ? r.stringCode : '';
  // MT5 says TRADE_RETCODE_DONE / _DONE_PARTIAL / _PLACED; MT4 says ERR_NO_ERROR.
  const accepted = /^(TRADE_RETCODE_(DONE|DONE_PARTIAL|PLACED)|ERR_NO_ERROR)$/i.test(stringCode);

  if (orderId || accepted) return { ok: true, orderId, raw };

  // Say what the terminal said, verbatim. A rejection reported in this app's
  // own words is a rejection that gets mis-attributed later.
  const code = stringCode
    || (r.numericCode != null ? `code ${String(r.numericCode)}` : '')
    || 'no order id and no return code';
  const detail = typeof r.message === 'string' && r.message ? ` — ${r.message}` : '';
  return { ok: false, error: `MetaAPI rejected the order: ${code}${detail}` };
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
  /** Previously never sent — every market order (including every one the
   *  agent placed) went out with no protective stop or target at all. */
  stopLoss?: number | null;
  takeProfit?: number | null;
  /** Which account to trade. Defaults to the active one, so every existing
   *  caller is unchanged; the autopilot passes one explicitly when it trades
   *  more than a single account. */
  account?: MetaApiConfig;
}): Promise<{ ok: true; orderId?: string; raw?: unknown } | { ok: false; error: string }> {
  const cfg = input.account ?? await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };

  const volume = Math.round(input.volume * 100) / 100;
  if (!(volume >= 0.01)) {
    return { ok: false, error: 'Volume must be ≥ 0.01 lots' };
  }

  // PREFLIGHT. An order to an account MetaAPI is not running cannot fill, and
  // every attempt counts toward the throttle that then takes down the accounts
  // that ARE running.
  const deployed = await accountIsDeployed(cfg);
  if (!deployed.tradeable) {
    return { ok: false, error: `Not sent — ${deployed.reason}` };
  }

  const symbol = await resolveTradableSymbol(cfg, input.symbol);
  const actionType = input.side === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';

  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/trade`, {
      method: 'POST',
      body: JSON.stringify({
        actionType,
        symbol,
        volume,
        ...(input.stopLoss != null ? { stopLoss: input.stopLoss } : {}),
        ...(input.takeProfit != null ? { takeProfit: input.takeProfit } : {}),
        comment: (input.comment || 'AXE CORE').slice(0, 31),
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A rejection is evidence the cached deployment answer has gone stale —
      // an account can go down between the preflight and the order, and the
      // next attempt should ask again rather than trust a five-minute-old yes.
      __forgetDeployment(cfg.accountId);
      const msg =
        (raw as { message?: string; error?: string })?.message ||
        (raw as { error?: string })?.error ||
        JSON.stringify(raw).slice(0, 200);
      return { ok: false, error: `MetaAPI trade ${res.status}: ${msg}` };
    }
    const result = readTradeResult(raw);
    if (!result.ok) __forgetDeployment(cfg.accountId);
    return result;
  } catch (e) {
    __forgetDeployment(cfg.accountId);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type PendingOrderType = 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop';

const PENDING_ACTION_TYPE: Record<PendingOrderType, string> = {
  buy_limit: 'ORDER_TYPE_BUY_LIMIT',
  sell_limit: 'ORDER_TYPE_SELL_LIMIT',
  buy_stop: 'ORDER_TYPE_BUY_STOP',
  sell_stop: 'ORDER_TYPE_SELL_STOP',
};

/**
 * Place a pending (limit/stop) order on MT5 via MetaAPI — the counterpart to
 * metaApiMarketOrder() for non-market tickets. Mirrors AXE Companion's
 * clientPlaceOrder (src/lib/mt5/metaApiClient.ts): same /trade endpoint,
 * same actionType mapping, openPrice required.
 */
export async function metaApiPendingOrder(input: {
  symbol: string;
  type: PendingOrderType;
  volume: number;
  openPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  slippagePoints?: number;
  comment?: string;
}): Promise<{ ok: true; orderId?: string; raw?: unknown } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };

  const volume = Math.round(input.volume * 100) / 100;
  if (!(volume >= 0.01)) {
    return { ok: false, error: 'Volume must be ≥ 0.01 lots' };
  }
  if (!(input.openPrice > 0)) {
    return { ok: false, error: 'Pending order needs an entry price' };
  }

  const symbol = await resolveTradableSymbol(cfg, input.symbol);
  const actionType = PENDING_ACTION_TYPE[input.type];

  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/trade`, {
      method: 'POST',
      body: JSON.stringify({
        actionType,
        symbol,
        volume,
        openPrice: input.openPrice,
        ...(input.stopLoss != null ? { stopLoss: input.stopLoss } : {}),
        ...(input.takeProfit != null ? { takeProfit: input.takeProfit } : {}),
        ...(input.slippagePoints != null ? { slippage: input.slippagePoints } : {}),
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
    return readTradeResult(raw);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function metaApiTradeAction(
  cfg: MetaApiConfig,
  body: Record<string, unknown>,
): Promise<{ ok: true; raw?: unknown } | { ok: false; error: string }> {
  try {
    const res = await metaFetch(cfg, `/users/current/accounts/${cfg.accountId}/trade`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (raw as { message?: string; error?: string })?.message ||
        (raw as { error?: string })?.error ||
        JSON.stringify(raw).slice(0, 200);
      return { ok: false, error: `MetaAPI trade ${res.status}: ${msg}` };
    }
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Modify SL/TP on an open position. */
export async function metaApiModifyPosition(
  positionId: string,
  fields: { stopLoss?: number | null; takeProfit?: number | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };
  const result = await metaApiTradeAction(cfg, {
    actionType: 'POSITION_MODIFY',
    positionId,
    ...(fields.stopLoss != null ? { stopLoss: fields.stopLoss } : {}),
    ...(fields.takeProfit != null ? { takeProfit: fields.takeProfit } : {}),
  });
  return result.ok ? { ok: true } : result;
}

/** Modify price/SL/TP on a still-pending order. */
export async function metaApiModifyOrder(
  orderId: string,
  fields: { openPrice?: number | null; stopLoss?: number | null; takeProfit?: number | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };
  const result = await metaApiTradeAction(cfg, {
    actionType: 'ORDER_MODIFY',
    orderId,
    ...(fields.openPrice != null ? { openPrice: fields.openPrice } : {}),
    ...(fields.stopLoss != null ? { stopLoss: fields.stopLoss } : {}),
    ...(fields.takeProfit != null ? { takeProfit: fields.takeProfit } : {}),
  });
  return result.ok ? { ok: true } : result;
}

/** Cancel a pending order before it fills. */
export async function metaApiCancelOrder(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };
  const result = await metaApiTradeAction(cfg, { actionType: 'ORDER_CANCEL', orderId });
  return result.ok ? { ok: true } : result;
}

/** Close an open position at market — used by the kill switch to flatten everything. */
/**
 * Close a position on a SPECIFIC account.
 *
 * A position id only means anything to the account that holds it, and the
 * account-blind version below could only ever reach the active one. That was
 * survivable with one account and became a safety hole with two: the kill
 * switch iterated the active account's positions, closed those, and reported
 * success while the other account stayed open with live exposure. A stop
 * button that stops half of it is worse than one that admits it failed.
 */
export async function metaApiClosePositionFor(
  cfg: MetaApiConfig,
  positionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!cfg?.enabled) return { ok: false, error: 'account disabled' };
  const result = await metaApiTradeAction(cfg, { actionType: 'POSITION_CLOSE_ID', positionId });
  return result.ok ? { ok: true } : result;
}

export async function metaApiClosePosition(positionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured or disabled' };
  return metaApiClosePositionFor(cfg, positionId);
}

export interface MetaApiDeal {
  id?: string;
  type?: string;
  entryType?: string;
  symbol?: string;
  time?: string;
  volume?: number;
  price?: number;
  commission?: number;
  swap?: number;
  profit?: number;
  positionId?: string;
  /** Echoes back whatever comment the opening order was sent with —
   *  brokerConnector tags this with the active strategy (see
   *  brokerConnector.tradeComment), so this is how a strategy tag
   *  survives on a real account (best-effort: some brokers strip or
   *  truncate comments differently, this isn't guaranteed universal). */
  comment?: string;
}

/**
 * Fetches raw closed-deal history for a time range — same endpoint/paging
 * pattern as AXE Companion's clientGetHistoryDealsRange
 * (history-deals/time/{start}/{end}, 1000/page). This is the account's
 * REAL trade history — the paper book only mirrors trades AXE itself
 * placed, not whatever else happened on this MT5 account.
 */
export async function metaApiGetHistoryDeals(
  startIso: string,
  endIso: string,
): Promise<{ ok: true; deals: MetaApiDeal[] } | { ok: false; error: string }> {
  const cfg = await getMetaApiConfig();
  if (!cfg?.enabled) return { ok: false, error: 'MetaAPI not configured' };
  return metaApiGetHistoryDealsFor(cfg, startIso, endIso);
}

/**
 * Closed-deal history for ONE named account.
 *
 * The version above reads whichever account happens to be active, which is
 * fine for a single-account screen and useless for a desk that trades three:
 * every per-account panel would have shown the same book under three
 * different headings.
 */
export async function metaApiGetHistoryDealsFor(
  cfg: MetaApiConfig,
  startIso: string,
  endIso: string,
): Promise<{ ok: true; deals: MetaApiDeal[] } | { ok: false; error: string }> {
  const s = encodeURIComponent(startIso);
  const e = encodeURIComponent(endIso);
  const all: MetaApiDeal[] = [];
  let offset = 0;
  const limit = 1000;
  try {
    for (;;) {
      const res = await metaFetch(
        cfg,
        `/users/current/accounts/${cfg.accountId}/history-deals/time/${s}/${e}?offset=${offset}&limit=${limit}`,
      );
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: `history-deals ${res.status}: ${t.slice(0, 200)}` };
      }
      const body = await res.json();
      const chunk: MetaApiDeal[] = Array.isArray(body) ? body : [];
      all.push(...chunk);
      if (chunk.length < limit) break;
      offset += limit;
    }
    return { ok: true, deals: all };
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
