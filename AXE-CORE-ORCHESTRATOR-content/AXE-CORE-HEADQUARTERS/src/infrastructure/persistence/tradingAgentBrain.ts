/**
 * tradingAgentBrain — the agent's structured long-term memory.
 *
 * WRITES TO `memory`, IN THE axe_trader NAMESPACE.
 *
 * It wrote to global_memory until 2026-08-27, with a header arguing that its
 * rich metadata needed a free-form bag. That argument was sound about
 * memoryRecorder and wrong about the destination: global_memory is keyed
 * state, where a key holds one value and a new write replaces it. These are
 * events — a cycle, a win, a mistake — and events append.
 *
 * The cost of being on the wrong side was measurable. 10 995 `ta:` keys sat in
 * global_memory against 5 564 in memory: one family of facts in two stores,
 * neither authoritative, and no panel able to answer "what does this agent
 * know" without querying both and hoping they agree. The same split showed
 * axe_research as "never" for forty days while the crew ran every cycle.
 *
 * The metadata this file needs turned out to be columns `memory` already has —
 * `kind`, `symbol`, `category` — plus the namespace, which lives in the key and
 * is what readNamespace filters on anyway. Nothing was lost by moving.
 *
 * See the memory model (M1): an event goes to `memory`, a state goes to
 * `global_memory`, a similarity goes to `rag_memories`.
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
import { remember, recall, type MemoryKind, type MemoryRow } from '@/infrastructure/persistence/agentMemoryService';
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
/**
 * Which shape each namespace is, in the vocabulary `memory` already uses.
 *
 * MemoryKind is deliberately small — 'fact' | 'lesson' | 'event' | 'doc' — and
 * shared with every other agent. The namespace keeps the finer distinction and
 * lives in the key, which is what readNamespace filters on.
 */
const BRAIN_KIND: Record<BrainNamespace, MemoryKind> = {
  cycle: 'event', win: 'event', loss: 'event', mistake: 'event',
  lesson: 'lesson', intel: 'fact', correlation: 'fact', thesis: 'fact',
};

/**
 * One writer for all eight namespaces, on the right side of the boundary.
 *
 * Every function below wrote to global_memory, which is keyed state — a key
 * has one value and a new write replaces it. These are events: a cycle, a win,
 * a mistake. They belong in `memory`, which appends and is namespaced per
 * agent, and which is where the trader's own read already looks.
 *
 * Measured 2026-08-27 before this changed: 10 995 `ta:` keys in global_memory
 * against 5 564 in memory — the same family of facts in two stores, neither
 * authoritative. That is the split that showed axe_research as "never" for
 * forty days while the crew ran every cycle, one table over.
 *
 * See the memory model (M1) for the rule this puts into code: an event goes to
 * `memory`, a state goes to `global_memory`, a similarity goes to
 * `rag_memories`.
 */
async function writeBrain(input: {
  ns: BrainNamespace;
  id: string;
  payload: unknown;
  symbol?: string;
  confidence?: number;
}): Promise<void> {
  await remember({
    agent: 'axe_trader',
    kind: BRAIN_KIND[input.ns],
    key: nsKey(input.ns, input.id),
    content: JSON.stringify(input.payload),
    category: 'system_event',
    symbol: input.symbol,
    confidence: input.confidence,
    source: 'axe_algo',
  });
}

export async function recordTrade(t: TradeRecord): Promise<void> {
  await writeBrain({ ns: 'cycle', id: t.id, payload: t, symbol: t.symbol, confidence: t.confidence });
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
    await writeBrain({ ns: bucket, id: o.tradeId, payload: o, symbol: o.symbol, confidence: 1 });
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
  await writeBrain({ ns: 'mistake', id, payload: { ...input, at: stamp() }, symbol: input.symbol, confidence: 1 });
}

export async function recordLesson(input: {
  symbol?: string;
  rule: string;
  /** Evidence the rule is real — trade ids it was derived from. */
  derivedFrom: string[];
  confidence?: number;
}): Promise<void> {
  await writeBrain({
    ns: 'lesson', id: `${Date.now()}`, payload: { ...input, at: stamp() },
    // 'ALL' is meaningful here: a rule with no symbol applies to every symbol,
    // and readNamespace's symbol filter lets it through on purpose.
    symbol: input.symbol ?? 'ALL', confidence: input.confidence ?? 0.7,
  });
}

export async function recordIntelSnapshot(input: {
  symbol: string;
  cycleId?: string;
  signal?: string;
  thesis: string;
  hypotheses?: string[];
}): Promise<void> {
  await writeBrain({
    ns: 'intel', id: `${input.symbol}-${Date.now()}`,
    payload: { ...input, at: stamp() }, symbol: input.symbol, confidence: 0.6,
  });
}

export async function recordCorrelation(input: {
  a: string;
  b: string;
  coefficient: number;
  window: string;
  note?: string;
}): Promise<void> {
  await writeBrain({
    ns: 'correlation', id: `${input.a}-${input.b}`,
    payload: { ...input, at: stamp() },
    confidence: Math.min(1, Math.abs(input.coefficient)),
  });
}

export async function recordThesis(symbol: string, thesis: string, confidence = 0.6): Promise<void> {
  await writeBrain({ ns: 'thesis', id: symbol, payload: { symbol, thesis, at: stamp() }, symbol, confidence });
}

/* ── reads ───────────────────────────────────────────────────────────────── */

function parse<T>(e: MemoryRow): T | null {
  try {
    return JSON.parse(e.content) as T;
  } catch {
    return null;
  }
}

/** All entries in one namespace, newest first. */
export async function readNamespace<T = unknown>(
  ns: BrainNamespace,
  opts: { symbol?: string; limit?: number } = {},
): Promise<T[]> {
  // Reads its own namespace rather than the newest 400 system_events of every
  // agent. The old shape capped BEFORE it filtered, so an entry older than the
  // last 400 rows written by anyone was unreachable however few this namespace
  // had — the same fault the trader's own read had until f1f1dd6, one file over.
  const rows = await recall('axe_trader', { limit: 400 });
  const prefix = `${PREFIX}${ns}:`;
  return rows
    .filter(r => (r.key ?? '').startsWith(prefix))
    .filter(r => !opts.symbol || r.symbol === opts.symbol || r.symbol === 'ALL')
    .slice(0, opts.limit ?? 25)
    .map(r => parse<T>(r))
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
  const all = await recall('axe_trader', { limit: 600 });
  const count = (ns: BrainNamespace) =>
    all.filter(e => (e.key ?? '').startsWith(`${PREFIX}${ns}:`)).length;

  const trades = count('cycle');
  const wins = count('win');
  const losses = count('loss');
  const mistakes = count('mistake');
  const lessons = count('lesson');

  const byMistakeKind: Record<string, number> = {};
  all
    .filter(e => (e.key ?? '').startsWith(`${PREFIX}mistake:`))
    .forEach(e => {
      // The kind travels inside the record now. It used to sit in
      // global_memory's free-form metadata; `memory` has typed columns and no
      // such bag, and the kind was always in the payload as well.
      const kind = String(parse<{ kind?: string }>(e)?.kind ?? 'unknown');
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
