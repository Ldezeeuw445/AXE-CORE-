/**
 * Broker connector — paper (internal) OR MetaAPI MT5 demo when configured.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { BrokerConnection, BrokerKind } from '@/domain/tradingIntel/botTypes';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import {
  executeDemoTrade,
  getDemoAccount,
  markPositions,
} from '@/infrastructure/persistence/demoTradingService';
import { accountLabel } from '@/infrastructure/persistence/tradingAccountsService';
import type { DemoSide } from '@/domain/tradingIntel/demoTypes';
import {
  getMetaApiConfig,
  metaApiGetAccount,
  metaApiMarketOrder,
  metaApiPendingOrder,
  metaApiAccountInfoFor,
  metaApiPositionsFor,
  metaApiGetHistoryDealsFor,
  qtyToLots,
  toMt5Symbol,
  type PendingOrderType,
  type MetaApiConfig,
  type MetaApiDeal,
} from '@/infrastructure/gateways/metaApiService';

const KEY = 'axe_broker_connection';

export interface EffectiveAccountState {
  /** false = no real MT5 connected, everything below is the paper mock. */
  isReal: boolean;
  /** False when the live account could not be read. Callers MUST NOT size,
   *  trade or update the circuit breaker on an unavailable state. */
  available: boolean;
  /** Why it is unavailable, for the decision trace. Null when available. */
  unavailableReason: string | null;
  equity: number;
  /** Open long qty for `symbol` on whichever account is actually active —
   *  never mixes real and paper positions. */
  positionQty: (symbol: string) => number;
}

/**
 * The single source of truth tradingAgentEngine must use for risk sizing,
 * the circuit breaker, and the short-position check — previously all three
 * always read the internal $100k paper mock via getDemoAccount(), even
 * with a real MT5 account connected. That meant risk-per-trade was sized
 * against a fake balance (2x too large if the real account were $50k), the
 * circuit breaker's drawdown was measured against a number that can't
 * actually go down, and "do I already hold this" checked the wrong book
 * entirely. He has to learn from what's real, not from a number no one
 * ever grounds against
 */
export async function getEffectiveAccountState(
  symbol: string,
  /** Read THIS account rather than the active one. Sizing must come from the
   *  equity of the account the order will land on — using the active account's
   *  equity to size a trade on another is how one account's balance quietly
   *  decides another's risk. */
  account?: MetaApiConfig,
): Promise<EffectiveAccountState> {
  const meta = account ?? await getMetaApiConfig();
  if (meta?.enabled && meta.token && meta.accountId) {
    const [balRes, posRes] = await Promise.all([
      metaApiAccountInfoFor(meta),
      metaApiPositionsFor(meta),
    ]);
    if (balRes.ok && balRes.info.equity != null) {
      const positions = posRes.ok ? (posRes.positions as Record<string, unknown>[]) : [];
      return {
        isReal: true,
        available: true,
        unavailableReason: null,
        equity: balRes.info.equity,
        positionQty: (sym: string) => {
          const target = toMt5Symbol(sym);
          return positions
            .filter(p => String(p.symbol ?? '').toUpperCase().startsWith(target) && !String(p.type ?? '').toUpperCase().includes('SELL'))
            .reduce((s, p) => s + (Number(p.volume) || 0), 0);
        },
      };
    }
    // MetaAPI is configured but the live fetch failed (offline, token issue,
    // ...). This used to fall through to the $100k paper account, which is
    // strictly worse than refusing: the agent would size 2x against an
    // account that does not exist, and those fills then entered the learning
    // loop as if they were normal. A cycle that cannot see the real balance
    // does not get to trade.
    // Carry the real reason. The call already returns one — "The quota has
    // been exceeded", "MetaAPI account 401", a network message — and replacing
    // it with a generic line threw the diagnosis away at exactly the point it
    // gets read. Measured 2026-08-24: the lock screen said "MetaAPI fetch
    // failed" while all three accounts answered 200 with real equity, so the
    // refusal was upstream of MetaAPI and the message pointed at the wrong
    // system entirely.
    const why = !balRes.ok
      ? balRes.error
      : 'account answered without an equity figure';
    console.warn(`[brokerConnector] cannot read live account for ${symbol}: ${why}`);
    return unavailable(`Live account unreadable — ${why}`);
  }
  return unavailable('No live broker connected');
}

