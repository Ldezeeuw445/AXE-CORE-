/**
 * tradingAgentBrain — the agent's structured long-term memory.
 *
 * Deliberately still on `saveGlobalMemory` directly rather than
 * `memoryRecorder.recordEvent`: every write here carries rich, queryable
 * metadata (agent/ns/symbol/action/pnl/kind/pair — see below) that recall
 * filters on directly. recordEvent's stored metadata is a fixed
 * `{kind, summary}` shape with no passthrough for caller-supplied fields,
 * so routing these through it would silently break every ns-scoped/
 * symbol-scoped query in this file. This is the funnel's one real
 * exception, not an oversight — see memoryRecorder.ts's header for the
 * general split.
 *
 * `tradingAgentMemoryService` already writes decisions, lessons and open
 * theses into a flat `ta:<agent>:` lane. That is enough to *log* but not
 * enough to *learn from*: recall was "the last N entries", so a losing
 * pattern from three weeks ago carried the same weight as this morning's
 * noise, and nothing distinguished "I lost" from "I lost because I broke
 * my own rule".
 *
 * This module adds the namespaces that make the journal queryable:
 *
 *   trade       every decision + what was true when it was made
 *   win/loss    closed trades, split so outcome stats are a read not a scan
 *   mistake     process failures — rule broken, sized wrong, traded into news
 *   lesson      distilled rules the agent writes to itself after review
 *   intel       the crew research that was on the table at decision time
 *   correlation cross-asset relationships worth reusing
 *   thesis      current standing view per symbol
 *
 * The split between `loss` and `mistake` is the important one. A loss with
 * a sound process is the cost of doing business and should not change
 * behaviour; a mistake should. Collapsing them is how an agent teaches
 * itself to be timid instead of correct.
 */
import {
  saveGlobalMemory,
  loadGlobalMemories,
  type GlobalMemoryEntry,
} from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { TRADING_AGENT_ID } from '@/domain/tradingIntel/demoTypes';

export type BrainNamespace =
  | 'cycle'
  | 'win'
  | 'loss'
  | 'mistake'
  | 'lesson'
  | 'intel'
  | 'correlation'
  | 'thesis';

const PREFIX = `ta:${TRADING_AGENT_ID}:`;

function nsKey(ns: BrainNamespace, id: string): string {
  return `${PREFIX}${ns}:${id}`;
}

function stamp(): string {
  return new Date().toISOString();
}

/** Why a losing trade was (or wasn't) the agent's fault. */
export type MistakeKind =
  | 'rule_violation'      // acted against its own stated rule
  | 'sizing'              // position size inconsistent with risk profile
  | 'news_blindspot'      // opened into a scheduled high-impact release
  | 'stale_intel'         // acted on research that had already been invalidated
  | 'thesis_drift'        // held after the reason for the trade disappeared
  | 'execution';          // slippage/latency/wrong order type

export interface TradeRecord {
  id: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'close';
  qty?: number;
  confidence: number;
  rationale: string;
  /** What the agent could see — snapshotted so a later review is honest. */
  context: {
    lastPrice?: number;
    indicators?: Record<string, unknown>;
    intelIds?: string[];
    toolsUnavailable?: string[];
    upcomingHighImpact?: string[];
  };
  createdAt: string;
}

export interface OutcomeRecord {
  tradeId: string;
  symbol: string;
  pnl: number;
  holdingMinutes?: number;
  exitReason?: string;
  closedAt: string;
}

/* ── writes ──────────────────────────────────────────────────────────────── */

/**
 * Filed under the 'cycle' namespace — NOT 'trade' — on purpose. This runs
 * for every decision the loop makes, including holds and risk-blocked ones
 * (that's the whole point, see the module header), so a key that reads
 * "trade:<id>" for a HOLD is actively misleading: it reads like an
 * execution happened when nothing was placed. Real fills are tracked
 * separately via decision.executedTradeId (tradingAgentMemoryService).
 */
