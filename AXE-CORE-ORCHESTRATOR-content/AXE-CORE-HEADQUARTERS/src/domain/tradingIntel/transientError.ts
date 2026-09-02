/**
 * Is this failure one that clears itself, and how long should we wait?
 *
 * ## Why a screen needs to know the difference
 *
 * The account books all showed:
 *
 *   History unreadable — history-deals 429: {"error":"MetaAPI quota was
 *   exceeded — backing off, and nothing cached for this call yet"}
 *
 * while MetaAPI itself answered all four accounts in under half a second with
 * 543, 47, 5 and 7 deals. Nothing was refusing the desk. AXE's own budget layer
 * had entered a sixty-second cooldown, the panel fetched once during it, and
 * then never asked again — so a condition that lasts one minute was rendered as
 * a permanent state, on every card at once, because the budget keys on the
 * subscription rather than the account.
 *
 * A wrong key and a busy minute look identical if the screen only reports the
 * text. One needs a new key; the other needs sixty seconds and no action at
 * all, and telling the reader which is the difference between fixing something
 * and waiting.
 *
 * ## Why the wait is longer than the cooldown
 *
 * COOLDOWN_MS is 60s, and retrying at exactly 60s races the clock that clears
 * it. The margin makes the retry land after the window rather than on its edge,
 * and the jitter keeps four cards from retrying in the same instant and
 * re-tripping the pacing they were waiting out.
 */

export interface RetryPlan {
  /** Worth trying again on its own. */
  retryable: boolean;
  /** How long to wait, in ms. Zero when not retryable. */
  waitMs: number;
  /** What to tell the reader while waiting. */
  reason: string;
}

/** The budget cooldown, plus room so the retry lands after it, not on it. */
export const COOLDOWN_RETRY_MS = 65_000;
/** Spread simultaneous retries so they do not re-trip the pacing together. */
export const RETRY_JITTER_MS = 8_000;

const NOT_RETRYABLE: RetryPlan = { retryable: false, waitMs: 0, reason: '' };

/**
 * Read a failure and decide whether waiting is the right response.
 *
 * Only the self-clearing cases are retryable. A 401, a missing account, a
 * malformed request: those stay put and are shown as-is, because retrying them
 * hides a problem that needs a person.
 */
export function planRetry(error: string | null | undefined, jitter = Math.random()): RetryPlan {
  if (!error) return NOT_RETRYABLE;
  const e = error.toLowerCase();

  // AXE's own backoff after the broker said no. Clears on a timer.
  if (e.includes('backing off') || e.includes('quota was exceeded')) {
    return {
      retryable: true,
      waitMs: COOLDOWN_RETRY_MS + Math.floor(jitter * RETRY_JITTER_MS),
      reason: 'the desk is waiting out a MetaAPI backoff',
    };
  }
  // AXE pacing itself, or its per-account allowance. Also a timer.
  if (e.includes('being paced') || e.includes('call budget reached')) {
    return {
      retryable: true,
      waitMs: 20_000 + Math.floor(jitter * RETRY_JITTER_MS),
      reason: 'calls are being paced to stay under the quota',
    };
  }
  // A bare 429 from the broker with no local wording — same shape, same answer.
  if (/\b429\b/.test(e)) {
    return {
      retryable: true,
      waitMs: COOLDOWN_RETRY_MS + Math.floor(jitter * RETRY_JITTER_MS),
      reason: 'the broker is rate-limiting this call',
    };
  }
  return NOT_RETRYABLE;
}
