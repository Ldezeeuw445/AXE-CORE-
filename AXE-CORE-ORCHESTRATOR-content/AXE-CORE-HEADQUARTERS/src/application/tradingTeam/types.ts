/**
 * AXE Trading Team (TEST) — shared types for the 6-bot pipeline.
 * Flow: Scout → (News | Sentiment | Charts) → Risk → Decision.
 * Spec: /workspace/trading-team/SETUP.md. Demo-only via account allowlist.
 */

export type TradingTeamVerdict = 'GO' | 'WAIT' | 'NO-GO' | 'BLOCKED';
export type TradingTeamSide = 'buy' | 'sell';
export type TradingTeamRunStatus = 'running' | 'completed' | 'blocked' | 'error';
export type AccountGuardStatus = 'pending' | 'allowed' | 'rejected';

export interface StrategySignalPayload {
  strategyId: string;
  side: TradingTeamSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  orbHigh?: number;
  orbLow?: number;
  sessionDateNy?: string;
  lots?: number;
  filterSummary?: string;
  notes?: string[];
}

export interface ScoutCandidate {
  symbol: string;
  reason: string;
  edgeHint?: string;
  score: number;
  /** Pluggable strategy id when Scout promoted a concrete setup (e.g. gold-orb-1am-ny). */
  strategyId?: string;
  strategySignal?: StrategySignalPayload;
}

export interface ScoutResult {
  scannedAt: string;
  watchlist: string[];
  candidates: ScoutCandidate[];
  notes: string[];
}

export interface NewsResult {
  symbol: string;
  headlines: Array<{ title: string; source?: string; publishedAt?: string }>;
  highImpactWithin2h: boolean;
  events: Array<{ name: string; date: string; within2h: boolean }>;
  notes: string[];
}

export interface SentimentResult {
  symbol: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number; // 0–100
  notes: string[];
}

export interface ChartsResult {
  symbol: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  structureOk: boolean;
  notes: string[];
}

export interface RiskResult {
  ok: boolean;
  blockedReasons: string[];
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  suggestedLots?: number;
}

export interface TradeProposal {
  symbol: string;
  side: TradingTeamSide;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  lots?: number;
  rationale: string;
}

export interface DecisionResult {
  verdict: TradingTeamVerdict;
  confidence: number;
  proposal: TradeProposal | null;
  summary: string;
  notes: string[];
}

export interface AccountGuardSnapshot {
  status: AccountGuardStatus;
  reason: string;
  accountId: string | null;
  accountLabel: string | null;
  companionBrokerAccountId: string | null;
  metaApiRegion?: string | null;
}

export interface TradingTeamCycleResult {
  cycleId: string;
  status: TradingTeamRunStatus;
  guard: AccountGuardSnapshot;
  scout: ScoutResult;
  news: NewsResult | null;
  sentiment: SentimentResult | null;
  charts: ChartsResult | null;
  risk: RiskResult | null;
  decision: DecisionResult;
  execution: Record<string, unknown>;
  error?: string | null;
  runRowId?: string | null;
}

export interface TradingTeamRunRow {
  id: string;
  created_at: string;
  updated_at: string;
  cycle_id: string;
  status: string;
  mode: string;
  account_id: string | null;
  account_label: string | null;
  companion_broker_account_id: string | null;
  account_guard: string;
  account_guard_reason: string | null;
  scout: ScoutResult;
  news: NewsResult | Record<string, unknown>;
  sentiment: SentimentResult | Record<string, unknown>;
  charts: ChartsResult | Record<string, unknown>;
  risk: RiskResult | Record<string, unknown>;
  decision: DecisionResult | Record<string, unknown>;
  verdict: string | null;
  confidence: number | null;
  symbol: string | null;
  side: string | null;
  proposal: TradeProposal | Record<string, unknown>;
  execution: Record<string, unknown>;
  error: string | null;
}