/** No real account, no numbers. Equity 0 so any accidental arithmetic
 *  collapses to zero size rather than quietly inventing capital. */
function unavailable(reason: string): EffectiveAccountState {
  return {
    isReal: false,
    available: false,
    unavailableReason: reason,
    equity: 0,
    positionQty: () => 0,
  };
}

// ── The day-limit's meter ────────────────────────────────────────────────────
//
// maxTradesPerDay is the only cap that stands between a decision loop and a
// burst of real orders. On 8 September 18 XAUUSD orders reached one MT5 account
// in 14 seconds under a cap of 20, because the count it was tested against came
// from getDemoAccount() — the paper mirror. That book only holds fills AXE
// itself placed through this app, it resets with local state, and it is not
// what the broker actually did. A brake that reads the wrong meter is not a
// brake. For a real account the honest meter is the broker's own opening deals
// for the day; below that, an in-process tally covers the seconds between an
// order leaving for the broker and surfacing in that history, so a run can't
// outrun its own fills.

function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Positions OPENED on `day` (UTC yyyy-mm-dd) from a deal history.
 *
 * An opening is a BUY/SELL deal with entry IN or INOUT — the exact rule
 * csvJournalAnalytics groups trades by, so the count matches what the ledger
 * and reconciler already call an open. Closes (ENTRY_OUT) and balance
 * operations don't count: the cap limits how many trades were STARTED today,
 * not how many events touched the account.
 *
 * Pure so the brake can be tested without a live account.
 */
export function countBrokerOpeningsToday(deals: MetaApiDeal[], day: string): number {
  return deals.filter(d => {
    const isTrade = d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL';
    const isOpen = d.entryType === 'DEAL_ENTRY_IN' || d.entryType === 'DEAL_ENTRY_INOUT';
    return isTrade && isOpen && String(d.time ?? '').slice(0, 10) === day;
  }).length;
}

/**
 * The day-limit's verdict, as a pure decision so the brake itself is testable.
 *
 * - Paper: the mirror IS the book, so its count is the right one.
 * - Real, broker readable: the broker is the truth, and the in-process tally
 *   covers a fill that hasn't reached history yet (max of the two).
 * - Real, broker UNreadable: no working meter, so `unverified` is true. The
 *   caller must hold rather than open — the 8-Sept burst is exactly what a
 *   missing brake produces. The in-process tally still caps a burst inside the
 *   current run even here. This only ever holds an OPEN; exits are never gated.
 */
export function dayLimitState(input: {
  isReal: boolean;
  brokerCount: number | null;
  inProcessCount: number;
  paperCount: number;
}): { tradesToday: number; unverified: boolean } {
  if (!input.isReal) return { tradesToday: input.paperCount, unverified: false };
  if (input.brokerCount == null) return { tradesToday: input.inProcessCount, unverified: true };
  return { tradesToday: Math.max(input.brokerCount, input.inProcessCount), unverified: false };
}

// Orders this PROCESS has fired today, per account, counted the instant they
// leave for the broker. history-deals lags a fresh fill by seconds; without
// this, several near-simultaneous decisions each read the same pre-burst broker
// count and every one clears the cap. Keyed by accountId; rolls over on UTC day.
const placedToday = new Map<string, { day: string; count: number }>();

export function placedTodayInProcess(accountId: string | null | undefined): number {
  if (!accountId) return 0;
  const rec = placedToday.get(accountId);
  return rec && rec.day === utcDay() ? rec.count : 0;
}

