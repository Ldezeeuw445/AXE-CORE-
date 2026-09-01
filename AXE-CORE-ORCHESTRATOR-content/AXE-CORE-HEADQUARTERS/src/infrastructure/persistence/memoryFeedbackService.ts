/**
 * memoryFeedbackService — the half of the loop that was missing.
 *
 * AXE already had every other part: memoryManagerService extracts durable
 * facts, conversationReviewService grades its own replies, memoryDecayService
 * lowers the confidence of anything that goes unreinforced. Read its comment:
 * "entries that keep matching / being used get a small boost".
 *
 * Nothing ever told it which entries those were. `reinforceKeys` is a
 * parameter no caller has ever passed, and no code recorded which memories a
 * retrieval actually returned. So every pass could only decay. A loop that
 * only forgets is not a learning loop, it is an erosion schedule -- and the
 * quality of a memory made no difference to how long it survived.
 *
 * This closes it with the smallest honest signal:
 *
 *   1. a retrieval says which memories it returned, for which question
 *   2. the turn that used them is later judged good or bad
 *   3. memories that were in the room when things went well are reinforced;
 *      the rest simply keep decaying, which is what decay is for
 *
 * Deliberately NOT a reward model. "The reply was graded well" is weak
 * evidence that a particular memory helped -- five were injected and maybe one
 * mattered. So a hit nudges importance rather than setting it, and a bad turn
 * never punishes: a wrong answer is far more often the model's fault than the
 * memory's, and punishing recall for that would teach AXE to remember less.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

const LS_KEY = 'axe_memory_feedback_v1';
const MAX_TURNS = 60;
/** Older than this and we can no longer say which turn used what. */
const TURN_TTL_MS = 45 * 60 * 1000;

export type TurnVerdict = 'good' | 'poor' | 'unknown';

interface RetrievalTurn {
  id: string;
  at: number;
  query: string;
  /** rag_memories ids that were returned for this question. */
  memoryIds: string[];
  /** global_memory keys that were in the same context. */
  memoryKeys: string[];
  verdict: TurnVerdict;
  /** Set once reinforcement has been applied, so it happens at most once. */
  applied?: boolean;
}

function load(): RetrievalTurn[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(raw) ? (raw as RetrievalTurn[]) : [];
  } catch { return []; }
}

function save(turns: RetrievalTurn[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(turns.slice(-MAX_TURNS)));
  } catch { /* private window */ }
}

/** Monotonic-ish id without Date.now collisions inside one millisecond. */
let seq = 0;
function newTurnId(): string {
  seq = (seq + 1) % 1_000_000;
  return `t${Date.now().toString(36)}-${seq.toString(36)}`;
}

/**
 * Record what a retrieval returned. Returns the turn id, which the caller
 * passes back to noteTurnOutcome once the reply has been judged.
 */
export function noteRetrieval(
  query: string,
  memoryIds: Array<string | undefined>,
  memoryKeys: Array<string | undefined> = [],
): string {
  const id = newTurnId();
  const turns = load();
  turns.push({
    id,
    at: Date.now(),
    query: query.slice(0, 200),
    memoryIds: memoryIds.filter((x): x is string => !!x),
    memoryKeys: memoryKeys.filter((x): x is string => !!x),
    verdict: 'unknown',
  });
  save(turns);
  return id;
}

/** The most recent turn that has not been judged yet, if it is still fresh. */
export function latestOpenTurnId(): string | null {
  const cutoff = Date.now() - TURN_TTL_MS;
  const open = load().filter(t => t.verdict === 'unknown' && t.at >= cutoff);
  return open.length ? open[open.length - 1].id : null;
}

export function noteTurnOutcome(turnId: string | null, verdict: TurnVerdict): void {
  if (!turnId || verdict === 'unknown') return;
  const turns = load();
  const t = turns.find(x => x.id === turnId);
  if (!t) return;
  t.verdict = verdict;
  save(turns);
}

