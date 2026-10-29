/**
 * Pluggable strategy contract for the Trading Team Scout.
 * Strategies emit setup proposals; they never place orders themselves.
 */

export type StrategySide = 'buy' | 'sell';

export type FilterMode = 'all' | 'n-of-m' | 'weighted';

export interface StrategyBar {
  time: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StrategyFilterResult {
  id: string;
  enabled: boolean;
  ok: boolean;
  detail: string;
  weight?: number;
}

export interface StrategySignal {
  strategyId: string;
  symbol: string;
  side: StrategySide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  /** Reward / risk; Gold ORB default is 0.5 */
  riskReward: number;
  orbHigh: number;
  orbLow: number;
  sessionDateNy: string; // YYYY-MM-DD in America/New_York
  filters: StrategyFilterResult[];
  filterMode: FilterMode;
  notes: string[];
}

export interface StrategyEvaluation {
  strategyId: string;
  status: 'signal' | 'no-setup' | 'filtered' | 'outside-window' | 'no-data' | 'error';
  signal: StrategySignal | null;
  notes: string[];
}

export interface StrategyModule {
  id: string;
  label: string;
  symbols: string[];
  timeframe: string;
  /** Live/scout evaluation over recent bars (newest last). */
  evaluate(bars: StrategyBar[], nowIso?: string): StrategyEvaluation;
}