function notePlacedToday(accountId: string): void {
  const day = utcDay();
  const rec = placedToday.get(accountId);
  if (rec && rec.day === day) rec.count += 1;
  else placedToday.set(accountId, { day, count: 1 });
}

/** Test seam — the in-process tally is module state. */
export function __resetPlacedToday(): void {
  placedToday.clear();
  openingsCache.clear();
}

// A short cache so a cycle scanning many symbols doesn't fetch the same
// account's day history once per symbol. MetaAPI counts every call against the
// subscription; the tally above keeps the number fresh between fetches.
const openingsCache = new Map<string, { at: number; day: string; count: number }>();
const OPENINGS_TTL_MS = 15_000;

/**
 * How many positions this account has OPENED today at the broker, or null when
 * there is no real account or its history can't be read this cycle. Null is the
 * signal the day-limit fails closed on — see dayLimitState.
 */
export async function brokerOpeningsTodayFor(account?: MetaApiConfig): Promise<number | null> {
  const meta = account ?? await getMetaApiConfig();
  if (!(meta?.enabled && meta.token && meta.accountId)) return null;
  const day = utcDay();
  const hit = openingsCache.get(meta.accountId);
  if (hit && hit.day === day && Date.now() - hit.at < OPENINGS_TTL_MS) return hit.count;
  const res = await metaApiGetHistoryDealsFor(meta, `${day}T00:00:00.000Z`, new Date().toISOString());
  if (!res.ok) return null;
  const count = countBrokerOpeningsToday(res.deals, day);
  openingsCache.set(meta.accountId, { at: Date.now(), day, count });
  return count;
}

export async function getBrokerConnection(): Promise<BrokerConnection> {
  // Prefer MetaAPI when enabled + configured
  const meta = await getMetaApiConfig();
  if (meta?.enabled && meta.token && meta.accountId) {
    return {
      kind: 'mt5_demo',
      // The ACTIVE account's own name, not "MT5".
      //
      // This was hardcoded, so every screen that shows the broker label called
      // the connection "MT5 via MetaAPI" whatever was actually active — and
      // the active account is OANDA. The status strip then read
      // "MT5 via MetaAPI · connected · MT5 equity 48472.39 EUR" while the real
      // MT5 account sat at 100.242 EUR with no open positions. Three screens
      // agreeing on the same wrong name is very hard to argue with.
      label: `${await accountLabel(meta.accountId).catch(() => 'Account')} via MetaAPI`,
      connected: true,
      accountId: meta.accountId,
      server: meta.region,
      notes: 'Orders route to MT5 demo/live account through MetaAPI.cloud',
      updatedAt: meta.updatedAt,
    };
  }

  const cloud = await loadSetting<BrokerConnection | null>(KEY, null);
  if (cloud?.kind) return cloud;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as BrokerConnection;
  } catch { /* ignore */ }
  return {
    kind: 'paper_live_prices',
    label: 'Paper · live public prices',
    connected: true,
    updatedAt: new Date().toISOString(),
    notes: 'Internal AXE demo book. Prices from Binance/Stooq.',
  };
}

export async function setBrokerConnection(conn: BrokerConnection): Promise<BrokerConnection> {
  const next = { ...conn, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(next));
  void saveSetting(KEY, next);
  return next;
}

