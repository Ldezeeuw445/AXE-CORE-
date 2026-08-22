/**
 * What counts as open work — one definition, because two drifted.
 *
 * The Awareness panel and the phone's lock screen both filtered with
 * `status != 'done'`, which looks right and excludes nothing: `done` is a
 * legal value in the CHECK constraint but the durable worker never writes it.
 * It writes `completed`. So a table holding 6 completed, 3 failed and 1
 * cancelled task reported "10 open" on the lock screen for weeks, and the one
 * genuinely stuck task was invisible inside that number rather than standing
 * out as the single thing waiting.
 *
 * Stated as the terminal set rather than the open set on purpose. A status
 * added later is far more likely to be a new kind of in-flight work than a new
 * kind of finished, and for an awareness counter the safer failure is showing
 * something that turns out to be done — not hiding work that is still waiting.
 *
 * The full CHECK constraint, measured 2026-08-22:
 *   pending, queued, planning, in_progress, running, blocked,
 *   waiting_approval, approved, rejected, verifying, retrying,
 *   done, completed, failed, cancelled
 *
 * Kept in step with `Awareness.kt` on the Android side, which cannot import
 * this file.
 */

/** Statuses that mean the task will never move again. */
export const TERMINAL_TASK_STATUSES = [
  'done', 'completed', 'failed', 'cancelled', 'rejected',
] as const;

/** True when a task is still waiting on something — a person or the worker. */
export function isOpenTask(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase();
  // An empty status is a row mid-write, not a finished one.
  if (!s) return true;
  return !(TERMINAL_TASK_STATUSES as readonly string[]).includes(s);
}
