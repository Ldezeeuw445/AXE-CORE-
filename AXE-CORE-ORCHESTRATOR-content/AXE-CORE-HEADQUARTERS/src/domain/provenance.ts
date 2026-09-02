/**
 * Where a number on screen came from, and how old it is.
 *
 * ## Why this is a domain concern and not a caption
 *
 * Every expensive misunderstanding on this desk has had the same shape: a panel
 * showed a number, and the number was true of something other than what the
 * reader assumed.
 *
 *   · Four account books read "MetaAPI quota was exceeded" while MetaAPI
 *     answered all four in under half a second. The panel was showing a
 *     sixty-second local backoff as a permanent broker refusal.
 *   · The Memory tab showed axe_research as "never" for forty days while the
 *     crew ran every cycle. The lane wrote to one table and the panel read
 *     another.
 *   · The Agent Shared section sat empty under "agents write insights here
 *     automatically", reading a table that has never held a row.
 *   · The decision card rendered "Not included in this plan (403)" where the
 *     upcoming events belong, for weeks, and was read as a broken card rather
 *     than a missing subscription.
 *
 * None of those were wrong numbers. They were numbers whose SOURCE was
 * invisible, and every one of them cost hours that a single line would have
 * saved.
 *
 * So a panel states three things: which store the figure came from, what it is
 * scoped to, and when it was true. Freshness is part of provenance rather than
 * decoration — "equity 51 258" and "equity 51 258, four hours ago" are
 * different claims, and only one of them can be acted on.
 */

export interface Provenance {
  /** Where it was read from, in the reader's words — "MetaAPI", "the ledger". */
  source: string;
  /** What it is true OF: an account, a round, a symbol. Omit when global. */
  scope?: string;
  /** When the underlying data was written. Null when genuinely unknown. */
  at?: string | null;
  /** Set when this is a fallback rather than the live figure. */
  stale?: boolean;
}

const MINUTE = 60_000;

/**
 * Age in words, or null when there is nothing to say.
 *
 * Deliberately coarse. A panel does not need seconds, and a precise number
 * invites reading significance into the difference between 41 and 44 seconds.
 */
export function ageLabel(at: string | null | undefined, now = Date.now()): string | null {
  if (!at) return null;
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  // A timestamp in the future is a clock problem, not freshness. Saying "in
  // 3m" would read as a scheduled event.
  if (ms < 0) return 'clock ahead';
  if (ms < MINUTE) return 'just now';
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)}m ago`;
  if (ms < 48 * 60 * MINUTE) return `${Math.round(ms / (60 * MINUTE))}h ago`;
  return `${Math.round(ms / (24 * 60 * MINUTE))}d ago`;
}

/**
 * The one line a panel prints under its numbers.
 *
 * Reads as a sentence fragment rather than a label row, because it is meant to
 * be skimmed and only occasionally read: "MetaAPI · OANDA DEMO 50K · 2m ago".
 */
export function provenanceLine(p: Provenance, now = Date.now()): string {
  const parts = [p.source.trim()];
  if (p.scope?.trim()) parts.push(p.scope.trim());
  const age = ageLabel(p.at, now);
  if (age) parts.push(age);
  const line = parts.join(' · ');
  return p.stale ? `${line} · cached` : line;
}

/**
 * Whether the reader should be warned rather than merely informed.
 *
 * Not a hard threshold on the number itself — that belongs to whoever knows
 * how often the figure is meant to change. A panel refreshing every cycle and
 * a monthly release schedule are both "old" at very different ages.
 */
export function isStale(p: Provenance, maxAgeMs: number, now = Date.now()): boolean {
  if (p.stale) return true;
  if (!p.at) return false;   // unknown age is not the same as old
  const ms = now - Date.parse(p.at);
  return Number.isFinite(ms) && ms > maxAgeMs;
}