export async function connectBrokerKind(
  kind: BrokerKind,
  meta?: { accountId?: string; server?: string; notes?: string },
): Promise<BrokerConnection> {
  if (kind === 'mt5_demo') {
    const cfg = await getMetaApiConfig();
    if (cfg?.enabled && cfg.token) {
      const probe = await metaApiGetAccount();
      return setBrokerConnection({
        kind: 'mt5_demo',
        label: probe.ok ? `MT5 MetaAPI · ${probe.account.name || cfg.accountId}` : 'MT5 MetaAPI (check token)',
        connected: probe.ok,
        accountId: cfg.accountId,
        server: cfg.region,
        notes: probe.ok
          ? `Connected · ${probe.account.broker || ''} ${probe.account.platform || ''}`
          : probe.error,
        updatedAt: new Date().toISOString(),
      });
    }
    return setBrokerConnection({
      kind: 'mt5_demo',
      label: 'MT5 Demo (add MetaAPI token)',
      connected: false,
      accountId: meta?.accountId,
      server: meta?.server,
      notes: 'Paste MetaAPI token + account id in Agent tab.',
      updatedAt: new Date().toISOString(),
    });
  }
  if (kind === 'krypt') {
    return setBrokerConnection({
      kind,
      label: 'Krypt.cc (pending API)',
      connected: false,
      accountId: meta?.accountId,
      notes: meta?.notes || 'Krypt settings/trade API not wired yet.',
      updatedAt: new Date().toISOString(),
    });
  }
  return setBrokerConnection({
    kind: 'paper_live_prices',
    label: 'Paper · live public prices',
    connected: true,
    notes: 'Internal demo account with live public OHLC.',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Builds the MT5 comment (31-char hard limit) — the only place the
 * strategy tag survives on a real MetaAPI account, since deals don't carry
 * back arbitrary metadata, just whatever comment string was sent.
 *
 * When a strategy is active the comment is JUST "AXE <strategy>" —
 * deliberately NOT mixed with side/confidence, because the Scorecard's
 * by-strategy breakdown groups trades by exact comment string. Confidence
 * varying per trade would turn every single trade into its own group of
 * one, defeating the whole point of a "by strategy" rollup.
 */
/**
 * The tag that survives the round trip to the broker and back.
 *
 * MT5 caps a comment at 31 characters, and MetaAPI echoes it on the closing
 * deal — which makes it the only channel by which a decision's identity reaches
 * the ledger when a position closes at the broker on SL/TP, without AXE
 * involved at all. "AXE volumetric-ob h4" is 20, so the timeframe fits with
 * room to spare, and it has to be here: the algo now chooses the timeframe per
 * pair, so a trade that comes back without one cannot teach anything about the
 * choice that produced it.
 */
function tradeComment(side: DemoSide, confidence: number, strategy?: string, timeframe?: string): string {
  const tf = timeframe ? ` ${timeframe}` : '';
  if (strategy) return `AXE ${strategy}${tf}`.slice(0, 31);
  return `AXE ${side[0]}${Math.round(confidence * 100)}${tf}`.slice(0, 31);
}

/** Unified order path: MetaAPI MT5 when configured, else internal paper */
export async function brokerPlaceOrder(input: {
  symbol: string;
  side: DemoSide;
  qty: number;
  reason: string;
  confidence: number;
  intelReportId?: string;
  stopLoss?: number | null;
  takeProfit?: number | null;
  strategy?: string;
  /** Which timeframe the decision was taken on — rides along in the comment. */
  timeframe?: string;
  /** Place on THIS account. Defaults to the active one. */
  account?: MetaApiConfig;
}): Promise<{ ok: boolean; tradeId?: string; error?: string; price?: number; venue?: string }> {
  const snap = await fetchMarketSnapshot(input.symbol);
  await markPositions({ [input.symbol.toUpperCase()]: snap.last });

  const meta = input.account ?? await getMetaApiConfig();
  if (meta?.enabled && meta.token && meta.accountId) {
    const lots = qtyToLots(input.symbol, input.qty, snap.last);
    const placed = await metaApiMarketOrder({
      account: meta,
      symbol: input.symbol,
      side: input.side,
      volume: lots,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      comment: tradeComment(input.side, input.confidence, input.strategy, input.timeframe),
    });
    if (!placed.ok) {
      return { ok: false, error: placed.error, price: snap.last, venue: 'metaapi' };
    }
    // Count it against today the instant it lands, before it can reach
    // history-deals — this is what stops a second, near-simultaneous decision
    // from reading a broker count that doesn't yet include this fill and firing
    // over the cap. See dayLimitState / placedTodayInProcess.
    notePlacedToday(meta.accountId);
    // Mirror into local book for UI continuity. stopLoss/takeProfit and the
    // account this actually landed on ride along so the trades-table row
    // this mirror writes describes the real order, not a paper fill with no
    // risk levels and no account attached to it.
    const mirror = await executeDemoTrade({
      symbol: input.symbol,
      side: input.side,
      qty: input.qty,
      price: snap.last,
      reason: `[MetaAPI ${placed.orderId || 'ok'}] ${input.reason}`.slice(0, 500),
      confidence: input.confidence,
      intelReportId: input.intelReportId,
      strategy: input.strategy,
      timeframe: input.timeframe,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      accountId: meta.accountId,
      accountLabel: await accountLabel(meta.accountId).catch(() => meta.accountId),
      venue: 'metaapi',
    });
    const tradeId =
      ('trade' in mirror ? mirror.trade.id : undefined) || placed.orderId || `meta-${Date.now()}`;
    return { ok: true, tradeId, price: snap.last, venue: 'metaapi' };
  }

  const conn = await getBrokerConnection();
  if (conn.kind === 'krypt') {
    return {
      ok: false,
      error: 'Krypt.cc not wired yet — use Paper or MetaAPI MT5.',
      price: snap.last,
    };
  }

  // No broker, no fill. This used to place a simulated trade and return
  // ok:true, so every caller -- including the autonomous cycle -- believed an
  // order had gone to market. The agent then learned from outcomes that never
  // happened. A refusal is the honest answer.
  return {
    ok: false,
    error: 'No live broker connected — connect MT5 via MetaAPI to place orders.',
    price: snap.last,
  };
}

/** Pending (limit/stop) order path — MetaAPI only, no paper equivalent (paper book has no resting-order book). */
export async function brokerPlacePendingOrder(input: {
  symbol: string;
  type: PendingOrderType;
  qty: number;
  openPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  slippagePoints?: number;
  reason: string;
  confidence: number;
}): Promise<{ ok: boolean; orderId?: string; error?: string; venue?: string }> {
  const meta = await getMetaApiConfig();
  if (!(meta?.enabled && meta.token && meta.accountId)) {
    return {
      ok: false,
      error: 'Pending orders need MetaAPI (connect MT5 in Agent tab) — the paper book only fills at market.',
    };
  }
  const snap = await fetchMarketSnapshot(input.symbol);
  const lots = qtyToLots(input.symbol, input.qty, input.openPrice || snap.last);
  const placed = await metaApiPendingOrder({
    symbol: input.symbol,
    type: input.type,
    volume: lots,
    openPrice: input.openPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    slippagePoints: input.slippagePoints,
    comment: `AXE ${input.type} c${Math.round(input.confidence * 100)}`,
  });
  if (!placed.ok) return { ok: false, error: placed.error, venue: 'metaapi' };
  return { ok: true, orderId: placed.orderId, venue: 'metaapi' };
}

export async function brokerAccountSummary(): Promise<{
  kind: BrokerKind;
  cash: number;
  equity: number;
  positions: number;
  metaStatus?: string;
}> {
  const conn = await getBrokerConnection();
  const acc = await getDemoAccount();
  const eq =
    acc.cash +
    acc.positions.reduce((s, p) => s + p.qty * (p.markPrice ?? p.avgPrice), 0);

  let metaStatus: string | undefined;
  const meta = await getMetaApiConfig();
  if (meta?.enabled) {
    const probe = await metaApiGetAccount();
    metaStatus = probe.ok
      ? `MetaAPI OK · ${probe.account.connectionStatus || probe.account.name || 'account'}`
      : `MetaAPI: ${probe.error}`;
  }

  return {
    kind: conn.kind,
    cash: acc.cash,
    equity: eq,
    positions: acc.positions.length,
    metaStatus,
  };
}
