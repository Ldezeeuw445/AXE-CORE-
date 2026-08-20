/**
 * Self-improvement stats for the trading agent.
 *
 * IMPORTANT HISTORY: recordTradeOutcome() previously nudged learnedMinConfidence
 * and aggressiveness by a fixed +/- amount on every single trade close, in the
 * direction of that one trade (win -> looser bar + higher score bias, loss ->
 * tighter + lower). Nothing in the codebase actually called it, so it never
 * ran — but had it run, it's the textbook mechanism by which "profitable"
 * systems blow up: a short lucky streak (easily 5 wins on a coin-flip
 * strategy) would max out looseness and confidence right when the agent
 * should be MOST skeptical, not least. It was also symmetric per-trade with
 * no sample-size floor, so trade #1 could swing it as hard as trade #100.
 *
 * This version instead: (1) requires MIN_SAMPLE closed trades before the
 * knobs move at all, (2) recomputes them fresh from a bounded rolling
 * window's win rate each time — not an incremental walk — so a stale streak
 * ages out and can't compound indefinitely, (3) is called from
 * demoTradingService.executeDemoTrade on every realized close, so it
 * actually runs now.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { AgentLearningStats, LearningOutcome, ThinkingTrace } from '@/domain/tradingIntel/botTypes';
import { rememberLesson } from '@/infrastructure/persistence/tradingAgentMemoryService';
import { recordOutcome } from '@/infrastructure/persistence/tradingAgentBrain';
import { recordLedgerTrade } from '@/infrastructure/persistence/tradingLedgerService';

const STATS_KEY = 'axe_trading_agent_learning';
const TRACE_KEY = 'axe_trading_decision_traces';

/** Closed trades needed before the knobs move off their neutral defaults. */
const MIN_SAMPLE = 15;
/** Rolling window size — old trades age out instead of compounding forever. */
const WINDOW_SIZE = 30;

const NEUTRAL_MIN_CONFIDENCE = 0.58;
const MIN_CONFIDENCE_FLOOR = 0.5;
const MIN_CONFIDENCE_CEILING = 0.85;
const AGGRESSIVENESS_BOUND = 0.2;

function defaultStats(): AgentLearningStats {
  return {
    tradesClosed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    learnedMinConfidence: NEUTRAL_MIN_CONFIDENCE,
    aggressiveness: 0,
    recentOutcomes: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getLearningStats(): Promise<AgentLearningStats> {
  const cloud = await loadSetting<AgentLearningStats | null>(STATS_KEY, null);
  if (cloud && typeof cloud.tradesClosed === 'number') {
    // Migrate stats saved before recentOutcomes existed.
    if (!Array.isArray(cloud.recentOutcomes)) cloud.recentOutcomes = [];
    return cloud;
  }
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AgentLearningStats;
      if (!Array.isArray(parsed.recentOutcomes)) parsed.recentOutcomes = [];
      return parsed;
    }
  } catch { /* ignore */ }
  return defaultStats();
}

async function saveStats(s: AgentLearningStats): Promise<void> {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
  void saveSetting(STATS_KEY, s);
}

/**
 * Recomputes learnedMinConfidence + aggressiveness from the rolling window,
 * given enough samples. Pure function of the window, not the previous value
 * — so a stale streak can't compound and a fresh window with no edge decays
 * straight back to neutral instead of staying stuck wherever the last streak
 * left it.
 */
function recomputeLearningKnobs(recentOutcomes: LearningOutcome[]): { learnedMinConfidence: number; aggressiveness: number } {
  if (recentOutcomes.length < MIN_SAMPLE) {
    return { learnedMinConfidence: NEUTRAL_MIN_CONFIDENCE, aggressiveness: 0 };
  }
  const window = recentOutcomes.slice(0, WINDOW_SIZE);
  const winRate = window.filter(o => o.win).length / window.length;
  // -0.5..0.5, positive = trailing edge above breakeven
  const edge = winRate - 0.5;

  const learnedMinConfidence = Math.min(
    MIN_CONFIDENCE_CEILING,
    Math.max(MIN_CONFIDENCE_FLOOR, NEUTRAL_MIN_CONFIDENCE - edge * 0.3),
  );
  const aggressiveness = Math.min(AGGRESSIVENESS_BOUND, Math.max(-AGGRESSIVENESS_BOUND, edge * 0.4));
  return { learnedMinConfidence, aggressiveness };
}

