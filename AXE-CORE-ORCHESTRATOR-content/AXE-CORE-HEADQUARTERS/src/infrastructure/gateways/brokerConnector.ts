/**
 * Broker connector layer — paper with live prices now;
 * MT5 demo + Krypt.cc are typed stubs until credentials/API exist.
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

const KEY = 'axe_broker_connection';

export async function getBrokerConnection(): Promise<BrokerConnection> {
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
    notes: 'Default AXE demo book. Prices from Binance/Stooq public APIs.',
  };
}

export async function setBrokerConnection(conn: BrokerConnection): Promise<BrokerConnection> {
  const next = { ...conn, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(next));
  void saveSetting(KEY, next);
  return next;
}

export async function connectBrokerKind(kind: BrokerKind, meta?: { accountId?: string; server?: string; notes?: string }): Promise<BrokerConnection> {
  if (kind === 'mt5_demo') {
    return setBrokerConnection({
      kind,
      label: 'MT5 Demo (bridge pending)',
      connected: false,
      accountId: meta?.accountId,
      server: meta?.server,
      notes:
        meta?.notes ||
        'Wire via MetaAPI or local Expert Advisor. Not live until you add credentials + bridge on VPS.',
      updatedAt: new Date().toISOString(),
    });
  }
  if (kind === 'krypt') {
    return setBrokerConnection({
      kind,
      label: 'Krypt.cc (settings API pending)',
      connected: false,
      accountId: meta?.accountId,
      notes:
        meta?.notes ||
        'When Krypt exposes settings/trade API or session bridge, map risk + symbols here.',
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

/** Unified order path — only paper executes today */
export async function brokerPlaceOrder(input: {
  symbol: string;
  side: DemoSide;
  qty: number;
  reason: string;
  confidence: number;
  intelReportId?: string;
}): Promise<{ ok: boolean; tradeId?: string; error?: string; price?: number }> {
  const conn = await getBrokerConnection();

  if (conn.kind === 'mt5_demo' || conn.kind === 'krypt') {
    return {
      ok: false,
      error: `${conn.label} is registered but not wired yet — use Paper · live prices for demo fills.`,
    };
  }

  const snap = await fetchMarketSnapshot(input.symbol);
  await markPositions({ [input.symbol.toUpperCase()]: snap.last });
  const result = await executeDemoTrade({
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    price: snap.last,
    reason: input.reason,
    confidence: input.confidence,
    intelReportId: input.intelReportId,
  });
  if ('error' in result) return { ok: false, error: result.error, price: snap.last };
  return { ok: true, tradeId: result.trade.id, price: snap.last };
}

export async function brokerAccountSummary(): Promise<{
  kind: BrokerKind;
  cash: number;
  equity: number;
  positions: number;
}> {
  const conn = await getBrokerConnection();
  const acc = await getDemoAccount();
  const eq =
    acc.cash +
    acc.positions.reduce((s, p) => s + p.qty * (p.markPrice ?? p.avgPrice), 0);
  return {
    kind: conn.kind,
    cash: acc.cash,
    equity: eq,
    positions: acc.positions.length,
  };
}
