/**
 * Professional trading-bot domain types.
 * Paper / demo first; live brokers plug in via connectors.
 */

export type RiskMode = 'personal_demo' | 'funded_challenge' | 'funded_live_rules';

export type BrokerKind = 'paper_live_prices' | 'mt5_demo' | 'krypt' | 'none';

/** Configurable risk — user controls personal; funded modes enforce prop-style caps */
export interface RiskProfile {
  mode: RiskMode;
  /** Max risk per trade as fraction of equity (e.g. 0.01 = 1%) */
  riskPerTradePct: number;
  /** Max open risk across positions */
  maxOpenRiskPct: number;
  /** Daily loss halt (fraction of start-of-day equity) */
  maxDailyLossPct: number;
  /** Max trades per day */
  maxTradesPerDay: number;
  /** Minimum agent confidence to allow a fill */
  minConfidence: number;
  /** Allow short / sell without existing long (v1 paper: false) */
  allowShort: boolean;
  /** Funded: max total drawdown from peak equity */
  maxDrawdownPct?: number;
  /** Funded: profit target before scaling (challenge) */
  profitTargetPct?: number;
  updatedAt: string;
}

export const DEFAULT_PERSONAL_RISK: Omit<RiskProfile, 'updatedAt'> = {
  mode: 'personal_demo',
  riskPerTradePct: 0.02,
  maxOpenRiskPct: 0.06,
  maxDailyLossPct: 0.05,
  maxTradesPerDay: 20,
  minConfidence: 0.58,
  allowShort: false,
};

export const DEFAULT_FUNDED_RISK: Omit<RiskProfile, 'updatedAt'> = {
  mode: 'funded_challenge',
  riskPerTradePct: 0.005,
  maxOpenRiskPct: 0.015,
  maxDailyLossPct: 0.03,
  maxTradesPerDay: 8,
  minConfidence: 0.65,
  allowShort: false,
  maxDrawdownPct: 0.08,
  profitTargetPct: 0.1,
};

export interface DecisionStep {
  id: string;
  phase: 'data' | 'intel' | 'memory' | 'risk' | 'score' | 'size' | 'execute' | 'learn';
  title: string;
  detail: string;
  weight?: number;
}

export interface ThinkingTrace {
  decisionId: string;
  symbol: string;
  steps: DecisionStep[];
  finalAction: string;
  confidence: number;
  blockedByRisk?: string;
  createdAt: string;
}

export interface AgentLearningStats {
  tradesClosed: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Adaptive confidence floor learned from outcomes */
  learnedMinConfidence: number;
  /** Bias adjustment -0.2..0.2 from recent P&amp;L */
  aggressiveness: number;
  lastLesson?: string;
  updatedAt: string;
}

export interface BrokerConnection {
  kind: BrokerKind;
  label: string;
  connected: boolean;
  /** Non-secret endpoint / account id only — never store passwords in plain UI state long-term */
  accountId?: string;
  server?: string;
  notes?: string;
  updatedAt: string;
}

export const TRADING_BOT_PLAN = {
  phase1: 'Paper account + live public prices + research intel + decision journal (current)',
  phase2: 'Self-improving thresholds from closed trade outcomes + funded risk modes',
  phase3: 'MT5 demo bridge (MetaAPI / local EA) + Krypt.cc settings API when credentials exist',
  phase4: 'Optional live with hard kill-switch and separate approval gate',
} as const;