/**
 * Judge a turn by the question it answered.
 *
 * conversationReviewService grades exchanges on its own schedule, well after
 * the retrieval happened, and has no turn id to hand back. Rather than thread
 * one through several layers that do not otherwise care, the join is the
 * question text -- which is already stored, and is specific enough: two
 * retrievals with the same first 60 characters are the same question asked
 * twice, and reinforcing both is the correct outcome anyway.
 *
 * Only unjudged turns are touched, so a later review cannot overwrite an
 * earlier verdict on the same wording.
 */
export function noteTurnOutcomeByQuery(userText: string, verdict: TurnVerdict): number {
  if (verdict === 'unknown') return 0;
  const needle = (userText || '').slice(0, 60).toLowerCase().trim();
  if (needle.length < 8) return 0;
  const turns = load();
  let hit = 0;
  for (const t of turns) {
    if (t.verdict !== 'unknown') continue;
    if (t.query.slice(0, 60).toLowerCase().trim() !== needle) continue;
    t.verdict = verdict;
    hit++;
  }
  if (hit) save(turns);
  return hit;
}

/**
 * global_memory keys worth reinforcing — what memoryDecayService has always
 * asked for and never been given.
 */
export function reinforcementKeys(): string[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const keys = new Set<string>();
  for (const t of load()) {
    if (t.verdict !== 'good' || t.at < cutoff) continue;
    for (const k of t.memoryKeys) keys.add(k);
  }
  return [...keys];
}

export interface ReinforcementReport {
  turns: number;
  memories: number;
  failed: number;
}

/**
 * Raise the importance of memories that were retrieved during turns that went
 * well. +1 per turn they appear in, capped at 10 -- a nudge, not a verdict.
 *
 * Idempotent: a turn is marked applied, so re-running does not compound.
 */
export async function applyReinforcement(): Promise<ReinforcementReport> {
  const report: ReinforcementReport = { turns: 0, memories: 0, failed: 0 };
  const turns = load();
  const pending = turns.filter(t => t.verdict === 'good' && !t.applied && t.memoryIds.length);
  if (!pending.length) return report;

  const sb = getSupabase();
  if (!sb) return report;

  const bump = new Map<string, number>();
  for (const t of pending) {
    for (const id of t.memoryIds) bump.set(id, (bump.get(id) ?? 0) + 1);
  }

  for (const [id, times] of bump) {
    try {
      const { data, error } = await sb
        .from('rag_memories').select('importance').eq('id', id).single();
      if (error) throw new Error(error.message);
      const next = Math.min(10, (data?.importance ?? 5) + times);
      const { error: upErr } = await sb
        .from('rag_memories').update({ importance: next }).eq('id', id);
      if (upErr) throw new Error(upErr.message);
      report.memories++;
    } catch (err) {
      // Counted and logged. A reinforcement that fails silently is how you end
      // up believing a loop is closed when it is not -- which is the whole
      // reason this file exists.
      report.failed++;
      console.error('[memoryFeedback] could not reinforce', id, err);
    }
  }

  for (const t of pending) { t.applied = true; report.turns++; }
  save(turns);
  if (report.memories || report.failed) {
    console.info(
      `[memoryFeedback] reinforced ${report.memories} memories from ${report.turns} good turns` +
      (report.failed ? `, ${report.failed} failed` : ''),
    );
  }
  return report;
}

/** For the Status page: is the loop actually turning? */
export function feedbackHealth(): {
  turns: number; judged: number; good: number; reinforcedMemories: number;
} {
  const turns = load();
  return {
    turns: turns.length,
    judged: turns.filter(t => t.verdict !== 'unknown').length,
    good: turns.filter(t => t.verdict === 'good').length,
    reinforcedMemories: turns.filter(t => t.applied).reduce((n, t) => n + t.memoryIds.length, 0),
  };
}
