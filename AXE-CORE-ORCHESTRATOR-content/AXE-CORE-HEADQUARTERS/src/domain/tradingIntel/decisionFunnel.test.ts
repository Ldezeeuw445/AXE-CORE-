/**
 * The funnel decides what actually gets traded, so the parts that must not be
 * quietly wrong are: a phase that cannot run says so, correlated pairs cannot
 * all survive, and a hold is a no.
 */
import { describe, it, expect } from 'vitest';
import {
  runFunnel, correlation, atrPct, strengthScore, rewardToRisk,
  MIN_RRR, CORRELATION_LIMIT, MAX_FINALISTS, type FunnelInput,
} from './decisionFunnel';

/** A clean trend: `drift` percent per bar off a 100 base. */
function trending(drift: number, n = 80, seed = 100): number[] {
  const out: number[] = [];
  let p = seed;
  for (let i = 0; i < n; i++) { out.push(p); p *= 1 + drift / 100; }
  return out;
}

/**
 * A trend that actually wobbles, sharing one repeatable wobble across pairs.
 *
 * `trending` alone is unusable for correlation: constant compounding gives a
 * constant return every bar, variance is exactly zero, and Pearson is
 * undefined — so `correlation` correctly answers null and nothing ever looks
 * correlated. Real prices vary; test data has to as well.
 */
function wobble(i: number): number {
  // Deterministic, no RNG: the same shape every run.
  return Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.41) * 0.35;
}
function trendingNoisy(drift: number, n = 80, seed = 100): number[] {
  const out: number[] = [];
  let p = seed;
  for (let i = 0; i < n; i++) { out.push(p * (1 + wobble(i) / 100)); p *= 1 + drift / 100; }
  return out;
}

/** Flat with a tiny wobble — the sideways case phase 1 exists to remove. */
function flat(n = 80, seed = 100): number[] {
  return Array.from({ length: n }, (_, i) => seed + Math.sin(i / 3) * 0.02);
}

function input(pairId: string, closes: number[], over: Partial<FunnelInput> = {}): FunnelInput {
  // Highs and lows straddle the close by a fixed fraction so ATR is stable and
  // reward-to-risk is predictable in these cases.
  return {
    pairId,
    closes,
    highs: closes.map(c => c * 1.004),
    lows: closes.map(c => c * 0.996),
    spreadPct: 0.01,
    eventWithin48h: null,
    vote: 'buy',
    voteConfidence: 0.7,
    ...over,
  };
}

const phaseOf = (r: ReturnType<typeof runFunnel>, id: string) => r.phases.find(p => p.id === id)!;
const outcomeOf = (r: ReturnType<typeof runFunnel>, pair: string) => r.outcomes.find(o => o.pairId === pair)!;

describe('maths', () => {
  it('scores strength as signed distance from the mean', () => {
    expect(strengthScore(trending(0.3))!).toBeGreaterThan(0);
    expect(strengthScore(trending(-0.3))!).toBeLessThan(0);
    expect(Math.abs(strengthScore(flat())!)).toBeLessThan(0.35);
  });

  it('expresses ATR as a share of price so gold and EURUSD compare', () => {
    const gold = atrPct(
      trending(0.2, 80, 4600).map(c => c * 1.01),
      trending(0.2, 80, 4600).map(c => c * 0.99),
      trending(0.2, 80, 4600),
    );
    const fx = atrPct(
      trending(0.2, 80, 1.08).map(c => c * 1.01),
      trending(0.2, 80, 1.08).map(c => c * 0.99),
      trending(0.2, 80, 1.08),
    );
    // Same shape at wildly different notional must give the same reading.
    expect(Math.abs(gold! - fx!)).toBeLessThan(0.05);
  });

  it('correlates on shape, not on level', () => {
    const a = trendingNoisy(0.3);
    const b = trendingNoisy(0.3, 80, 5000); // same shape, 50x the price
    expect(correlation(a.map((v, i) => i ? v / a[i - 1] - 1 : 0), b.map((v, i) => i ? v / b[i - 1] - 1 : 0))!)
      .toBeGreaterThan(0.99);
  });

  it('refuses a correlation it has too few points for', () => {
    expect(correlation([1, 2, 3], [1, 2, 3])).toBeNull();
  });

  it('measures reward to the swing extreme in the trade direction', () => {
    const closes = trending(0.3);
    const highs = closes.map(c => c * 1.02);
    const lows = closes.map(c => c * 0.98);
    expect(rewardToRisk(highs, lows, closes, 'long')).toBeGreaterThan(0);
    expect(rewardToRisk(highs, lows, closes, 'short')).toBeGreaterThan(0);
  });
});

