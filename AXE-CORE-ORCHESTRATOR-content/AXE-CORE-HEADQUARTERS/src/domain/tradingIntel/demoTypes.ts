/** Demo trading + agent memory domain types for AXE CORE Trading Desk. */

export type DemoSide = 'buy' | 'sell';
export type DemoOrderStatus = 'filled' | 'cancelled' | 'rejected';

export interface DemoPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
  /** Mark from last market snapshot */
  markPrice?: number;
  updatedAt: string;
}

export interface DemoTrade {
  id: string;
  symbol: string;
  side: DemoSide;
  qty: number;
  price: number;
  notional: number;
  status: DemoOrderStatus;
  reason: string;
  intelReportId?: string;
  /** Agent confidence 0–1 at decision time */
  confidence: number;
  /** Which strategy (STRATEGIES catalog id) was active when this fired —
   *  dedicated field, not parsed out of `reason`, so the Scorecard's
   *  per-strategy/per-pair breakdown has something exact to group on. */
  strategy?: string;
  createdAt: string;
}

export interface DemoAccount {
  cash: number;
  currency: string;
  positions: DemoPosition[];
  trades: DemoTrade[];
  startedAt: string;
  updatedAt: string;
}

export interface OhlcBar {
  t: number; // unix ms
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface MarketSnapshot {
  symbol: string;
  source: string;
  bars: OhlcBar[];
  last: number;
  changePct?: number;
  fetchedAt: string;
}

export interface TradingAgentDecision {
  id: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'close';
  qty?: number;
  confidence: number;
  rationale: string;
  inputs: {
    lastPrice?: number;
    signal?: string;
    intelId?: string;
    memoryKeys: string[];
  };
  executedTradeId?: string;
  createdAt: string;
}

export const TRADING_AGENT_ID = 'axe_trading_agent';
export const DEMO_START_CASH = 100_000;
