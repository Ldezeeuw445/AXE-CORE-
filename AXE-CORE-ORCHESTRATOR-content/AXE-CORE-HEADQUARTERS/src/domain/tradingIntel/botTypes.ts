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
  // Was previously only set for funded modes, so personal_demo had no
  // drawdown circuit breaker at all — a global equity-drawdown backstop is
  // exactly the thing you want even (especially) on a "just testing" account.
  maxDrawdownPct: 0.12,
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
  // 'desk' comes from the Mac Mini's trading branch: a step for what the
  // Intel and Companion lanes read for this symbol this cycle. It is a
  // separate phase rather than folded into 'intel' because the two lanes can
  // disagree, and a cycle where they did is worth being able to see.
  phase: 'data' | 'intel' | 'desk' | 'memory' | 'risk' | 'score' | 'size' | 'execute' | 'learn';
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
  /** Which strategy made this call, and on which timeframe.
   *
   * The trace recorded neither, which meant nothing downstream could say WHO
   * decided — the phone widget showed "DJ30 SELL 71%" with no way to tell
   * whether that came from AXE's own volumetric-ob or from a framework the
   * ledger had just promoted. Now that the ledger is keyed
   * (pair x strategy x timeframe) and every strategy has a colour, that is
   * the one missing piece of the attribution chain. Optional because traces
   * written before this carry neither. */
  strategy?: string;
  timeframe?: string;
}

/** One closed trade's outcome, kept only for the rolling learning window. */
export interface LearningOutcome {
  pnl: number;
  win: boolean;
  symbol: string;
  closedAt: string;
}

export interface AgentLearningStats {
  /** All-time — for display only, never fed back into sizing/selectivity. */
  tradesClosed: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Adaptive confidence floor. Recomputed fresh from the rolling window
   *  each close (not incrementally nudged) — see tradingLearningService. */
  learnedMinConfidence: number;
  /** Mirrors the same rolling-window signal as learnedMinConfidence, kept
   *  for display/back-compat. No longer added into the score in
   *  tradingAgentEngine — see recomputeLearningKnobs' doc comment for why. */
  aggressiveness: number;
  /** Last N closed trades — the sample the knobs above are computed from. */
  recentOutcomes: LearningOutcome[];
  lastLesson?: string;
  updatedAt: string;
}

/** Equity-drawdown circuit breaker. Independent of the learning knobs above
 *  — this is a hard stop that doesn't care why the drawdown happened. */
export interface CircuitBreakerState {
  peakEquity: number;
  tripped: boolean;
  trippedAt?: string;
  trippedReason?: string;
  updatedAt: string;
  /** Which equity source the current peak was measured against. A source
   *  flip (e.g. MetaAPI disconnecting mid-session, or connecting for the
   *  first time) resets the peak instead of comparing across it — paper
   *  and live equity are different numbers and a switch must never read
   *  as a drawdown. */
  equitySource?: 'paper' | 'live';
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
