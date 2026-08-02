/**
 * SMC zone detection — FVG, inverse FVG, order blocks, PDH/PDL.
 * Logic aligned with Companion ChartIndicatorLayer concepts (ICT-style).
 */

export type Bar = { time: number; open: number; high: number; low: number; close: number };

export type SmcZone = {
  kind: 'fvg' | 'ifvg' | 'ob' | 'pdh' | 'pdl';
  dir: 'up' | 'down' | 'neutral';
  top: number;
  bottom: number;
  startIndex: number;
  endIndex: number;
  label: string;
};

/** 3-candle fair value gap */
export function detectFvgs(bars: Bar[], maxEach = 3): SmcZone[] {
  const out: SmcZone[] = [];
  for (let i = 2; i < bars.length; i++) {
    const a = bars[i - 2];
    const c = bars[i];
    // Bullish FVG: gap between a.high and c.low
    if (c.low > a.high) {
      out.push({
        kind: 'fvg',
        dir: 'up',
        top: c.low,
        bottom: a.high,
        startIndex: i - 2,
        endIndex: i,
        label: 'FVG',
      });
    }
    // Bearish FVG
    if (c.high < a.low) {
      out.push({
        kind: 'fvg',
        dir: 'down',
        top: a.low,
        bottom: c.high,
        startIndex: i - 2,
        endIndex: i,
        label: 'FVG',
      });
    }
  }
  const bull = out.filter(z => z.dir === 'up').slice(-maxEach);
  const bear = out.filter(z => z.dir === 'down').slice(-maxEach);
  return [...bull, ...bear];
}

/** Inverse FVG: original FVG later broken through mid */
export function detectIfvgs(bars: Bar[], maxEach = 2): SmcZone[] {
  const fvgs = detectFvgs(bars, 12);
  const out: SmcZone[] = [];
  for (const z of fvgs) {
    const mid = (z.top + z.bottom) / 2;
    for (let j = z.endIndex + 1; j < bars.length; j++) {
      const b = bars[j];
      if (z.dir === 'up' && b.close < mid) {
        out.push({ ...z, kind: 'ifvg', dir: 'down', label: 'iFVG' });
        break;
      }
      if (z.dir === 'down' && b.close > mid) {
        out.push({ ...z, kind: 'ifvg', dir: 'up', label: 'iFVG' });
        break;
      }
    }
  }
  const up = out.filter(z => z.dir === 'up').slice(-maxEach);
  const dn = out.filter(z => z.dir === 'down').slice(-maxEach);
  return [...up, ...dn];
}

/** Last impulse candle before opposite move → order block */
export function detectOrderBlocks(bars: Bar[], maxEach = 2): SmcZone[] {
  const out: SmcZone[] = [];
  for (let i = 3; i < bars.length - 1; i++) {
    const b = bars[i];
    const next = bars[i + 1];
    const body = Math.abs(b.close - b.open);
    const range = b.high - b.low || 1e-9;
    if (body / range < 0.55) continue;
    // Bullish OB: down close then strong up displacement
    if (b.close < b.open && next.close > next.open && next.close > b.high) {
      out.push({
        kind: 'ob',
        dir: 'up',
        top: Math.max(b.open, b.close),
        bottom: Math.min(b.open, b.close),
        startIndex: i,
        endIndex: i,
        label: 'OB',
      });
    }
    // Bearish OB
    if (b.close > b.open && next.close < next.open && next.close < b.low) {
      out.push({
        kind: 'ob',
        dir: 'down',
        top: Math.max(b.open, b.close),
        bottom: Math.min(b.open, b.close),
        startIndex: i,
        endIndex: i,
        label: 'OB',
      });
    }
  }
  const bull = out.filter(z => z.dir === 'up').slice(-maxEach);
  const bear = out.filter(z => z.dir === 'down').slice(-maxEach);
  return [...bull, ...bear];
}

/** Previous day high / low from daily-ish segmentation via session gaps (heuristic on H1+) */
export function detectPdhPdl(bars: Bar[]): SmcZone[] {
  if (bars.length < 24) return [];
  // Use last ~24 bars as "previous session" proxy when TF is H1
  const slice = bars.slice(-48, -24);
  if (slice.length < 5) return [];
  let hi = -Infinity;
  let lo = Infinity;
  let hiI = 0;
  let loI = 0;
  slice.forEach((b, i) => {
    if (b.high > hi) {
      hi = b.high;
      hiI = i;
    }
    if (b.low < lo) {
      lo = b.low;
      loI = i;
    }
  });
  const base = bars.length - 48;
  return [
    {
      kind: 'pdh',
      dir: 'neutral',
      top: hi,
      bottom: hi,
      startIndex: base + hiI,
      endIndex: bars.length - 1,
      label: 'PDH',
    },
    {
      kind: 'pdl',
      dir: 'neutral',
      top: lo,
      bottom: lo,
      startIndex: base + loI,
      endIndex: bars.length - 1,
      label: 'PDL',
    },
  ];
}

/** Classic fib levels between last swing high/low */
export function fibLevels(bars: Bar[]): { price: number; label: string }[] {
  if (bars.length < 10) return [];
  const window = bars.slice(-80);
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of window) {
    hi = Math.max(hi, b.high);
    lo = Math.min(lo, b.low);
  }
  const span = hi - lo;
  if (!(span > 0)) return [];
  const ratios = [
    [0, '0%'],
    [0.236, '23.6%'],
    [0.382, '38.2%'],
    [0.5, '50%'],
    [0.618, '61.8%'],
    [0.786, '78.6%'],
    [1, '100%'],
  ] as const;
  return ratios.map(([r, label]) => ({ price: hi - span * r, label: `Fib ${label}` }));
}

export function detectAllSmc(bars: Bar[]) {
  return {
    zones: [
      ...detectFvgs(bars),
      ...detectIfvgs(bars),
      ...detectOrderBlocks(bars),
      ...detectPdhPdl(bars),
    ],
    fib: fibLevels(bars),
  };
}
