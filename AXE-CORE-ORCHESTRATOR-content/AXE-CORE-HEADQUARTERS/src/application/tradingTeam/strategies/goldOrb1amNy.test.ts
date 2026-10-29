/**
 * Gold ORB unit tests — synthetic 5m NY session (no network).
 */
import { describe, expect, it } from 'vitest';
import {
  backtestGoldOrb,
  evaluateGoldOrb,
  nyParts,
  DEFAULT_GOLD_ORB_CONFIG,
  type StrategyBar,
} from './goldOrb1amNy';

/** Winter EST: NY = UTC-5 */
function isoAtNy(y: number, m: number, d: number, h: number, min: number): string {
  return new Date(Date.UTC(y, m - 1, d, h + 5, min)).toISOString();
}

function buildSession(opts?: { breakUp?: boolean }): StrategyBar[] {
  const breakUp = opts?.breakUp !== false;
  const bars: StrategyBar[] = [];
  for (let t = 0; t < 6 * 60; t += 5) {
    const h = Math.floor(t / 60);
    const min = t % 60;
    let o = 2000, high = 2000.5, low = 1999.5, close = 2000;
    if (t >= 60 && t < 75) { o = 2000; high = 2002; low = 2000; close = 2001; }
    if (breakUp) {
      if (t === 80) { o = 2001.5; high = 2004; low = 2001; close = 2003.5; }
      if (t === 85) { o = 2003.5; high = 2005; low = 2003; close = 2004; }
      if (t === 90) { o = 2004; high = 2006; low = 2003.8; close = 2005.5; }
    } else {
      if (t === 80) { o = 2000.5; high = 2001; low = 1997; close = 1997.5; }
      if (t === 85) { o = 1997.5; high = 1998; low = 1996; close = 1997; }
      if (t === 90) { o = 1997; high = 1997.2; low = 1994; close = 1995; }
    }
    bars.push({ time: isoAtNy(2026, 1, 15, h, min), open: o, high, low, close, volume: 100 + t });
  }
  return bars;
}

describe('nyParts', () => {
  it('maps 01:00 NY correctly in winter', () => {
    const p = nyParts(isoAtNy(2026, 1, 15, 1, 0));
    expect(p.h).toBe(1);
    expect(p.min).toBe(0);
    expect(p.dateKey).toBe('2026-01-15');
  });
});

describe('evaluateGoldOrb', () => {
  it('emits buy signal after close above ORB with volatility filter on', () => {
    const bars = buildSession({ breakUp: true });
    const now = isoAtNy(2026, 1, 15, 1, 30);
    const ev = evaluateGoldOrb(bars, DEFAULT_GOLD_ORB_CONFIG, now);
    expect(ev.status).toBe('signal');
    expect(ev.signal?.side).toBe('buy');
    expect(ev.signal?.riskReward).toBe(0.5);
    expect(ev.signal?.orbHigh).toBe(2002);
    expect(ev.signal?.orbLow).toBe(2000);
  });

  it('is outside-window before 01:15', () => {
    const bars = buildSession();
    const ev = evaluateGoldOrb(bars, DEFAULT_GOLD_ORB_CONFIG, isoAtNy(2026, 1, 15, 1, 10));
    expect(ev.status).toBe('outside-window');
  });
});

describe('backtestGoldOrb', () => {
  it('produces at least one trade on synthetic breakout day', () => {
    const bars = buildSession({ breakUp: true });
    const r = backtestGoldOrb(bars, DEFAULT_GOLD_ORB_CONFIG);
    expect(r.trades.length).toBeGreaterThanOrEqual(1);
    expect(r.trades[0]!.side).toBe('buy');
  });
});
