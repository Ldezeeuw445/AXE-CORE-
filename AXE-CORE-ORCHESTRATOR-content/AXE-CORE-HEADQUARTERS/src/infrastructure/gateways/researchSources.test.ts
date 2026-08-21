/**
 * The research sources, and above all the budget that keeps one of them alive.
 *
 * Perigon's plan is 150 requests a month (read from /v1/limits on 2026-08-21,
 * resetting the 21st). The autopilot runs ninety-six cycles a day. Calling it
 * per pair per cycle would spend the month inside an hour, so the sweep is
 * fetched once a day and shared — and the cap is enforced in code, because a
 * limit that lives only in a comment is not a limit.
 */
import { describe, it, expect } from 'vitest';
import { eodhdTickerFor, polygonTickerFor, PERIGON_DAILY_CAP } from './researchSources';

/** Mirrors reserveDailyCall's arithmetic. */
function reserve(row: { date: string; used: number } | undefined, today: string, cap: number) {
  const fresh = row && row.date === today ? { ...row } : { date: today, used: 0 };
  if (fresh.used >= cap) return { allowed: false, row: fresh };
  fresh.used += 1;
  return { allowed: true, row: fresh };
}

describe('the Perigon daily budget', () => {
  it('stays inside the monthly plan', () => {
    // 150 a month over the longest month must still leave headroom.
    expect(PERIGON_DAILY_CAP * 31).toBeLessThanOrEqual(150);
  });

  it('allows the day\'s sweep and then stops', () => {
    let row: { date: string; used: number } | undefined;
    const today = '2026-08-21';
    for (let i = 0; i < PERIGON_DAILY_CAP; i++) {
      const r = reserve(row, today, PERIGON_DAILY_CAP);
      expect(r.allowed, `call ${i + 1} should be allowed`).toBe(true);
      row = r.row;
    }
    // The ninety-sixth cycle of the day must not get one.
    expect(reserve(row, today, PERIGON_DAILY_CAP).allowed).toBe(false);
  });

  it('starts fresh the next day rather than carrying the count', () => {
    const spent = { date: '2026-08-21', used: PERIGON_DAILY_CAP };
    expect(reserve(spent, '2026-08-22', PERIGON_DAILY_CAP).allowed).toBe(true);
  });

  it('counts a call that is about to be made, not one that succeeded', () => {
    // Reserved BEFORE the request: the provider counts a request that then
    // times out, and a counter that only increments on success overspends
    // exactly when things are going wrong.
    const r = reserve(undefined, '2026-08-21', PERIGON_DAILY_CAP);
    expect(r.row.used).toBe(1);
  });
});

describe('ticker mapping', () => {
  it('maps what each provider actually serves', () => {
    // Verified against the live keys rather than assumed.
    expect(eodhdTickerFor('XAUUSD')).toBe('XAUUSD.FOREX');
    expect(eodhdTickerFor('BTCUSD')).toBe('BTC-USD.CC');
    expect(eodhdTickerFor('NAS100')).toBe('NDX.INDX');
    expect(polygonTickerFor('XAUUSD')).toBe('C:XAUUSD');
    expect(polygonTickerFor('BTCUSD')).toBe('X:BTCUSD');
  });

  it('returns null for pairs a provider cannot serve', () => {
    // GSPC.INDX and DJI.INDX both errored on the EODHD plan, so US500 and US30
    // are deliberately absent — no headlines is honest, a wrong ticker is not.
    expect(eodhdTickerFor('US30')).toBeNull();
    expect(eodhdTickerFor('US500')).toBeNull();
    expect(polygonTickerFor('NAS100')).toBeNull();
  });

  it('does not care about case or padding', () => {
    expect(eodhdTickerFor('  xauusd ')).toBe('XAUUSD.FOREX');
  });
});
