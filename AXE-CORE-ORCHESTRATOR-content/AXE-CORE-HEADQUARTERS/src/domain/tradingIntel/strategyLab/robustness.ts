/**
 * robustness — houdt een edge stand buiten de data waarop hij gevonden is?
 *
 * De hoogste historische opbrengst kiezen is de snelste manier om ruis te
 * kopen. Alles hier draait op dezelfde simulateAccount als de lab, en kiest
 * parameters alleen op TRAIN-data; wat erna gerapporteerd wordt (validatie,
 * test, walk-forward) heeft de keuze nooit gezien. Het verschil tussen train en
 * test ís de maat voor overfitting, en die staat vooraan.
 *
 * Kiezen gebeurt op gemiddelde R met een minimum aantal trades, niet op
 * totaalrendement: rendement beloont toevallig één grote trade.
 */
import { simulateAccount, type LabBar, type LabConfig, type LabMetrics, type LabSignal, type LabTrade } from './simulate';
import { atrAt, type OhlcLike } from './tradePlan';

export interface RobustInput {
  bars: readonly LabBar[];
  /** Signaal op index i van `bars` — causaal (signalNoLookahead.test). */
  signalAt: (i: number) => LabSignal;
  cfg: LabConfig;
}

export interface Range { from: number; to: number }
export interface SweepParams { atrMultiple: number; rewardRisk: number | null }
export interface SweepCell { params: SweepParams; metrics: LabMetrics }

export const MIN_TRADES_FOR_SELECTION = 30;
const WARMUP = 60;

/** Simuleer alleen bars[from..to], met hooguit 60 bars ervoor als opwarming. */
export function simulateRange(input: RobustInput, range: Range, params?: Partial<SweepParams>): ReturnType<typeof simulateAccount> {
  const start = Math.max(0, range.from - WARMUP);
  const bars = input.bars.slice(start, range.to + 1);
  return simulateAccount(bars, i => input.signalAt(start + i), {
    ...input.cfg,
    ...(params ?? {}),
    warmupBars: range.from - start,
  });
}

/** Aaneengesloten tijdsegmenten, bv. [0.6, 0.2, 0.2] → train / validatie / test. */
export function splitByTime(n: number, ratios: readonly number[]): Range[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  const usable = n - WARMUP;
  const out: Range[] = [];
  let at = WARMUP;
  ratios.forEach((r, k) => {
    const len = k === ratios.length - 1 ? n - at : Math.floor((usable * r) / sum);
    out.push({ from: at, to: at + len - 1 });
    at += len;
  });
  return out;
}

function parameterSweep(input: RobustInput, range: Range, grid: { atrMultiple: number[]; rewardRisk: Array<number | null> }): SweepCell[] {
  const cells: SweepCell[] = [];
  for (const atrMultiple of grid.atrMultiple) {
    for (const rewardRisk of grid.rewardRisk) {
      cells.push({ params: { atrMultiple, rewardRisk }, metrics: simulateRange(input, range, { atrMultiple, rewardRisk }).metrics });
    }
  }
  return cells;
}

/** De beste cel op gemiddelde R, alleen met genoeg trades; null als geen enkele cel genoeg heeft. */
export function selectBest(cells: readonly SweepCell[], minTrades = MIN_TRADES_FOR_SELECTION): SweepCell | null {
  const eligible = cells.filter(c => c.metrics.totalTrades >= minTrades);
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => (b.metrics.avgR > a.metrics.avgR ? b : a));
}

export interface SegmentReport { range: Range; metrics: LabMetrics; warnings: string[] }

function segment(input: RobustInput, range: Range, params: SweepParams): SegmentReport {
  const m = simulateRange(input, range, params).metrics;
  const warnings = m.totalTrades < MIN_TRADES_FOR_SELECTION ? [`only ${m.totalTrades} trades in this segment`] : [];
  return { range, metrics: m, warnings };
}

export interface TrainValTestReport {
  sweep: SweepCell[];
  chosen: SweepParams | null;
  train: SegmentReport | null;
  validation: SegmentReport | null;
  test: SegmentReport | null;
  /** avgR op train min avgR op test: hoeveel van de edge was aan de data aangepast. */
  degradationR: number | null;
  warnings: string[];
}

export function trainValidationTest(
  input: RobustInput,
  grid: { atrMultiple: number[]; rewardRisk: Array<number | null> },
  ratios: readonly [number, number, number] = [0.6, 0.2, 0.2],
): TrainValTestReport {
  const [trainR, valR, testR] = splitByTime(input.bars.length, ratios);
  const sweep = parameterSweep(input, trainR, grid);
  const best = selectBest(sweep);
  const warnings: string[] = [];
  if (!best) {
    warnings.push(`No parameter set reached ${MIN_TRADES_FOR_SELECTION} trades on the training segment — nothing to select`);
    return { sweep, chosen: null, train: null, validation: null, test: null, degradationR: null, warnings };
  }
  const train = segment(input, trainR, best.params);
  const validation = segment(input, valR, best.params);
  const test = segment(input, testR, best.params);
  const degradationR = train.metrics.avgR - test.metrics.avgR;
  if (test.metrics.avgR <= 0 && train.metrics.avgR > 0) warnings.push('The edge found on training data is gone on the untouched test segment');
  if (degradationR > 0.1) warnings.push(`Average R drops by ${degradationR.toFixed(2)} from train to test — likely fitted to the training data`);
  warnings.push(...validation.warnings.map(w => `validation: ${w}`), ...test.warnings.map(w => `test: ${w}`));
  return { sweep, chosen: best.params, train, validation, test, degradationR, warnings };
}

