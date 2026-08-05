/** Self-improvement stats for the trading agent. */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { AgentLearningStats, ThinkingTrace } from '@/domain/tradingIntel/botTypes';
import { rememberLesson } from '@/infrastructure/persistence/tradingAgentMemoryService';
import { recordOutcome } from '@/infrastructure/persistence/tradingAgentBrain';

const STATS_KEY = 'axe_trading_agent_learning';
const TRACE_KEY = 'axe_trading_decision_traces';

function defaultStats(): AgentLearningStats {
  return {
    tradesClosed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    learnedMinConfidence: 0.58,
    aggressiveness: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function getLearningStats(): Promise<AgentLearningStats> {
  const cloud = await loadSetting<AgentLearningStats | null>(STATS_KEY, null);
  if (cloud && typeof cloud.tradesClosed === 'number') return cloud;
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as AgentLearningStats;
  } catch { /* ignore */ }
  return defaultStats();
}

async function saveStats(s: AgentLearningStats): Promise<void> {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
  void saveSetting(STATS_KEY, s);
}

/** Call when a position is closed with realized PnL */
export async function recordTradeOutcome(input: {
  symbol: string;
  pnl: number;
  confidence: number;
  /** Links the close back to the decision that opened it, when known. */
  tradeId?: string;
  holdingMinutes?: number;
  exitReason?: string;
}): Promise<AgentLearningStats> {
  const s = await getLearningStats();
  s.tradesClosed += 1;
  if (input.pnl > 0) s.wins += 1;
  else if (input.pnl < 0) s.losses += 1;
  s.winRate = s.tradesClosed > 0 ? s.wins / s.tradesClosed : 0;

  // Self-improve: raise confidence floor after losses, loosen slightly after wins
  if (input.pnl < 0) {
    s.learnedMinConfidence = Math.min(0.85, s.learnedMinConfidence + 0.02);
    s.aggressiveness = Math.max(-0.2, s.aggressiveness - 0.03);
    s.lastLesson = `Loss on ${input.symbol} (pnl ${input.pnl.toFixed(2)}) — raised min confidence to ${s.learnedMinConfidence.toFixed(2)}`;
  } else if (input.pnl > 0) {
    s.learnedMinConfidence = Math.max(0.5, s.learnedMinConfidence - 0.01);
    s.aggressiveness = Math.min(0.2, s.aggressiveness + 0.02);
    s.lastLesson = `Win on ${input.symbol} (pnl ${input.pnl.toFixed(2)}) — slightly more room to trade`;
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
  return s;
}

export async function saveThinkingTrace(trace: ThinkingTrace): Promise<void> {
  let list: ThinkingTrace[] = [];
  try {
    list = JSON.parse(localStorage.getItem(TRACE_KEY) || '[]');
  } catch { list = []; }
  list = [trace, ...list].slice(0, 50);
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
