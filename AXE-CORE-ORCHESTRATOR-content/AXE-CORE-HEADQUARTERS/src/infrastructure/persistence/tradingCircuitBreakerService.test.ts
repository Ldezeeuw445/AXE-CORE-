/**
 * The exact bug found live on 2026-08-11: a circuit-breaker record saved
 * before equitySource-tagging existed had peakEquity = $1,116,543 with no
 * equitySource field at all. Against a real ~$49,854 MT5 account that reads
 * as a ~95% drawdown forever, permanently forcing every cycle to HOLD —
 * because the original guard (`existing.equitySource && ...`) only reset on
 * a *known* source mismatch and treated "no tag at all" as nothing to
 * question. This suite pins that scenario so it cannot regress silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The default vitest environment is Node, with no DOM — saveState() also
// writes straight to localStorage (in addition to the mocked saveSetting
// below), so a minimal in-memory shim is enough without pulling in jsdom
// for one file.
const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memStore.set(k, v); },
  removeItem: (k: string) => { memStore.delete(k); },
});

// Key-aware on purpose: the breaker is now stored per account, so a mock that
// returns one value for every key would make a cross-account test pass while
// proving nothing.
vi.mock('@/infrastructure/persistence/userSettingsService', () => {
  const store = new Map<string, unknown>();
  const LEGACY = 'axe_trading_circuit_breaker';
  return {
    loadSetting: vi.fn(async (key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback),
    saveSetting: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    __setStored: (v: unknown) => { store.clear(); if (v !== null) store.set(LEGACY, v); },
    __setStoredFor: (key: string, v: unknown) => { store.set(key, v); },
    __clear: () => store.clear(),
  };
});

import { checkAndUpdateCircuitBreaker } from './tradingCircuitBreakerService';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as settings from '@/infrastructure/persistence/userSettingsService';

describe('checkAndUpdateCircuitBreaker — legacy untagged state', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).__setStored({
      peakEquity: 1_116_543.81,
      tripped: false,
      updatedAt: '2026-08-11T13:19:54.064Z',
      // no equitySource — this is the exact shape found live
    });
  });

  it('resets rather than trusting a stale, untagged peak against real equity', async () => {
    const result = await checkAndUpdateCircuitBreaker(49_853.99, 0.12, 'live');
    expect(result.tripped).toBe(false);
    expect(result.peakEquity).toBeCloseTo(49_853.99, 2);
    expect(result.equitySource).toBe('live');
  });

  it('would otherwise have wrongly tripped on the untouched peak (sanity check)', () => {
    const peak = 1_116_543.81;
    const equity = 49_853.99;
    const drawdown = (peak - equity) / peak;
    expect(drawdown).toBeGreaterThan(0.9); // confirms the bug was real, not a rounding quirk
  });
});

describe('checkAndUpdateCircuitBreaker — genuine same-source drawdown still trips', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).__setStored({
      peakEquity: 50_000,
      tripped: false,
      updatedAt: '2026-08-11T00:00:00.000Z',
      equitySource: 'live',
    });
  });

  it('still trips on a real drawdown within the same source', async () => {
    const result = await checkAndUpdateCircuitBreaker(40_000, 0.12, 'live'); // 20% down
    expect(result.tripped).toBe(true);
  });

  it('does not trip under the threshold', async () => {
    const result = await checkAndUpdateCircuitBreaker(46_000, 0.12, 'live'); // 8% down
    expect(result.tripped).toBe(false);
  });
});

describe('checkAndUpdateCircuitBreaker — one breaker per account', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).__clear();
    memStore.clear();
  });

  it("does not measure one account's equity against another's peak", async () => {
    // Seen on screen 2026-08-20: "Equity drawdown 51.5% from peak $100000
    // exceeded the 15% limit" — while the account named sat flat at 100,000
    // with no closed trades. The peak was the MT5 100K account's and the
    // equity was the OANDA 50K account's. 100000 -> 48522 is 51.5%. It was
    // never a drawdown; it was two accounts subtracted from each other, and it
    // forced every cycle on BOTH to HOLD.
    const big = await checkAndUpdateCircuitBreaker(100_000, 0.15, 'live', 'acct-100k');
    expect(big.tripped).toBe(false);

    const small = await checkAndUpdateCircuitBreaker(48_522, 0.15, 'live', 'acct-50k');
    expect(small.tripped).toBe(false);
    expect(small.peakEquity).toBe(48_522);
  });

  it('still trips on a genuine drawdown within one account', async () => {
    await checkAndUpdateCircuitBreaker(100_000, 0.15, 'live', 'acct-100k');
    const down = await checkAndUpdateCircuitBreaker(80_000, 0.15, 'live', 'acct-100k');
    expect(down.tripped).toBe(true);
  });

  it('trips one account without stopping the other', async () => {
    await checkAndUpdateCircuitBreaker(100_000, 0.15, 'live', 'acct-100k');
    await checkAndUpdateCircuitBreaker(80_000, 0.15, 'live', 'acct-100k'); // trips
    // The point of separate accounts: one hitting its limit must not halt the
    // other. On a prop account this is the difference between one challenge
    // failing and all of them.
    const other = await checkAndUpdateCircuitBreaker(48_522, 0.15, 'live', 'acct-50k');
    expect(other.tripped).toBe(false);
  });
});
