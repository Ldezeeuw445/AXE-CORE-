/**
 * The six-phase decision funnel: 30 pairs in, two or three trades out.
 *
 * Every cycle the algo used to score whatever the scan rotation happened to
 * reach and trade whatever cleared a confidence bar. That answers "is this
 * pair worth trading" one pair at a time, and never "of everything in front of
 * me right now, which two are worth the risk" — which is the question a desk
 * actually asks, and the only one that can stop three correlated longs going
 * on at once.
 *
 * So this is a ranking, not a filter chain that happens to be six deep. Each
 * phase removes pairs for a stated reason and hands the survivors on, and
 * every dropped pair keeps the reason it was dropped, because a funnel you
 * cannot read backwards is a funnel you cannot correct.
 *
 * ## Pure on purpose
 *
 * No fetching, no clock, no storage. Everything a phase needs arrives in
 * [FunnelInput], so the whole pipeline can be tested against fixed numbers.
 * The gathering lives in application/tradingIntel/runDecisionFunnel.ts.
 *
 * ## A phase that cannot run says so
 *
 * Phase 2 needs an economic calendar and this build has none — the provider
 * answers "Only EOD data" to that endpoint. A missing input must never look
 * like a clean pass: an unavailable phase passes every pair through AND
 * reports `status: 'unavailable'`, so the panel shows a gap instead of a tick.
 * Silently passing is how a filter becomes decoration.
 */

export type PhaseId =
  | 'strength'
  | 'agenda'
  | 'correlation'
  | 'rrr'
  | 'liquidity'
  | 'vote';

export const PHASE_TITLES: Record<PhaseId, string> = {
  strength: 'Relative strength',
  agenda: 'Macro agenda',
  correlation: 'Correlation',
  rrr: 'Risk / reward',
  liquidity: 'Liquidity & spread',
  vote: 'Desk vote',
};

/** Which of the three coarse stages a phase belongs to, for the header. */
export const PHASE_STAGE: Record<PhaseId, 1 | 2 | 3> = {
  strength: 1, agenda: 1,
  correlation: 2, rrr: 2,
  liquidity: 3, vote: 3,
};

export interface FunnelInput {
  pairId: string;
  /** Oldest → newest. */
  closes: number[];
  highs: number[];
  lows: number[];
  /** (ask − bid) ÷ mid, as a fraction. null when no broker quote was readable. */
  spreadPct: number | null;
  /** High-impact release inside the next 48h. null means: no calendar at all. */
  eventWithin48h: boolean | null;
  /** What the desk concluded for this pair this cycle. */
  vote: 'buy' | 'sell' | 'hold' | null;
  voteConfidence: number | null;
}

export interface PairOutcome {
  pairId: string;
  passed: boolean;
  droppedAt: PhaseId | null;
  reason: string;
  /** Signed distance from the 50-period mean, in percent. */
  strength: number | null;
  atrPct: number | null;
  rrr: number | null;
  spreadPct: number | null;
  /** Which surviving pair this one duplicates, when correlation dropped it. */
  correlatedWith: string | null;
  vote: 'buy' | 'sell' | 'hold' | null;
  voteConfidence: number | null;
}

export interface PhaseResult {
  id: PhaseId;
  title: string;
  stage: 1 | 2 | 3;
  /** Survivors entering / leaving. */
  inCount: number;
  outCount: number;
  droppedIds: string[];
  status: 'ran' | 'unavailable';
  note: string;
}

export interface FunnelRun {
  phases: PhaseResult[];
  outcomes: PairOutcome[];
  finalists: string[];
  ranAt: string;
}

/* ------------------------------------------------------------------ maths */

/** Simple mean of the last `period` values, or null when there aren't enough. */
export function meanOfLast(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Average true range over `period`, as a fraction of the last close.
 *
 * Expressed as a percentage of price rather than in points so that gold at
 * 4 600 and EURUSD at 1.08 can be compared at all — an absolute ATR would rank
 * every index above every currency purely on notional size.
 */
export function atrPct(
  highs: number[], lows: number[], closes: number[], period = 14,
): number | null {
  const n = closes.length;
  if (n < period + 1 || highs.length !== n || lows.length !== n) return null;
  const trs: number[] = [];
  for (let i = n - period; i < n; i++) {
    const prevClose = closes[i - 1];
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose),
    ));
  }
  const atr = trs.reduce((a, b) => a + b, 0) / trs.length;
  const last = closes[n - 1];
  if (!(last > 0)) return null;
  return (atr / last) * 100;
}

