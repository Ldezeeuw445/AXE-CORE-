/**
 * The '1h' vs 'h1' split cost nothing visible and broke the comparison the
 * whole ledger exists to make. These are the two properties that stop it
 * coming back.
 */
import { describe, it, expect } from 'vitest';
import { canonicalTimeframe, toEngineInterval, TIMEFRAMES, DEFAULT_TIMEFRAME } from './timeframes';
import { TIMEFRAME_COLORS, timeframeColor, UNKNOWN_STRATEGY_COLOR } from './strategyColors';

describe('one vocabulary', () => {
  it('folds every dialect onto the same canonical name', () => {
    for (const alias of ['1h', 'h1', 'H1', ' 1H ', '60min', 'hourly']) {
      expect(canonicalTimeframe(alias), alias).toBe('h1');
    }
    for (const alias of ['1day', 'd1', '1d', 'daily']) {
      expect(canonicalTimeframe(alias), alias).toBe('d1');
    }
    expect(canonicalTimeframe('15min')).toBe('m15');
  });

  it('refuses to guess at something it does not know', () => {
    // Coercing an unknown timeframe to h1 would file a d1 result as an hour.
    expect(canonicalTimeframe('fortnightly')).toBeNull();
    expect(canonicalTimeframe('')).toBeNull();
    expect(canonicalTimeframe(null)).toBeNull();
  });

  it('asks the VPS engines in their own dialect', () => {
    // The engines are TwelveData-backed; these are its interval names.
    expect(toEngineInterval('h1')).toBe('1h');
    expect(toEngineInterval('d1')).toBe('1day');
    expect(toEngineInterval('m15')).toBe('15min');
    // Round trip: whatever we send, we can read back as what we meant.
    for (const tf of TIMEFRAMES) {
      expect(canonicalTimeframe(toEngineInterval(tf)), tf).toBe(tf);
    }
  });

  it('gives every canonical timeframe a colour', () => {
    // A framework row filed as '1h' rendered grey, because the colour table is
    // keyed 'h1'. Any canonical value must have a real colour.
    for (const tf of TIMEFRAMES) {
      if (tf === 'm30') continue; // no dot for m30 — the algo never selects it
      expect(TIMEFRAME_COLORS[tf], `${tf} has no colour`).toBeDefined();
      expect(timeframeColor(tf)).not.toBe(UNKNOWN_STRATEGY_COLOR);
    }
  });

  it('defaults to the timeframe the old untimed rows were actually run at', () => {
    expect(DEFAULT_TIMEFRAME).toBe('h1');
  });
});