export async function recordTrade(t: TradeRecord): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: nsKey('cycle', t.id),
    value: JSON.stringify(t),
    confidence: t.confidence,
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: 'cycle', symbol: t.symbol, action: t.action },
  });
}

/**
 * Files a closed trade under win or loss.
 *
 * Deliberately does not judge process — that is `recordMistake`'s job, and
 * keeping them separate means "win rate" stays a measure of outcome while
 * "mistake rate" stays a measure of discipline.
 */
export async function recordOutcome(o: OutcomeRecord): Promise<'win' | 'loss' | 'flat'> {
  const bucket: 'win' | 'loss' | 'flat' = o.pnl > 0 ? 'win' : o.pnl < 0 ? 'loss' : 'flat';
  if (bucket !== 'flat') {
    await saveGlobalMemory({
      user_id: AXE_USER_ID,
      category: 'system_event',
      key: nsKey(bucket, o.tradeId),
      value: JSON.stringify(o),
      confidence: 1,
      metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: bucket, symbol: o.symbol, pnl: o.pnl },
    });
  }
  return bucket;
}

export async function recordMistake(input: {
  tradeId?: string;
  symbol: string;
  kind: MistakeKind;
  detail: string;
  /** What should have happened instead — this is what makes it reusable. */
  correction: string;
}): Promise<void> {
  const id = input.tradeId ?? `${input.symbol}-${Date.now()}`;
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: nsKey('mistake', id),
    value: JSON.stringify({ ...input, at: stamp() }),
    confidence: 1,
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: 'mistake', symbol: input.symbol, kind: input.kind },
  });
}

export async function recordLesson(input: {
  symbol?: string;
  rule: string;
  /** Evidence the rule is real — trade ids it was derived from. */
  derivedFrom: string[];
  confidence?: number;
}): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: nsKey('lesson', `${Date.now()}`),
    value: JSON.stringify({ ...input, at: stamp() }),
    confidence: input.confidence ?? 0.7,
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: 'lesson', symbol: input.symbol ?? 'ALL' },
  });
}

export async function recordIntelSnapshot(input: {
  symbol: string;
  cycleId?: string;
  signal?: string;
  thesis: string;
  hypotheses?: string[];
}): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: nsKey('intel', `${input.symbol}-${Date.now()}`),
    value: JSON.stringify({ ...input, at: stamp() }),
    confidence: 0.6,
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: 'intel', symbol: input.symbol },
  });
}

export async function recordCorrelation(input: {
  a: string;
  b: string;
  coefficient: number;
  window: string;
  note?: string;
}): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: nsKey('correlation', `${input.a}-${input.b}`),
    value: JSON.stringify({ ...input, at: stamp() }),
    confidence: Math.min(1, Math.abs(input.coefficient)),
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: 'correlation', pair: `${input.a}/${input.b}` },
  });
}

export async function recordThesis(symbol: string, thesis: string, confidence = 0.6): Promise<void> {
  await saveGlobalMemory({
    user_id: AXE_USER_ID,
    category: 'system_event',
    key: nsKey('thesis', symbol),
    value: JSON.stringify({ symbol, thesis, at: stamp() }),
    confidence,
    metadata: { agent: TRADING_AGENT_ID, agentId: 'axe_algo', ns: 'thesis', symbol },
  });
}

/* ── reads ───────────────────────────────────────────────────────────────── */

function parse<T>(e: GlobalMemoryEntry): T | null {
  try {
    return JSON.parse(e.value) as T;
  } catch {
    return null;
  }
}

/** All entries in one namespace, newest first. */
export async function readNamespace<T = unknown>(
  ns: BrainNamespace,
  opts: { symbol?: string; limit?: number } = {},
): Promise<T[]> {
  const all = await loadGlobalMemories(AXE_USER_ID, 'system_event', 400);
  const prefix = `${PREFIX}${ns}:`;
  return all
    .filter(e => e.key.startsWith(prefix))
    .filter(e => !opts.symbol || e.metadata?.symbol === opts.symbol || e.metadata?.symbol === 'ALL')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, opts.limit ?? 25)
    .map(e => parse<T>(e))
    .filter((v): v is T => v !== null);
}