/** Percent distance of the last close from its own 50-period mean. */
export function strengthScore(closes: number[], period = 50): number | null {
  const mean = meanOfLast(closes, period);
  const last = closes[closes.length - 1];
  if (mean == null || !(mean > 0) || last == null) return null;
  return ((last - mean) / mean) * 100;
}

/** Bar-to-bar returns, for correlating two pairs on shape rather than level. */
export function returnsOf(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    out.push(prev > 0 ? (closes[i] - prev) / prev : 0);
  }
  return out;
}

/** Pearson correlation over the overlapping tail of two series. */
export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((p, c) => p + c, 0) / n;
  const my = y.reduce((p, c) => p + c, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = x[i] - mx, ay = y[i] - my;
    num += ax * ay; dx += ax * ax; dy += ay * ay;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : null;
}

/**
 * Reward-to-risk from structure, not from a fixed multiple.
 *
 * Risk is 1.5 ATR — a stop close enough to be meaningful, far enough not to be
 * noise. Reward is the distance to the most recent swing extreme in the trade's
 * direction, because that is where price has actually turned before; when no
 * such level is in the window it falls back to 3 ATR rather than inventing one.
 */
export function rewardToRisk(
  highs: number[], lows: number[], closes: number[], direction: 'long' | 'short',
): number | null {
  const a = atrPct(highs, lows, closes, 14);
  const last = closes[closes.length - 1];
  if (a == null || !(last > 0)) return null;
  const atrAbs = (a / 100) * last;
  if (!(atrAbs > 0)) return null;

  const risk = 1.5 * atrAbs;

  // The last few bars are excluded from the search, and a level has to sit a
  // real distance away to count at all.
  //
  // Without both, a clean trend scores absurdly: the highest high in the
  // window IS the current bar, so "distance to the swing high" is the height
  // of the candle you are standing on. Measured on a 0.5%-per-bar uptrend that
  // gave 0.31:1, below the 2:1 floor — so every trending pair, the exact thing
  // phase 1 selects for, would have been thrown out one phase later and the
  // funnel would pass nothing.
  //
  // When price is already at the extreme there is no overhead level to aim at;
  // that is a breakout, and a breakout is measured, not targeted. Three ATR is
  // the measured move.
  const RECENT_BARS_EXCLUDED = 3;
  const MIN_LEVEL_DISTANCE_ATR = 0.5;
  const window = 40;
  const hs = highs.slice(-window, -RECENT_BARS_EXCLUDED);
  const ls = lows.slice(-window, -RECENT_BARS_EXCLUDED);
  if (!hs.length || !ls.length) return 3 * atrAbs / risk;

  let reward: number;
  if (direction === 'long') {
    const swingHigh = Math.max(...hs);
    const gap = swingHigh - last;
    reward = gap > MIN_LEVEL_DISTANCE_ATR * atrAbs ? gap : 3 * atrAbs;
  } else {
    const swingLow = Math.min(...ls);
    const gap = last - swingLow;
    reward = gap > MIN_LEVEL_DISTANCE_ATR * atrAbs ? gap : 3 * atrAbs;
  }
  return reward / risk;
}

/* ----------------------------------------------------------------- phases */

/** Below this the pair is drifting sideways and phase 1 drops it. */
export const SIDEWAYS_BAND_PCT = 0.35;
/** Two pairs this alike are the same bet twice. */
export const CORRELATION_LIMIT = 0.85;
/** Anything that cannot pay two to one is not worth the slot. */
export const MIN_RRR = 2;
/** A spread worth more than this share of the stop is eating the edge. */
export const MAX_SPREAD_SHARE_OF_STOP = 0.1;
/** How many trades a cycle may actually put on. */
export const MAX_FINALISTS = 3;

interface Working extends PairOutcome {
  closes: number[];
  highs: number[];
  lows: number[];
  eventWithin48h: boolean | null;
}

function phase(
  id: PhaseId, inCount: number, survivors: Working[], dropped: Working[], note: string,
  status: 'ran' | 'unavailable' = 'ran',
): PhaseResult {
  return {
    id,
    title: PHASE_TITLES[id],
    stage: PHASE_STAGE[id],
    inCount,
    outCount: survivors.length,
    droppedIds: dropped.map(d => d.pairId),
    status,
    note,
  };
}

function drop(w: Working, at: PhaseId, reason: string): void {
  w.passed = false;
  w.droppedAt = at;
  w.reason = reason;
}