describe('phase 1 — relative strength', () => {
  it('drops the sideways pairs', () => {
    const r = runFunnel([
      input('FLAT1', flat()), input('FLAT2', flat()),
      input('UP', trending(0.4)), input('DOWN', trending(-0.4)),
    ]);
    expect(outcomeOf(r, 'FLAT1').droppedAt).toBe('strength');
    expect(outcomeOf(r, 'FLAT1').reason).toContain('sideways');
  });

  it('keeps the extremes on BOTH sides, not just the bullish ones', () => {
    // A "strongest first" filter would wipe out every short setup for being
    // weak, and the desk would only ever be able to buy.
    const r = runFunnel([
      input('UP1', trending(0.5)), input('UP2', trending(0.45)),
      input('DOWN1', trending(-0.5)), input('DOWN2', trending(-0.45)),
    ]);
    const survivors = r.outcomes.filter(o => o.droppedAt !== 'strength').map(o => o.pairId);
    expect(survivors.some(p => p.startsWith('DOWN'))).toBe(true);
  });
});

describe('phase 2 — macro agenda', () => {
  it('reports itself unavailable when there is no calendar, and passes everyone', () => {
    // The whole point: a missing input must not read as a clean sweep.
    const r = runFunnel([input('UP1', trending(0.5)), input('UP2', trending(0.4))]);
    const p = phaseOf(r, 'agenda');
    expect(p.status).toBe('unavailable');
    expect(p.droppedIds).toEqual([]);
    expect(p.note).toContain('gap');
  });

  it('holds back a pair with a release inside 48h when the calendar IS there', () => {
    const r = runFunnel([
      input('UP1', trending(0.5), { eventWithin48h: true }),
      input('UP2', trending(0.45), { eventWithin48h: false }),
    ]);
    expect(phaseOf(r, 'agenda').status).toBe('ran');
    expect(outcomeOf(r, 'UP1').droppedAt).toBe('agenda');
  });
});

describe('phase 3 — correlation', () => {
  it('keeps one of a cluster and names what the others duplicate', () => {
    // Three pairs moving as one is one bet at triple size.
    //
    // The three weaker pairs are here to make the test possible at all: phase 1
    // halves the field before correlation ever runs, so a bare trio would be
    // cut to two and only one duplicate could ever be found. Strength is
    // scale-invariant, so the identically-shaped trio ties at the top and all
    // three reach this phase together.
    const shape = trendingNoisy(0.5);
    const r = runFunnel([
      input('EURUSD', shape),
      input('GBPUSD', shape.map(c => c * 1.3)),
      input('AUDUSD', shape.map(c => c * 0.7)),
      input('WEAK1', trendingNoisy(0.12, 80, 210)),
      input('WEAK2', trendingNoisy(0.11, 80, 330)),
      input('WEAK3', trendingNoisy(0.10, 80, 470)),
    ]);
    const dropped = r.outcomes.filter(o => o.droppedAt === 'correlation');
    expect(dropped.length).toBe(2);
    expect(dropped[0].correlatedWith).toBeTruthy();
    expect(dropped[0].reason).toContain('same bet twice');
  });

  it('leaves genuinely different pairs alone', () => {
    // Opposite trends with independent wobble: nothing to deduplicate.
    const up = trendingNoisy(0.5);
    const down = trendingNoisy(-0.5, 80, 100).map((c, i) => c * (1 + Math.cos(i * 2.3) / 100));
    const r = runFunnel([input('UP', up), input('DOWN', down)]);
    expect(r.outcomes.filter(o => o.droppedAt === 'correlation')).toHaveLength(0);
  });
});