export interface BrainStats {
  trades: number;
  wins: number;
  losses: number;
  mistakes: number;
  lessons: number;
  winRate: number;
  /** Share of losses that were process failures rather than bad luck. */
  mistakeRate: number;
  byMistakeKind: Record<string, number>;
}

export async function brainStats(): Promise<BrainStats> {
  const all = await loadGlobalMemories(AXE_USER_ID, 'system_event', 600);
  const count = (ns: BrainNamespace) =>
    all.filter(e => e.key.startsWith(`${PREFIX}${ns}:`)).length;

  const trades = count('cycle');
  const wins = count('win');
  const losses = count('loss');
  const mistakes = count('mistake');
  const lessons = count('lesson');

  const byMistakeKind: Record<string, number> = {};
  all
    .filter(e => e.key.startsWith(`${PREFIX}mistake:`))
    .forEach(e => {
      const kind = String(e.metadata?.kind ?? 'unknown');
      byMistakeKind[kind] = (byMistakeKind[kind] ?? 0) + 1;
    });

  const closed = wins + losses;
  return {
    trades,
    wins,
    losses,
    mistakes,
    lessons,
    winRate: closed > 0 ? wins / closed : 0,
    mistakeRate: losses > 0 ? Math.min(1, mistakes / losses) : 0,
    byMistakeKind,
  };
}

/**
 * The block handed to the model on every decision cycle.
 *
 * Ordered deliberately: rules first (they constrain everything after),
 * then the standing view, then evidence. Recent losses and mistakes are
 * included in full because they are the highest-signal part of the
 * history — wins are summarised, since "it worked" rarely explains why.
 */
export async function buildBrainContext(symbol: string): Promise<string> {
  const [lessons, mistakes, losses, thesis, correlations, stats] = await Promise.all([
    readNamespace<{ rule: string; symbol?: string }>('lesson', { limit: 12 }),
    readNamespace<{ kind: string; detail: string; correction: string; symbol: string }>('mistake', { limit: 8 }),
    readNamespace<{ symbol: string; pnl: number; exitReason?: string }>('loss', { symbol, limit: 5 }),
    readNamespace<{ symbol: string; thesis: string }>('thesis', { symbol, limit: 1 }),
    readNamespace<{ a: string; b: string; coefficient: number }>('correlation', { limit: 8 }),
    brainStats(),
  ]);

  const lines: string[] = [];

  lines.push(`## Track record`);
  lines.push(
    `${stats.trades} decisions · ${stats.wins}W/${stats.losses}L (${(stats.winRate * 100).toFixed(0)}% win rate) · ` +
    `${stats.mistakes} logged mistakes`,
  );

  if (lessons.length) {
    lines.push('', '## Rules I have written for myself');
    lessons.forEach(l => lines.push(`- ${l.rule}${l.symbol ? ` (${l.symbol})` : ''}`));
  }

  if (mistakes.length) {
    lines.push('', '## Recent mistakes — do not repeat');
    mistakes.forEach(m => lines.push(`- [${m.kind}] ${m.detail} → ${m.correction}`));
  }

  if (thesis.length) {
    lines.push('', `## Current thesis on ${symbol}`);
    lines.push(thesis[0].thesis);
  }

  if (losses.length) {
    lines.push('', `## Recent losses on ${symbol}`);
    losses.forEach(l => lines.push(`- pnl ${l.pnl.toFixed(2)}${l.exitReason ? ` — ${l.exitReason}` : ''}`));
  }

  if (correlations.length) {
    lines.push('', '## Known correlations');
    correlations.forEach(c => lines.push(`- ${c.a}/${c.b}: ${c.coefficient.toFixed(2)}`));
  }

  return lines.join('\n');
}
