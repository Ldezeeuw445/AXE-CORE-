/**
 * SMC zone detection — FVG, inverse FVG, order blocks, PDH/PDL.
 * Logic aligned with Companion ChartIndicatorLayer concepts (ICT-style).
 */

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };

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
    if (c.low > a.high) {
      out.push({ kind: 'fvg', dir: 'up', top: c.low, bottom: a.high, startIndex: i - 2, endIndex: i, label: 'FVG' });
    }
    if (c.high < a.low) {
      out.push({ kind: 'fvg', dir: 'down', top: a.low, bottom: c.high, startIndex: i - 2, endIndex: i, label: 'FVG' });
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
    const a = bars[i - 1];
    const c = bars[i + 1];
    if (a.close < a.open && c.close > c.open && c.close > a.high) {
      out.push({ kind: 'ob', dir: 'up', top: a.high, bottom: a.low, startIndex: i - 1, endIndex: i + 1, label: 'OB↑' });
    }
    if (a.close > a.open && c.close < c.open && c.close < a.low) {
      out.push({ kind: 'ob', dir: 'down', top: a.high, bottom: a.low, startIndex: i - 1, endIndex: i + 1, label: 'OB↓' });
    }
  }
  const bull = out.filter(z => z.dir === 'up').slice(-maxEach);
  const bear = out.filter(z => z.dir === 'down').slice(-maxEach);
  return [...bull, ...bear];
}

/** Previous day high / low from mid-session window */
export function detectPdhPdl(bars: Bar[]): SmcZone[] {
  if (bars.length < 30) return [];
  const slice = bars.slice(-48, -24);
  if (slice.length < 4) return [];
  const hi = Math.max(...slice.map(b => b.high));
  const lo = Math.min(...slice.map(b => b.low));
  return [
    { kind: 'pdh', dir: 'neutral', top: hi, bottom: hi, startIndex: 0, endIndex: bars.length - 1, label: 'PDH' },
    { kind: 'pdl', dir: 'neutral', top: lo, bottom: lo, startIndex: 0, endIndex: bars.length - 1, label: 'PDL' },
  ];
}

export type FibLevel = { label: string; price: number };

export function detectFib(bars: Bar[]): FibLevel[] {
  if (bars.length < 10) return [];
  const slice = bars.slice(-40);
  const hi = Math.max(...slice.map(b => b.high));
  const lo = Math.min(...slice.map(b => b.low));
  const range = hi - lo;
  if (!(range > 0)) return [];
  return [
    { label: '0%', price: hi },
    { label: '23.6%', price: hi - range * 0.236 },
    { label: '38.2%', price: hi - range * 0.382 },
    { label: '50%', price: hi - range * 0.5 },
    { label: '61.8%', price: hi - range * 0.618 },
    { label: '78.6%', price: hi - range * 0.786 },
    { label: '100%', price: lo },
  ];
}

export function detectAllSmc(bars: Bar[]) {
  return {
    zones: [
      ...detectFvgs(bars),
      ...detectIfvgs(bars),
      ...detectOrderBlocks(bars),
      ...detectPdhPdl(bars),
    ],
    fib: detectFib(bars),
  };
}