export interface WalkForwardFold { train: Range; test: Range; chosen: SweepParams | null; testMetrics: LabMetrics | null }
export interface WalkForwardReport {
  folds: WalkForwardFold[];
  /** Alleen de testvensters samen: trades, netto, gemiddelde R. */
  oos: { trades: number; netProfit: number; avgR: number; positiveFolds: number; scoredFolds: number };
  /** Hoe vaak dezelfde parameters gekozen werden: laag = instabiel. */
  paramStability: number;
  warnings: string[];
}

export function walkForward(
  input: RobustInput,
  grid: { atrMultiple: number[]; rewardRisk: Array<number | null> },
  folds = 4,
  trainFraction = 0.7,
): WalkForwardReport {
  const n = input.bars.length;
  const usable = n - WARMUP;
  const window = Math.floor(usable / (folds * (1 - trainFraction) + trainFraction));
  const testLen = Math.max(1, Math.floor(window * (1 - trainFraction)));
  const trainLen = window - testLen;
  const out: WalkForwardFold[] = [];
  for (let k = 0; k < folds; k++) {
    const trainFrom = WARMUP + k * testLen;
    const train: Range = { from: trainFrom, to: trainFrom + trainLen - 1 };
    const test: Range = { from: train.to + 1, to: Math.min(n - 1, train.to + testLen) };
    if (test.from > n - 1) break;
    const best = selectBest(parameterSweep(input, train, grid));
    out.push({ train, test, chosen: best?.params ?? null, testMetrics: best ? simulateRange(input, test, best.params).metrics : null });
  }
  const scored = out.filter(f => f.testMetrics);
  const trades = scored.reduce((s, f) => s + (f.testMetrics?.totalTrades ?? 0), 0);
  const netProfit = scored.reduce((s, f) => s + (f.testMetrics?.netProfit ?? 0), 0);
  const avgR = trades ? scored.reduce((s, f) => s + (f.testMetrics!.avgR * f.testMetrics!.totalTrades), 0) / trades : 0;
  const keys = scored.map(f => `${f.chosen!.atrMultiple}/${f.chosen!.rewardRisk}`);
  const mode = keys.length ? Math.max(...[...new Set(keys)].map(k => keys.filter(x => x === k).length)) : 0;
  const warnings: string[] = [];
  if (out.length - scored.length > 0) warnings.push(`${out.length - scored.length} fold(s) had too few trades to choose parameters`);
  if (trades < MIN_TRADES_FOR_SELECTION) warnings.push(`Only ${trades} out-of-sample trades in total`);
  if (keys.length > 1 && mode / keys.length < 0.5) warnings.push('Chosen parameters change from fold to fold — the optimum is not stable');
  return {
    folds: out,
    oos: { trades, netProfit, avgR, positiveFolds: scored.filter(f => f.testMetrics!.netProfit > 0).length, scoredFolds: scored.length },
    paramStability: keys.length ? mode / keys.length : 0,
    warnings,
  };
}

/** Kleine, deterministische RNG (mulberry32), zodat een bootstrap herhaalbaar is. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};

export interface BootstrapReport {
  iterations: number;
  finalReturn: { p5: number; p50: number; p95: number };
  maxDrawdown: { p5: number; p50: number; p95: number };
  probLoss: number;
  /** Kans dat de drawdown ergens boven de drempel komt. */
  probDrawdownOver: { threshold: number; p: number };
}

/**
 * Trekt met teruglegging uit de werkelijke trade-uitkomsten (in geld) en speelt
 * ze in willekeurige volgorde af. Toont hoeveel het resultaat van de volgorde en
 * van geluk afhing. Aanname: trades onafhankelijk — dat staat erbij.
 */
