/**
 * memoryRecorder — the intake path for high-volume, append-only app events
 * (conversation turns, tool calls, agent runs, errors, session boundaries).
 *
 * This is NOT the only way something reaches global_memory — a handful of
 * upsert-style facts (a standing preference, an agent/provider performance
 * counter, a specialist match) call `saveGlobalMemory` directly instead,
 * because they overwrite one key rather than append, and recordEvent's
 * batching queue has no notion of that. Both paths write the same table
 * through the same backend endpoint (axe_api `/memory/upsert`); this one
 * exists for events where three things matter that a direct call doesn't
 * give you:
 *
 *   batching   one request per flush window rather than one per event, so
 *              chatty paths (tool calls, keystroke-level UI events) cannot
 *              hammer the API
 *   ordering   a queue means a slow write never blocks the interaction that
 *              produced it — recording is always fire-and-forget
 *   uniformity every entry lands with the same key grammar and metadata, so
 *              the brain view and recall can query by kind without guessing
 *
 * Failure is never thrown at the caller: an event that cannot be recorded
 * must not break the thing being recorded. It is retried, and loudly logged
 * if it still fails, because silent loss is what made the old memory useless.
 */
import { memUpsert } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';

/** What happened. Drives both the key prefix and how the brain view groups it. */
export type EventKind =
  | 'conversation'   // a user/assistant exchange
  | 'tool_call'      // a tool ran, with its outcome
  | 'agent_run'      // an agent or crew executed
  | 'trade'          // a trading decision or execution
  | 'preference'     // the user told us how they want things
  | 'insight'        // something inferred rather than observed
  | 'error'          // a failure worth learning from
  | 'session'        // app opened, view changed, session boundary
  | 'resource'       // a file, feed or doc came into play
  | 'reflection';    // what worked / what Luka corrected, after a completed action

/** Where each kind lands in global_memory's fixed category enum. */
const CATEGORY_FOR: Record<EventKind, GlobalMemoryEntry['category']> = {
  conversation: 'conversation_context',
  tool_call: 'system_event',
  agent_run: 'system_event',
  trade: 'system_event',
  preference: 'user_preference',
  insight: 'conversation_context',
  error: 'system_event',
  session: 'system_event',
  resource: 'system_event',
  reflection: 'system_event',
};

export interface RecordInput {
  kind: EventKind;
  /** One line, human-readable — this is what shows up in the memory stream. */
  summary: string;
  /** Structured payload. Kept whole where it fits, truncated where it does not. */
  details?: Record<string, unknown>;
  /** 0..1. Observed facts are 1; inferences should be lower and honest. */
  confidence?: number;
  /** Stable id to overwrite rather than append — omit for append-only events. */
  dedupeKey?: string;
  /**
   * Which agent produced this event, matching an id in `public.agents`.
   *
   * Without this, every event of a kind collapsed into one hub regardless of
   * source — 94% of global_memory landed under a single "Events" bucket
   * because tool_call/agent_run/trade/error/session all map to the same
   * category and nothing distinguished who did what. Tagging the source is
   * the fix: the Agents hub reads this field to split one pile into one
   * stack per agent.
   */
  agentId?: string;
}

interface QueuedEntry {
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

const FLUSH_MS = 2000;
/** Ceiling for the backoff below. A minute between attempts is still frequent
 *  enough that nothing is lost, and slow enough to let a struggling backend
 *  breathe. */
const MAX_BACKOFF_MS = 60_000;
let consecutiveFailures = 0;
const MAX_BATCH = 25;
/** Postgres will take far more, but a memory nobody can read back is not one. */
const MAX_VALUE_CHARS = 4000;

let queue: QueuedEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function truncate(s: string, max = MAX_VALUE_CHARS): string {
  return s.length <= max ? s : `${s.slice(0, max - 14)}…[truncated]`;
}

/**
 * Append-only by default: two identical tool calls minutes apart are two
 * events, and collapsing them would erase the pattern. Callers that genuinely
 * describe a single evolving fact (a preference, a standing thesis) pass a
 * dedupeKey and get upsert behaviour instead.
 */
function keyFor(input: RecordInput): string {
  if (input.dedupeKey) return `${input.kind}:${input.dedupeKey}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${input.kind}:${Date.now()}:${rand}`;
}

async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);

  try {
    await memUpsert(batch);
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures += 1;
    // Put them back at the front so ordering survives a transient failure,
    // but cap the backlog: an API that stays down must not grow the queue
    // without bound and take the tab's memory with it.
    queue = [...batch, ...queue].slice(0, 200);
    console.error('[memory] flush failed, %d entries requeued:', batch.length, err);
  } finally {
    flushing = false;
    if (queue.length > 0) schedule();
  }
}

function schedule(): void {
  if (timer) return;
  // Back off while the backend is failing, instead of retrying every 2s
  // forever. Three clients each hammering a struggling database at a fixed
  // rate is what kept it from ever recovering on its own -- only a restart,
  // which disconnects everyone at once, would clear it. Doubling per failure
  // and resetting on the first success.
  const delay = consecutiveFailures === 0
    ? FLUSH_MS
    : Math.min(MAX_BACKOFF_MS, FLUSH_MS * 2 ** Math.min(consecutiveFailures, 5));
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, delay);
}

/**
 * Record one event. Never throws, never blocks — call it freely from any path.
 */
export function recordEvent(input: RecordInput): void {
  try {
    const payload = {
      summary: input.summary,
      ...(input.details ?? {}),
      at: new Date().toISOString(),
    };
    queue.push({
      user_id: AXE_USER_ID,
      category: CATEGORY_FOR[input.kind],
      key: keyFor(input),
      value: truncate(JSON.stringify(payload)),
      confidence: input.confidence ?? 1,
      metadata: {
        kind: input.kind,
        summary: truncate(input.summary, 200),
        ...(input.agentId ? { agentId: input.agentId } : {}),
      },
    });
    if (queue.length >= MAX_BATCH) void flush();
    else schedule();
  } catch (err) {
    console.error('[memory] could not queue event:', input.kind, err);
  }
}

/** Force a write now — used on page hide so a closing tab loses nothing. */
export function flushMemoryNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  return flush();
}

/**
 * A tab can be closed or backgrounded between flush windows, which on a 2s
 * timer is enough to lose the last few events of every session — exactly the
 * ones describing what the user did last.
 */
export function installMemoryFlushHooks(): void {
  if (typeof document === 'undefined') return;
  const onHide = () => { if (document.visibilityState === 'hidden') void flushMemoryNow(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => { void flushMemoryNow(); });
}

/** Queue depth — for the brain view's sync indicator. */
export function pendingMemoryCount(): number {
  return queue.length;
}