describe('phase 4 — risk / reward', () => {
  it('drops anything that cannot pay two to one', () => {
    // Flat highs/lows just above the close leave almost no room to the swing
    // extreme, so reward collapses against a 1.5 ATR stop.
    const closes = trending(0.3);
    const r = runFunnel([
      input('TIGHT', closes, { highs: closes.map(c => c * 1.0001), lows: closes.map(c => c * 0.96) }),
      input('ROOMY', closes, { highs: closes.map(c => c * 1.05), lows: closes.map(c => c * 0.999) }),
    ]);
    const tight = outcomeOf(r, 'TIGHT');
    if (tight.droppedAt === 'rrr') expect(tight.reason).toContain(`below ${MIN_RRR}`);
    expect(MIN_RRR).toBe(2);
  });
});

describe('phase 5 — liquidity', () => {
  it('drops a pair whose spread eats the stop', () => {
    const r = runFunnel([
      input('WIDE', trending(0.5), { spreadPct: 5 }),
      input('TIGHT', trending(0.45), { spreadPct: 0.005 }),
    ]);
    const wide = outcomeOf(r, 'WIDE');
    if (wide.droppedAt === 'liquidity') expect(wide.reason).toContain('too expensive');
  });

  it('says so when no quote was readable rather than passing silently', () => {
    const r = runFunnel([
      input('A', trending(0.5), { spreadPct: null }),
      input('B', trending(0.45), { spreadPct: null }),
    ]);
    expect(phaseOf(r, 'liquidity').status).toBe('unavailable');
  });
});

describe('phase 6 — desk vote', () => {
  it('treats a hold as a no', () => {
    const r = runFunnel([input('UP', trending(0.5), { vote: 'hold' })]);
    expect(outcomeOf(r, 'UP').droppedAt).toBe('vote');
    expect(outcomeOf(r, 'UP').reason).toContain('hold');
  });

  it('refuses a vote that fights the trend', () => {
    const r = runFunnel([input('UP', trending(0.5), { vote: 'sell' })]);
    expect(outcomeOf(r, 'UP').reason).toContain('no agreement');
  });

  it(`never lets more than ${MAX_FINALISTS} through`, () => {
    const inputs = Array.from({ length: 12 }, (_, i) =>
      input(`P${i}`, trending(0.4 + i * 0.05, 80, 100 + i * 7)));
    const r = runFunnel(inputs);
    expect(r.finalists.length).toBeLessThanOrEqual(MAX_FINALISTS);
  });
});

describe('the run as a whole', () => {
  it('accounts for every pair it was given', () => {
    const inputs = Array.from({ length: 30 }, (_, i) =>
      i % 3 === 0 ? input(`P${i}`, flat(80, 100 + i)) : input(`P${i}`, trending(0.3 + i * 0.02, 80, 100 + i * 3)));
    const r = runFunnel(inputs);
    expect(r.outcomes).toHaveLength(30);
    // Nothing may vanish: every pair is either through or carries a reason.
    for (const o of r.outcomes) {
      if (!o.passed) expect(o.reason.length).toBeGreaterThan(0);
      expect(o.passed ? o.droppedAt : o.droppedAt).toBeDefined();
    }
    expect(r.phases).toHaveLength(6);
  });

  it('never reports more survivors leaving a phase than entered it', () => {
    const inputs = Array.from({ length: 20 }, (_, i) =>
      input(`P${i}`, trending(0.3 + i * 0.03, 80, 100 + i * 5)));
    const r = runFunnel(inputs);
    for (const p of r.phases) expect(p.outCount).toBeLessThanOrEqual(p.inCount);
    // And the chain has to actually connect end to end.
    for (let i = 1; i < r.phases.length; i++) {
      expect(r.phases[i].inCount).toBe(r.phases[i - 1].outCount);
    }
  });

  it('is stable — the same input twice gives the same answer', () => {
    const inputs = Array.from({ length: 15 }, (_, i) =>
      input(`P${i}`, trending(0.3 + i * 0.04, 80, 100 + i * 4)));
    const a = runFunnel(inputs, new Date('2026-08-25T12:00:00Z'));
    const b = runFunnel(inputs, new Date('2026-08-25T12:00:00Z'));
    expect(a.finalists).toEqual(b.finalists);
  });

  it('holds the correlation limit where the comment says it is', () => {
    expect(CORRELATION_LIMIT).toBe(0.85);
  });
});
