/**
 * Sending the desk's conclusions to AXON Memory.
 *
 * ## Why anything at all
 *
 * Everything AXE Core learns currently stays inside AXE Core. AXON is the
 * store every other AI Luka uses can read, so a fill or a recurring refusal
 * put there is the difference between "the desk knows" and "he knows, from
 * whichever assistant he happens to be talking to".
 *
 * ## Why so little of it
 *
 * The autopilot re-saves a cycle record after every stage — three save points
 * per cycle in the code, a cycle every fifteen minutes — so this function is
 * reached far more often than there is anything to say. worthRemembering
 * decides what is worth a memory; this decides only whether it can be sent and
 * makes sure it is sent once. Nothing here ever throws into the cycle: a
 * memory store being down is not a reason to stop trading.
 *
 * ## Which AXON account
 *
 * Whichever the pasted key belongs to. Luka keeps a personal one and one for
 * the business, and nothing in this file can pick the wrong one because
 * nothing in this file picks at all.
 */
import { axonRemember } from '@/infrastructure/gateways/axonMemoryService';
import { notesWorthRemembering } from '@/domain/tradingIntel/worthRemembering';
import type { CycleRecord } from '@/domain/tradingIntel/cycleJournal';

const SENT_KEY = 'axe_axon_sent_keys';

/**
 * How many dedupe keys to remember.
 *
 * Bounded because this project has already had one unbounded local store fill
 * WebKit's quota and make every settings write fail. Order ids are the bulk of
 * these and stop mattering once they are old, so dropping the oldest is safe:
 * the worst case of forgetting one is a single duplicate memory in AXON.
 */
const SENT_LIMIT = 500;

function readSent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function writeSent(keys: string[]): void {
  try { localStorage.setItem(SENT_KEY, JSON.stringify(keys.slice(-SENT_LIMIT))); } catch { /* quota */ }
}

/** The AXON key from the Settings card, or empty when none is connected. */
export function axonKey(): string {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, { key?: string }>;
    return conns.axon?.key?.trim() ?? '';
  } catch { return ''; }
}

export interface AxonPushResult {
  /** Notes actually accepted by AXON. */
  sent: number;
  /** Why nothing was sent, when nothing was. Null when there was nothing to send. */
  skipped: string | null;
}

/**
 * Push whatever this cycle earned, once.
 *
 * A key is only marked as sent when AXON accepted it — a failed write must
 * stay eligible, or one outage silently loses the memory forever.
 */
export async function pushCycleToAxon(record: CycleRecord): Promise<AxonPushResult> {
  const key = axonKey();
  const sent = readSent();
  const notes = notesWorthRemembering(record, new Set(sent));
  if (notes.length === 0) return { sent: 0, skipped: null };
  if (!key) return { sent: 0, skipped: 'no AXON key connected' };

  const accepted: string[] = [];
  for (const note of notes) {
    const res = await axonRemember({
      key, content: note.content, title: note.title, tags: note.tags,
    });
    if (res.ok) accepted.push(note.dedupeKey);
  }
  if (accepted.length) writeSent([...sent, ...accepted]);
  return { sent: accepted.length, skipped: accepted.length ? null : 'AXON refused every write' };
}
