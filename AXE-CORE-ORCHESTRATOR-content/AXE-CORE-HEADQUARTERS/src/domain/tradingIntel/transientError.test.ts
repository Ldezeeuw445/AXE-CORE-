import { describe, it, expect } from 'vitest';
import { planRetry, COOLDOWN_RETRY_MS, RETRY_JITTER_MS } from './transientError';

describe('planRetry', () => {
  it('waits out the desk\'s own backoff', () => {
    // The exact string every account card was showing while MetaAPI itself
    // answered all four in under half a second.
    const p = planRetry('history-deals 429: {"error":"MetaAPI quota was exceeded — backing off, and nothing cached for this call yet"}', 0);
    expect(p.retryable).toBe(true);
    expect(p.waitMs).toBeGreaterThanOrEqual(COOLDOWN_RETRY_MS);
    expect(p.reason).toMatch(/backoff/i);
  });

  it('waits a shorter time for pacing, which is not a broker refusal', () => {
    const paced = planRetry('MetaAPI calls are being paced to stay under the quota', 0);
    expect(paced.retryable).toBe(true);
    expect(paced.waitMs).toBeLessThan(COOLDOWN_RETRY_MS);
  });

  it('treats a bare 429 the same way', () => {
    expect(planRetry('history-deals 429: too many requests', 0).retryable).toBe(true);
  });

  it('does NOT retry the failures that need a person', () => {
    // Retrying these hides a problem instead of solving it.
    for (const e of [
      'history-deals 401: invalid token',
      'no such account at MetaAPI (404)',
      'Invalid token (request id: 2026...)',
      'HTTP 402 Payment required',
    ]) {
      expect(planRetry(e, 0).retryable, e).toBe(false);
    }
  });

  it('is silent on no error at all', () => {
    for (const e of [null, undefined, '']) expect(planRetry(e, 0).retryable).toBe(false);
  });

  it('spreads simultaneous retries', () => {
    // Four cards retrying in the same instant would re-trip the pacing they
    // were waiting out.
    const first = planRetry('quota was exceeded', 0).waitMs;
    const last = planRetry('quota was exceeded', 0.999).waitMs;
    expect(last).toBeGreaterThan(first);
    expect(last - first).toBeLessThanOrEqual(RETRY_JITTER_MS);
  });

  it('waits longer than the cooldown it is waiting out', () => {
    // Retrying at exactly 60s races the clock that clears it.
    expect(COOLDOWN_RETRY_MS).toBeGreaterThan(60_000);
  });
});
