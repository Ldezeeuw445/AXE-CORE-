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
  equity as paperEquity,
} from '@/infrastructure/persistence/demoTradingService';
import type { DemoSide } from '@/domain/tradingIntel/demoTypes';
import {
  getMetaApiConfig,
  metaApiGetAccount,
  metaApiMarketOrder,
  metaApiPendingOrder,
  metaApiAccountInfoFor,
  metaApiPositionsFor,
  qtyToLots,
  toMt5Symbol,
  type PendingOrderType,
  type MetaApiConfig,
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
    console.warn(`[brokerConnector] MetaAPI account/positions fetch failed for ${symbol}; refusing to size this cycle`);
    return unavailable('Live account unreadable — MetaAPI fetch failed');
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

export async function getBrokerConnection(): Promise<BrokerConnection> {
  // Prefer MetaAPI when enabled + configured
  const meta = await getMetaApiConfig();
  if (meta?.enabled && meta.token && meta.accountId) {
    return {
      kind: 'mt5_demo',
      label: 'MT5 via MetaAPI',
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
    // Mirror into local book for UI continuity
    const mirror = await executeDemoTrade({
      symbol: input.symbol,
      side: input.side,
      qty: input.qty,
      price: snap.last,
      reason: `[MetaAPI ${placed.orderId || 'ok'}] ${input.reason}`.slice(0, 500),
      confidence: input.confidence,
      intelReportId: input.intelReportId,
      strategy: input.strategy,
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
