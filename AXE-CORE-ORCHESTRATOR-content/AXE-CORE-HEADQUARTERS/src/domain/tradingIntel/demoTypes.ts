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
  /**
   * What opened this, carried so the row can show it.
   *
   * The rule is that no trade renders without strategy, framework, timeframe,
   * side and pair — and a position that does not carry its strategy cannot
   * satisfy it. Optional because a position opened before this existed, or one
   * rebuilt from broker fills with a truncated comment, genuinely has none;
   * TradeBadge shows those as "untagged" rather than guessing.
   */
  strategy?: string;
  timeframe?: string;
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
  /** Which timeframe the decision was taken on — the fifth thing every trade
   *  row has to show. `strategy` below already carries the fourth. */
  timeframe?: string;
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
// Zero, not 100k. The local book still records real MetaAPI fills for UI
// continuity, but it must never hand out capital nobody deposited: a starting
// balance here showed up in Demo book as if it were an account, and fed every
// equity readout that had not yet been pointed at the live account.
export const DEMO_START_CASH = 0;
