/**
 * A spent budget and a broken provider must not look the same.
 *
 * That distinction is the whole point of T9: one is waiting until midnight,
 * the other is a key or a provider to fix, and before this the panel showed a
 * cap for exactly one source by name. These assert the table is the single
 * source of truth and that every budgeted source surfaces its own numbers.
 */
import { describe, it, expect } from 'vitest';
import { SOURCE_DAILY_CAPS, dailyCapFor, PERIGON_DAILY_CAP, EODHD_DAILY_CAP } from './researchSources';

describe('SOURCE_DAILY_CAPS', () => {
  it('is the single place the per-source caps live', () => {
    // If these ever drift, one screen shows a cap the fetcher does not enforce.
    expect(SOURCE_DAILY_CAPS.perigon).toBe(PERIGON_DAILY_CAP);
    expect(SOURCE_DAILY_CAPS.eodhd).toBe(EODHD_DAILY_CAP);
  });

  it('covers the source that previously had no budget at all', () => {
    expect(SOURCE_DAILY_CAPS.polygon).toBeGreaterThan(0);
  });

  it('has only positive, finite allowances', () => {
    for (const [source, cap] of Object.entries(SOURCE_DAILY_CAPS)) {
      expect(Number.isFinite(cap), source).toBe(true);
      expect(cap, source).toBeGreaterThan(0);
    }
  });
});

describe('dailyCapFor', () => {
  it('answers for a budgeted source', () => {
    expect(dailyCapFor('perigon')).toBe(PERIGON_DAILY_CAP);
  });

  it('returns null rather than 0 for an unbudgeted one', () => {
    // 0 would read as "no allowance left" and stop the source entirely.
    expect(dailyCapFor('sec')).toBeNull();
    expect(dailyCapFor('nonsense')).toBeNull();
  });
});
