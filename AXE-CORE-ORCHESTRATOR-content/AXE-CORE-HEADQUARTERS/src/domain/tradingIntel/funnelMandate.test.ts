import { describe, it, expect } from 'vitest';
import { openingMandate, MAX_RANKING_AGE_MS } from './funnelMandate';

const NOW = Date.parse('2026-08-27T12:00:00Z');
const fresh = (finalists: string[], agoMs = 0) => ({
  finalists,
  ranAt: new Date(NOW - agoMs).toISOString(),
});

describe('openingMandate', () => {
  it('lets a finalist open', () => {
    const m = openingMandate({ symbol: 'EURUSD', ranking: fresh(['EURUSD', 'XAUUSD']), now: NOW });
    expect(m).toMatchObject({ mayOpen: true, binding: true });
  });

  it('stops a pair the funnel dropped', () => {
    const m = openingMandate({ symbol: 'GBPUSD', ranking: fresh(['EURUSD', 'XAUUSD']), now: NOW });
    expect(m.mayOpen).toBe(false);
    expect(m.binding).toBe(true);
    expect(m.reason).toContain('not a finalist');
    // The reason names the finalists, so the trace says what won instead.
    expect(m.reason).toContain('EURUSD');
  });

  it('is case- and whitespace-insensitive about symbols', () => {
    expect(openingMandate({ symbol: ' eurusd ', ranking: fresh(['EURUSD']), now: NOW }).mayOpen).toBe(true);
    expect(openingMandate({ symbol: 'EURUSD', ranking: fresh([' eurusd ']), now: NOW }).mayOpen).toBe(true);
  });

  describe('never halts the desk when the ranking cannot be trusted', () => {
    // Each of these is a way the funnel can be unusable. All must resolve to
    // "may open" — a ranking problem is not a verdict.
    const cases: Array<[string, Parameters<typeof openingMandate>[0]['ranking']]> = [
      ['no run stored', null],
      ['undefined', undefined],
      ['no finalists at all', { finalists: [], ranAt: new Date(NOW).toISOString() }],
      ['unparseable timestamp', { finalists: ['EURUSD'], ranAt: 'not a date' }],
      ['timestamped in the future', { finalists: ['EURUSD'], ranAt: new Date(NOW + 60_000).toISOString() }],
    ];
    for (const [label, ranking] of cases) {
      it(label, () => {
        const m = openingMandate({ symbol: 'GBPUSD', ranking, now: NOW });
        expect(m.mayOpen).toBe(true);
        expect(m.binding).toBe(false);
      });
    }
  });

  it('stops binding once the ranking is stale', () => {
    const justInside = openingMandate({
      symbol: 'GBPUSD', ranking: fresh(['EURUSD'], MAX_RANKING_AGE_MS - 1000), now: NOW,
    });
    expect(justInside.mayOpen).toBe(false);

    const justOutside = openingMandate({
      symbol: 'GBPUSD', ranking: fresh(['EURUSD'], MAX_RANKING_AGE_MS + 1000), now: NOW,
    });
    expect(justOutside.mayOpen).toBe(true);
    expect(justOutside.binding).toBe(false);
    expect(justOutside.reason).toContain('old');
  });

  it('an overnight-old ranking cannot dictate the morning', () => {
    const m = openingMandate({ symbol: 'GBPUSD', ranking: fresh(['EURUSD'], 9 * 3600_000), now: NOW });
    expect(m.mayOpen).toBe(true);
  });
});
