import { describe, it, expect } from 'vitest';
import { ageLabel, provenanceLine, isStale } from './provenance';

const NOW = Date.parse('2026-08-27T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('ageLabel', () => {
  it('is coarse on purpose', () => {
    expect(ageLabel(ago(30_000), NOW)).toBe('just now');
    expect(ageLabel(ago(5 * 60_000), NOW)).toBe('5m ago');
    expect(ageLabel(ago(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(ageLabel(ago(4 * 86_400_000), NOW)).toBe('4d ago');
  });

  it('says nothing when there is nothing to say', () => {
    for (const v of [null, undefined, '', 'not a date']) {
      expect(ageLabel(v, NOW)).toBeNull();
    }
  });

  it('calls a future timestamp a clock problem, not freshness', () => {
    // "in 3m" would read as a scheduled event rather than a broken clock.
    expect(ageLabel(new Date(NOW + 180_000).toISOString(), NOW)).toBe('clock ahead');
  });
});

describe('provenanceLine', () => {
  it('reads as a fragment, not a label row', () => {
    expect(provenanceLine({ source: 'MetaAPI', scope: 'OANDA DEMO 50K', at: ago(2 * 60_000) }, NOW))
      .toBe('MetaAPI · OANDA DEMO 50K · 2m ago');
  });

  it('drops the parts it does not have', () => {
    expect(provenanceLine({ source: 'the ledger' }, NOW)).toBe('the ledger');
    expect(provenanceLine({ source: 'the ledger', at: ago(60_000) }, NOW)).toBe('the ledger · 1m ago');
  });

  it('marks a fallback as cached', () => {
    // "51 258" and "51 258, from cache" are different claims.
    expect(provenanceLine({ source: 'MetaAPI', at: ago(60_000), stale: true }, NOW))
      .toBe('MetaAPI · 1m ago · cached');
  });

  it('ignores whitespace-only parts', () => {
    expect(provenanceLine({ source: 'MetaAPI', scope: '   ' }, NOW)).toBe('MetaAPI');
  });
});

describe('isStale', () => {
  it('answers against the caller\'s own threshold', () => {
    // A cycle figure and a monthly release schedule are both "old" at very
    // different ages, so the threshold cannot live in here.
    const p = { source: 's', at: ago(10 * 60_000) };
    expect(isStale(p, 5 * 60_000, NOW)).toBe(true);
    expect(isStale(p, 30 * 60_000, NOW)).toBe(false);
  });

  it('treats an unknown age as unknown, not as old', () => {
    // The distinction this whole module exists for: "could not be checked" is
    // not "was checked and is bad".
    expect(isStale({ source: 's' }, 1, NOW)).toBe(false);
    expect(isStale({ source: 's', at: null }, 1, NOW)).toBe(false);
  });

  it('honours an explicit cached flag whatever the age says', () => {
    expect(isStale({ source: 's', at: ago(1), stale: true }, 60_000, NOW)).toBe(true);
  });
});