/** Call when a position is closed with realized PnL. */
export async function recordTradeOutcome(input: {
  symbol: string;
  pnl: number;
  confidence: number;
  /** Links the close back to the decision that opened it, when known. */
  tradeId?: string;
  holdingMinutes?: number;
  exitReason?: string;
  /** Which strategy produced this trade — attributes the outcome to the right
   *  (pair × strategy) bucket in the ledger so the agent learns what works where. */
  strategy?: string;
  /** Which timeframe the decision was taken on — the third dimension the
   *  ledger learns over, alongside pair and strategy. */
  timeframe?: string;
  /** Realized return as a fraction of the account (e.g. +0.012). When omitted
   *  the ledger can't record a per-trade edge, only a win/loss count. */
  returnPct?: number;
}): Promise<AgentLearningStats> {
  const s = await getLearningStats();
  s.tradesClosed += 1;
  const win = input.pnl > 0;
  if (win) s.wins += 1;
  else if (input.pnl < 0) s.losses += 1;
  s.winRate = s.tradesClosed > 0 ? s.wins / s.tradesClosed : 0;

  const outcome: LearningOutcome = { pnl: input.pnl, win, symbol: input.symbol, closedAt: new Date().toISOString() };
  s.recentOutcomes = [outcome, ...s.recentOutcomes].slice(0, WINDOW_SIZE);

  const before = { learnedMinConfidence: s.learnedMinConfidence, aggressiveness: s.aggressiveness };
  const { learnedMinConfidence, aggressiveness } = recomputeLearningKnobs(s.recentOutcomes);
  s.learnedMinConfidence = learnedMinConfidence;
  s.aggressiveness = aggressiveness;

  if (s.recentOutcomes.length < MIN_SAMPLE) {
    s.lastLesson = `${win ? 'Win' : input.pnl < 0 ? 'Loss' : 'Breakeven'} on ${input.symbol} (pnl ${input.pnl.toFixed(2)}) — ${s.recentOutcomes.length}/${MIN_SAMPLE} closed trades so far, not enough yet to adapt confidence.`;
  } else {
    const window = s.recentOutcomes.slice(0, WINDOW_SIZE);
    const rollingWinRate = window.filter(o => o.win).length / window.length;
    s.lastLesson = `${win ? 'Win' : input.pnl < 0 ? 'Loss' : 'Breakeven'} on ${input.symbol} (pnl ${input.pnl.toFixed(2)}) — trailing ${window.length}-trade win rate ${(rollingWinRate * 100).toFixed(0)}%, min-confidence ${before.learnedMinConfidence.toFixed(2)} -> ${learnedMinConfidence.toFixed(2)}.`;
  }
  s.updatedAt = new Date().toISOString();
  await saveStats(s);
  if (s.lastLesson) await rememberLesson(input.symbol, s.lastLesson, 0.8);

  // File the close in the brain's win/loss lane too. The stats above are a
  // running tally and cannot answer "what did I get wrong on this symbol" —
  // the per-trade record can.
  await recordOutcome({
    tradeId: input.tradeId ?? `${input.symbol}-${Date.now()}`,
    symbol: input.symbol,
    pnl: input.pnl,
    holdingMinutes: input.holdingMinutes,
    exitReason: input.exitReason,
    closedAt: new Date().toISOString(),
  });

  // Per-(pair × strategy) ledger — the structured "what works where" record.
  // Falls back to a win/loss-only count when returnPct wasn't supplied.
  const returnPct = typeof input.returnPct === 'number'
    ? input.returnPct
    : (win ? 0.001 : input.pnl < 0 ? -0.001 : 0);
  void recordLedgerTrade({ pair: input.symbol, strategy: input.strategy, timeframe: input.timeframe, returnPct }).catch(() => { /* non-fatal */ });

  return s;
}

export async function saveThinkingTrace(trace: ThinkingTrace): Promise<void> {
  let parsed: ThinkingTrace[] = [];
  try {
    parsed = JSON.parse(localStorage.getItem(TRACE_KEY) || '[]');
  } catch { /* keep empty default */ }
  const list = [trace, ...parsed].slice(0, 50);
  localStorage.setItem(TRACE_KEY, JSON.stringify(list));
  void saveSetting(TRACE_KEY, list);
}

export async function listThinkingTraces(limit = 20): Promise<ThinkingTrace[]> {
  const cloud = await loadSetting<ThinkingTrace[]>(TRACE_KEY, []);
  if (Array.isArray(cloud) && cloud.length) return cloud.slice(0, limit);
  try {
    const list = JSON.parse(localStorage.getItem(TRACE_KEY) || '[]') as ThinkingTrace[];
    return list.slice(0, limit);
  } catch {
    return [];
  }
}