export function bootstrapTrades(
  pnls: readonly number[],
  startingBalance: number,
  opts: { iterations?: number; seed?: number; drawdownThreshold?: number } = {},
): BootstrapReport {
  const iterations = opts.iterations ?? 1000;
  const threshold = opts.drawdownThreshold ?? 0.1;
  const r = rng(opts.seed ?? 42);
  const finals: number[] = [];
  const dds: number[] = [];
  let over = 0;
  for (let k = 0; k < iterations; k++) {
    let bal = startingBalance; let peak = startingBalance; let dd = 0;
    for (let j = 0; j < pnls.length; j++) {
      bal += pnls[Math.floor(r() * pnls.length)];
      peak = Math.max(peak, bal);
      dd = Math.max(dd, peak > 0 ? (peak - bal) / peak : 0);
    }
    finals.push((bal - startingBalance) / startingBalance);
    dds.push(dd);
    if (dd > threshold) over += 1;
  }
  return {
    iterations,
    finalReturn: { p5: pct(finals, 0.05), p50: pct(finals, 0.5), p95: pct(finals, 0.95) },
    maxDrawdown: { p5: pct(dds, 0.05), p50: pct(dds, 0.5), p95: pct(dds, 0.95) },
    probLoss: pnls.length ? finals.filter(f => f < 0).length / iterations : 0,
    probDrawdownOver: { threshold, p: over / iterations },
  };
}

export type Trend = 'up' | 'down' | 'flat';
export type Vol = 'high' | 'low';
export interface RegimeRow { trend: Trend; vol: Vol; trades: number; winRate: number; avgR: number; netPnl: number; smallSample: boolean }

/**
 * Het regime bij de instap, uit bars t/m de signaalbar (niet later): trend uit
 * de verschuiving van een 50-bars gemiddelde over 10 bars in ATR, volatiliteit
 * uit ATR tegenover de mediane ATR tot dan.
 */
export function regimeBreakdown(bars: readonly LabBar[], trades: readonly LabTrade[]): RegimeRow[] {
  const ohlc: OhlcLike[] = bars.map(b => ({ o: b.open, h: b.high, l: b.low, c: b.close }));
  const atrs: Array<number | null> = bars.map((_, i) => atrAt(ohlc, i));
  const sma = (end: number) => {
    const s = bars.slice(Math.max(0, end - 49), end + 1);
    return s.reduce((x, b) => x + b.close, 0) / Math.max(1, s.length);
  };
  const regimeAt = (i: number): { trend: Trend; vol: Vol } => {
    // Trend in ATR-eenheden, niet in procenten: 0,2% is voor goud een rimpel en
    // voor EURUSD op h1 een zeldzaamheid. Een 50-bars gemiddelde dat in 10 bars
    // meer dan een halve ATR verschuift, heeft richting — op elk instrument.
    const a = atrs[i] ?? 0;
    const move = i >= 60 && a > 0 ? (sma(i) - sma(i - 10)) / a : 0;
    // Mediaan-ATR over bars 0..i: alleen wat op dat moment bekend was.
    const known = atrs.slice(0, i + 1).filter((x): x is number => x != null);
    return {
      trend: move > 0.5 ? 'up' : move < -0.5 ? 'down' : 'flat',
      vol: a > pct(known, 0.5) ? 'high' : 'low',
    };
  };
  const groups = new Map<string, { trend: Trend; vol: Vol; list: LabTrade[] }>();
  for (const t of trades) {
    const g = regimeAt(t.signalIndex);
    const key = `${g.trend}/${g.vol}`;
    if (!groups.has(key)) groups.set(key, { ...g, list: [] });
    groups.get(key)!.list.push(t);
  }
  return [...groups.values()].map(g => ({
    trend: g.trend, vol: g.vol, trades: g.list.length,
    winRate: g.list.filter(t => t.pnl > 0).length / g.list.length,
    avgR: g.list.reduce((s, t) => s + t.rMultiple, 0) / g.list.length,
    netPnl: g.list.reduce((s, t) => s + t.pnl, 0),
    smallSample: g.list.length < MIN_TRADES_FOR_SELECTION,
  })).sort((a, b) => b.trades - a.trades);
}

export interface Divergence { liveExpectancy: number; backtestExpectancy: number; gap: number; liveTrades: number; flagged: boolean; note: string }

/**
 * Live tegenover backtest voor één (paar, strategie, timeframe), uit het ledger.
 * Pas een oordeel vanaf 5 live trades (MIN_LIVE_SAMPLE van het ledger).
 */
export function liveVsBacktest(input: { liveTrades: number; liveNetReturnPct: number; backtestTrades: number; backtestNetReturnPct: number }): Divergence | null {
  if (input.backtestTrades <= 0) return null;
  const bt = input.backtestNetReturnPct / input.backtestTrades;
  const live = input.liveTrades > 0 ? input.liveNetReturnPct / input.liveTrades : 0;
  const gap = live - bt;
  const enough = input.liveTrades >= 5;
  return {
    liveExpectancy: live, backtestExpectancy: bt, gap, liveTrades: input.liveTrades,
    flagged: enough && (gap < -Math.abs(bt) * 0.5 || (bt > 0 && live <= 0)),
    note: !enough ? `only ${input.liveTrades} live trade(s) — not enough to judge`
      : bt > 0 && live <= 0 ? 'profitable in backtest, not live'
        : gap < -Math.abs(bt) * 0.5 ? 'live expectancy far below backtest' : 'live roughly in line with backtest',
  };
}