/**
 * Run all six phases.
 *
 * `direction` per pair comes from its own strength: a pair above its mean is
 * assessed as a long, one below it as a short. Judging every pair as a long
 * would make the whole short half of the book score badly for the wrong reason.
 */
export function runFunnel(inputs: FunnelInput[], now = new Date()): FunnelRun {
  const work: Working[] = inputs.map(i => ({
    pairId: i.pairId,
    passed: true,
    droppedAt: null,
    reason: '',
    strength: strengthScore(i.closes),
    atrPct: atrPct(i.highs, i.lows, i.closes),
    rrr: null,
    spreadPct: i.spreadPct,
    correlatedWith: null,
    vote: i.vote,
    voteConfidence: i.voteConfidence,
    closes: i.closes,
    highs: i.highs,
    lows: i.lows,
    eventWithin48h: i.eventWithin48h,
  }));

  const phases: PhaseResult[] = [];
  let live = work.filter(w => w.passed);

  // ---- 1. Relative strength -------------------------------------------
  // Sideways first, then keep the strongest and weakest halves: the point is
  // the extremes on both sides, not "most bullish", or every short setup would
  // be filtered out for being weak.
  {
    const inCount = live.length;
    const dropped: Working[] = [];
    for (const w of live) {
      if (w.strength == null) {
        drop(w, 'strength', 'not enough history to judge trend');
        dropped.push(w);
      } else if (Math.abs(w.strength) < SIDEWAYS_BAND_PCT) {
        drop(w, 'strength', `sideways — ${w.strength.toFixed(2)}% from its mean`);
        dropped.push(w);
      }
    }
    let survivors = live.filter(w => w.passed);
    // Halve what is left, keeping the most extreme movers either way.
    const keepCount = Math.max(1, Math.ceil(survivors.length / 2));
    survivors.sort((a, b) => Math.abs(b.strength!) - Math.abs(a.strength!));
    for (const w of survivors.slice(keepCount)) {
      drop(w, 'strength', `weaker move than the ${keepCount} kept (${w.strength!.toFixed(2)}%)`);
      dropped.push(w);
    }
    survivors = survivors.slice(0, keepCount);
    phases.push(phase('strength', inCount, survivors, dropped,
      `Kept the ${survivors.length} strongest moves either way; dropped anything inside ±${SIDEWAYS_BAND_PCT}%.`));
    live = survivors;
  }

  // ---- 2. Macro agenda -------------------------------------------------
  {
    const inCount = live.length;
    const haveCalendar = live.some(w => w.eventWithin48h !== null);
    if (!haveCalendar) {
      phases.push(phase('agenda', inCount, live, [],
        'No economic calendar in this build — every pair passed unchecked. This is a gap, not a clean sweep.',
        'unavailable'));
    } else {
      const dropped: Working[] = [];
      for (const w of live) {
        if (w.eventWithin48h === true) {
          drop(w, 'agenda', 'high-impact release inside 48h');
          dropped.push(w);
        }
      }
      const survivors = live.filter(w => w.passed);
      phases.push(phase('agenda', inCount, survivors, dropped,
        `${dropped.length} pair(s) held back for a release inside 48 hours.`));
      live = survivors;
    }
  }

  // ---- 3. Correlation --------------------------------------------------
  // Keep the strongest of each cluster. Three pairs moving as one is one bet
  // at triple size, which is exactly the risk nobody chose to take.
  {
    const inCount = live.length;
    const dropped: Working[] = [];
    const rets = new Map(live.map(w => [w.pairId, returnsOf(w.closes)]));
    const ranked = [...live].sort((a, b) => Math.abs(b.strength!) - Math.abs(a.strength!));
    const kept: Working[] = [];
    for (const cand of ranked) {
      let clash: { other: Working; r: number } | null = null;
      for (const k of kept) {
        const r = correlation(rets.get(cand.pairId) ?? [], rets.get(k.pairId) ?? []);
        if (r != null && Math.abs(r) >= CORRELATION_LIMIT) { clash = { other: k, r }; break; }
      }
      if (clash) {
        cand.correlatedWith = clash.other.pairId;
        drop(cand, 'correlation', `moves with ${clash.other.pairId} (r=${clash.r.toFixed(2)}) — same bet twice`);
        dropped.push(cand);
      } else {
        kept.push(cand);
      }
    }
    phases.push(phase('correlation', inCount, kept, dropped,
      `${dropped.length} duplicate(s) of a stronger pair removed at r ≥ ${CORRELATION_LIMIT}.`));
    live = kept;
  }

  // ---- 4. Risk / reward -------------------------------------------------
  {
    const inCount = live.length;
    const dropped: Working[] = [];
    for (const w of live) {
      const dir = (w.strength ?? 0) >= 0 ? 'long' : 'short';
      w.rrr = rewardToRisk(w.highs, w.lows, w.closes, dir);
      if (w.rrr == null) {
        drop(w, 'rrr', 'no usable levels to measure reward against');
        dropped.push(w);
      } else if (w.rrr < MIN_RRR) {
        drop(w, 'rrr', `only ${w.rrr.toFixed(2)}:1 — below ${MIN_RRR}:1`);
        dropped.push(w);
      }
    }
    const survivors = live.filter(w => w.passed).sort((a, b) => (b.rrr ?? 0) - (a.rrr ?? 0));
    phases.push(phase('rrr', inCount, survivors, dropped,
      `Ranked by reward-to-risk; anything under ${MIN_RRR}:1 dropped.`));
    live = survivors;
  }

  // ---- 5. Liquidity & spread -------------------------------------------
  {
    const inCount = live.length;
    const dropped: Working[] = [];
    const anyQuote = live.some(w => w.spreadPct !== null);
    for (const w of live) {
      if (w.spreadPct == null || w.atrPct == null) continue; // unknown is not a no
      const stopPct = 1.5 * w.atrPct;
      if (stopPct <= 0) continue;
      const share = w.spreadPct / stopPct;
      if (share > MAX_SPREAD_SHARE_OF_STOP) {
        drop(w, 'liquidity', `spread is ${(share * 100).toFixed(0)}% of the stop — too expensive`);
        dropped.push(w);
      }
    }
    const survivors = live.filter(w => w.passed);
    phases.push(phase('liquidity', inCount, survivors, dropped,
      anyQuote
        ? `${dropped.length} pair(s) dropped for a spread over ${MAX_SPREAD_SHARE_OF_STOP * 100}% of the stop.`
        : 'No broker quotes readable — spread could not be checked on any pair.',
      anyQuote ? 'ran' : 'unavailable'));
    live = survivors;
  }

  // ---- 6. Desk vote -----------------------------------------------------
  // The agents get the last word, and a hold is a no. Ties break on
  // reward-to-risk, which is already sorted above.
  {
    const inCount = live.length;
    const dropped: Working[] = [];
    const anyVote = live.some(w => w.vote !== null);
    for (const w of live) {
      if (w.vote === 'hold') {
        drop(w, 'vote', 'desk voted hold');
        dropped.push(w);
      } else if (w.vote != null && (w.strength ?? 0) >= 0 && w.vote === 'sell') {
        drop(w, 'vote', 'desk wants short on a pair trending up — no agreement');
        dropped.push(w);
      } else if (w.vote != null && (w.strength ?? 0) < 0 && w.vote === 'buy') {
        drop(w, 'vote', 'desk wants long on a pair trending down — no agreement');
        dropped.push(w);
      }
    }
    let survivors = live.filter(w => w.passed);
    for (const w of survivors.slice(MAX_FINALISTS)) {
      drop(w, 'vote', `ranked below the top ${MAX_FINALISTS} this cycle`);
      dropped.push(w);
    }
    survivors = survivors.slice(0, MAX_FINALISTS);
    phases.push(phase('vote', inCount, survivors, dropped,
      anyVote
        ? `Top ${MAX_FINALISTS} after agreement between the trend and the desk.`
        : 'No desk vote this cycle — ranking carried through on reward-to-risk alone.',
      anyVote ? 'ran' : 'unavailable'));
    live = survivors;
  }

  // The series and the calendar flag were only ever working state; the
  // outcome carries the verdict and the numbers behind it, not the inputs.
  const outcomes: PairOutcome[] = work.map(w => ({
    pairId: w.pairId,
    passed: w.passed,
    droppedAt: w.droppedAt,
    reason: w.passed ? 'cleared every phase' : w.reason,
    strength: w.strength,
    atrPct: w.atrPct,
    rrr: w.rrr,
    spreadPct: w.spreadPct,
    correlatedWith: w.correlatedWith,
    vote: w.vote,
    voteConfidence: w.voteConfidence,
  }));

  return {
    phases,
    outcomes,
    finalists: live.map(w => w.pairId),
    ranAt: now.toISOString(),
  };
}
