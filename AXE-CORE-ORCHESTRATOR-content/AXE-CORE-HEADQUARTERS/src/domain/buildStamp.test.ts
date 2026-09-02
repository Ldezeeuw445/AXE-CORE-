import { describe, it, expect } from 'vitest';
import { buildStamp, buildStampLine, buildLooksStale } from './buildStamp';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const at = (iso: string) => ({ at: iso, commit: 'abc1234' });

describe('buildStamp', () => {
  it('is null when nothing was baked in, rather than throwing', () => {
    // Tests and any non-Vite runtime have no global. A reader must be able to
    // ask without guarding.
    expect(buildStamp()).toBeNull();
  });
});

describe('buildStampLine', () => {
  it('leads with the commit — the half that settles it', () => {
    // Two builds a minute apart look identical by clock, and the moment this
    // line gets read is exactly the moment someone has built twice.
    expect(buildStampLine(at('2026-08-27T11:58:00.000Z'), NOW)).toBe('build abc1234 · 2026-08-27 11:58 · 2m ago');
  });

  it('says just now for a fresh build', () => {
    expect(buildStampLine(at('2026-08-27T11:59:30.000Z'), NOW)).toContain('just now');
  });

  it('coarsens as it gets older', () => {
    expect(buildStampLine(at('2026-08-27T08:00:00.000Z'), NOW)).toContain('4h ago');
    expect(buildStampLine(at('2026-08-20T12:00:00.000Z'), NOW)).toContain('7d ago');
  });

  it('says so plainly when there is no stamp', () => {
    expect(buildStampLine(null, NOW)).toBe('build unknown');
  });

  it('drops the age rather than inventing one when the clock is ahead', () => {
    const line = buildStampLine(at('2026-08-27T12:30:00.000Z'), NOW);
    expect(line).toContain('abc1234');
    expect(line).not.toContain('ago');
  });

  it('survives a stamp whose time is not a time', () => {
    expect(buildStampLine({ at: 'nonsense', commit: 'abc1234' }, NOW)).toBe('build abc1234 · nonsense');
  });

  it('shows an unknown commit as unknown rather than hiding it', () => {
    // A build outside a git checkout is a real case; a fabricated sha would be
    // worse than none.
    expect(buildStampLine({ at: '2026-08-27T11:58:00.000Z', commit: 'unknown' }, NOW)).toContain('build unknown');
  });
});

describe('buildLooksStale', () => {
  it('flags a bundle older than the caller cares about', () => {
    expect(buildLooksStale(at('2026-08-27T08:00:00.000Z'), 3_600_000, NOW)).toBe(true);
    expect(buildLooksStale(at('2026-08-27T11:30:00.000Z'), 3_600_000, NOW)).toBe(false);
  });

  it('treats an unknown build as not stale', () => {
    // Unknown age is not the same as old — colouring it as a problem teaches
    // people to ignore the colour.
    expect(buildLooksStale(null, 1, NOW)).toBe(false);
  });
});
