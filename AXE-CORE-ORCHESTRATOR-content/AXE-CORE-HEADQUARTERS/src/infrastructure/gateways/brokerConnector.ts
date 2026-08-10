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
import type { DemoSide } from '@/domain/tradingIntel/demoTypes';
import {
  getMetaApiConfig,
  metaApiGetAccount,
  metaApiMarketOrder,
  metaApiPendingOrder,
  qtyToLots,
  type PendingOrderType,
} from '@/infrastructure/gateways/metaApiService';

const KEY = 'axe_broker_connection';

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

/** Unified order path: MetaAPI MT5 when configured, else internal paper */
export async function brokerPlaceOrder(input: {
  symbol: string;
  side: DemoSide;
  qty: number;
  reason: string;
  confidence: number;
  intelReportId?: string;
}): Promise<{ ok: boolean; tradeId?: string; error?: string; price?: number; venue?: string }> {
  const snap = await fetchMarketSnapshot(input.symbol);
  await markPositions({ [input.symbol.toUpperCase()]: snap.last });

  const meta = await getMetaApiConfig();
  if (meta?.enabled && meta.token && meta.accountId) {
    const lots = qtyToLots(input.symbol, input.qty, snap.last);
    const placed = await metaApiMarketOrder({
      symbol: input.symbol,
      side: input.side,
      volume: lots,
      comment: `AXE ${input.side} c${Math.round(input.confidence * 100)}`,
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

  const result = await executeDemoTrade({
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    price: snap.last,
    reason: input.reason,
    confidence: input.confidence,
    intelReportId: input.intelReportId,
  });
  if ('error' in result) return { ok: false, error: result.error, price: snap.last, venue: 'paper' };
  return { ok: true, tradeId: result.trade.id, price: snap.last, venue: 'paper' };
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
