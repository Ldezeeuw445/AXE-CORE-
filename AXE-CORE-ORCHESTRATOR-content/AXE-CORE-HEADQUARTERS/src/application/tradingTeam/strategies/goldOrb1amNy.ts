/**
 * Gold ORB 1AM NY — Opening Range Breakout on XAUUSD 5m (demo TEST).
 * Spec: SETUP.md § Strategie-module: Gold ORB 1AM NY.
 *
 * ORB = high/low of 01:00–01:15 America/New_York.
 * Entry: 5m close outside range → market at open of next bar, only 01:15–03:40.
 * SL = opposite side of range. TP = 0.5R.
 * Max 2 trades/day; second only after first closed; reversal OK; flat by 06:00 NY.
 * Filters: trend, extension, volatility, volume, candle quality, VWAP.
 * Default: only Volatility ON (reel-style); rejection kills the whole NY day.
 */
import { estimateInstrument } from '@/domain/tradingIntel/strategyLab/instrumentEstimate';
import { sizeLotsForRisk } from '@/domain/tradingIntel/positionSizing';
import type {
  FilterMode,
  StrategyBar,
  StrategyEvaluation,
  StrategyFilterResult,
  StrategyModule,
  StrategySignal,
  StrategySide,
} from './types';

export const GOLD_ORB_STRATEGY_ID = 'gold-orb-1am-ny';
export const GOLD_ORB_SYMBOL = 'XAUUSD';
export const GOLD_ORB_TIMEFRAME = 'm5';

export interface GoldOrbFilterFlags {
  trend: boolean;
  extension: boolean;
  volatility: boolean;
  volume: boolean;
  candleQuality: boolean;
  vwap: boolean;
}

export interface GoldOrbConfig {
  symbol: string;
  /** Account equity used for % risk sizing (demo 500k). */
  equity: number;
  /** Risk per trade as % of equity (demo default 0.35). */
  riskPercent: number;
  maxLots: number;
  maxTradesPerDay: number;
  /** Take-profit as fraction of R (default 0.5). */
  tpR: number;
  /** Volatility: ORB height must be >= atrMult * ATR(atrPeriod). */
  atrPeriod: number;
  atrMult: number;
  /** Extension: breakout close distance from range edge <= extAtrMult * ATR. */
  extAtrMult: number;
  filterMode: FilterMode;
  /** For n-of-m / weighted: how many enabled filters must pass. */
  filterN: number;
  filters: GoldOrbFilterFlags;
}

export const DEFAULT_GOLD_ORB_CONFIG: GoldOrbConfig = {
  symbol: GOLD_ORB_SYMBOL,
  equity: 500_000,
  riskPercent: 0.35,
  maxLots: 5,
  maxTradesPerDay: 2,
  tpR: 0.5,
  atrPeriod: 14,
  atrMult: 0.35,
  extAtrMult: 1.5,
  filterMode: 'all',
  filterN: 1,
  filters: {
    trend: false,
    extension: false,
    volatility: true, // reel default — only this on
    volume: false,
    candleQuality: false,
    vwap: false,
  },
};

export function goldOrbConfigFromEnv(base: GoldOrbConfig = DEFAULT_GOLD_ORB_CONFIG): GoldOrbConfig {
  const num = (k: string, d: number) => {
    const v = process.env[k];
    if (v == null || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const flag = (k: string, d: boolean) => {
    const v = process.env[k];
    if (v == null || v === '') return d;
    return v === '1' || v.toLowerCase() === 'true';
  };
  const mode = (process.env.AXE_GOLD_ORB_FILTER_MODE as FilterMode | undefined) ?? base.filterMode;
  return {
    ...base,
    equity: num('AXE_GOLD_ORB_EQUITY', base.equity),
    riskPercent: num('AXE_GOLD_ORB_RISK_PERCENT', base.riskPercent),
    maxLots: num('AXE_GOLD_ORB_MAX_LOTS', base.maxLots),
    atrMult: num('AXE_GOLD_ORB_ATR_MULT', base.atrMult),
    filterMode: mode === 'n-of-m' || mode === 'weighted' || mode === 'all' ? mode : base.filterMode,
    filterN: num('AXE_GOLD_ORB_FILTER_N', base.filterN),
    filters: {
      trend: flag('AXE_GOLD_ORB_FILTER_TREND', base.filters.trend),
      extension: flag('AXE_GOLD_ORB_FILTER_EXTENSION', base.filters.extension),
      volatility: flag('AXE_GOLD_ORB_FILTER_VOLATILITY', base.filters.volatility),
      volume: flag('AXE_GOLD_ORB_FILTER_VOLUME', base.filters.volume),
      candleQuality: flag('AXE_GOLD_ORB_FILTER_CANDLE', base.filters.candleQuality),
      vwap: flag('AXE_GOLD_ORB_FILTER_VWAP', base.filters.vwap),
    },
  };
}

/** Parts in America/New_York for an ISO timestamp. */
export function nyParts(iso: string): { y: number; m: number; d: number; h: number; min: number; dateKey: string } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const h = Number(get('hour'));
  const min = Number(get('minute'));
  return { y, m, d, h, min, dateKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

function minutesNy(p: { h: number; min: number }): number {
  return p.h * 60 + p.min;
}

function atr(bars: StrategyBar[], endIdx: number, period: number): number | null {
  if (endIdx < period) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    sum += tr;
  }
  return sum / period;
}

function sessionVwapUpTo(bars: StrategyBar[], indices: number[]): number | null {
  let pv = 0;
  let vol = 0;
  for (const i of indices) {
    const b = bars[i]!;
    const v = b.volume && b.volume > 0 ? b.volume : 1;
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * v;
    vol += v;
  }
  return vol > 0 ? pv / vol : null;
}

export function sizeGoldOrbLots(input: {
  entry: number;
  stopLoss: number;
  config: GoldOrbConfig;
}): { lots: number; riskBudget: number; refused?: string } {
  const riskBudget = (input.config.equity * input.config.riskPercent) / 100;
  const lab = estimateInstrument(input.config.symbol);
  const sized = sizeLotsForRisk({
    riskBudget,
    entry: input.entry,
    stop: input.stopLoss,
    spec: { ...lab.spec, maxVolume: Math.min(lab.spec.maxVolume, input.config.maxLots) },
  });
  return { lots: sized.lots, riskBudget, refused: sized.refused };
}

function runFilters(input: {
  config: GoldOrbConfig;
  bars: StrategyBar[];
  orbHigh: number;
  orbLow: number;
  signalBarIdx: number;
  side: StrategySide;
  preOrbIndices: number[];
}): { pass: boolean; results: StrategyFilterResult[]; killDay: boolean } {
  const { config, bars, orbHigh, orbLow, signalBarIdx, side, preOrbIndices } = input;
  const orbH = orbHigh - orbLow;
  const signal = bars[signalBarIdx]!;
  const atrVal = atr(bars, signalBarIdx - 1, config.atrPeriod);
  const results: StrategyFilterResult[] = [];

  // trend: close of last pre-ORB bar vs SMA20 of pre-ORB
  {
    const enabled = config.filters.trend;
    let ok = true;
    let detail = 'disabled';
    if (enabled) {
      if (preOrbIndices.length < 20) {
        ok = false;
        detail = 'insufficient pre-ORB bars for SMA20';
      } else {
        const slice = preOrbIndices.slice(-20).map(i => bars[i]!.close);
        const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
        const last = slice[slice.length - 1]!;
        ok = side === 'buy' ? last >= sma : last <= sma;
        detail = `pre-ORB close ${last.toFixed(2)} vs SMA20 ${sma.toFixed(2)} (${side})`;
      }
    }
    results.push({ id: 'trend', enabled, ok: !enabled || ok, detail, weight: 1 });
  }

  // extension: breakout not too far beyond range edge
  {
    const enabled = config.filters.extension;
    let ok = true;
    let detail = 'disabled';
    if (enabled) {
      if (atrVal == null) {
        ok = false;
        detail = 'ATR unavailable';
      } else {
        const edge = side === 'buy' ? orbHigh : orbLow;
        const dist = Math.abs(signal.close - edge);
        ok = dist <= config.extAtrMult * atrVal;
        detail = `ext ${dist.toFixed(2)} vs ${config.extAtrMult}*ATR ${atrVal.toFixed(2)}`;
      }
    }
    results.push({ id: 'extension', enabled, ok: !enabled || ok, detail, weight: 1 });
  }

  // volatility: ORB tall enough vs ATR
  {
    const enabled = config.filters.volatility;
    let ok = true;
    let detail = 'disabled';
    if (enabled) {
      if (atrVal == null || !(atrVal > 0)) {
        ok = false;
        detail = 'ATR unavailable';
      } else {
        const minH = config.atrMult * atrVal;
        ok = orbH >= minH;
        detail = `ORB height ${orbH.toFixed(2)} vs min ${minH.toFixed(2)} (${config.atrMult}*ATR)`;
      }
    }
    results.push({ id: 'volatility', enabled, ok: !enabled || ok, detail, weight: 1 });
  }

  // volume: signal bar vol >= median of last 20
  {
    const enabled = config.filters.volume;
    let ok = true;
    let detail = 'disabled';
    if (enabled) {
      const vols = bars.slice(Math.max(0, signalBarIdx - 20), signalBarIdx).map(b => b.volume ?? 0);
      if (!vols.some(v => v > 0)) {
        ok = true;
        detail = 'no volume series — pass (degrade)';
      } else {
        const sorted = [...vols].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const v = signal.volume ?? 0;
        ok = v >= med;
        detail = `vol ${v} vs median ${med}`;
      }
    }
    results.push({ id: 'volume', enabled, ok: !enabled || ok, detail, weight: 1 });
  }

  // candle quality: body >= 50% of range, close in breakout direction
  {
    const enabled = config.filters.candleQuality;
    let ok = true;
    let detail = 'disabled';
    if (enabled) {
      const range = signal.high - signal.low;
      const body = Math.abs(signal.close - signal.open);
      const bodyOk = range > 0 && body / range >= 0.5;
      const dirOk = side === 'buy' ? signal.close > signal.open : signal.close < signal.open;
      ok = bodyOk && dirOk;
      detail = `body/range=${range > 0 ? (body / range).toFixed(2) : 'n/a'} dirOk=${dirOk}`;
    }
    results.push({ id: 'candleQuality', enabled, ok: !enabled || ok, detail, weight: 1 });
  }

  // VWAP: buy above session VWAP, sell below
  {
    const enabled = config.filters.vwap;
    let ok = true;
    let detail = 'disabled';
    if (enabled) {
      const idxs = [...preOrbIndices, signalBarIdx];
      const v = sessionVwapUpTo(bars, idxs);
      if (v == null) {
        ok = false;
        detail = 'VWAP unavailable';
      } else {
        ok = side === 'buy' ? signal.close >= v : signal.close <= v;
        detail = `close ${signal.close.toFixed(2)} vs VWAP ${v.toFixed(2)}`;
      }
    }
    results.push({ id: 'vwap', enabled, ok: !enabled || ok, detail, weight: 1 });
  }

  const enabled = results.filter(r => r.enabled);
  let pass = true;
  if (enabled.length === 0) {
    pass = true;
  } else if (config.filterMode === 'all') {
    pass = enabled.every(r => r.ok);
  } else if (config.filterMode === 'n-of-m') {
    pass = enabled.filter(r => r.ok).length >= Math.min(config.filterN, enabled.length);
  } else {
    // weighted: average of ok weights >= 0.5
    const wSum = enabled.reduce((a, r) => a + (r.weight ?? 1), 0);
    const wOk = enabled.reduce((a, r) => a + (r.ok ? (r.weight ?? 1) : 0), 0);
    pass = wSum > 0 && wOk / wSum >= 0.5;
  }

  return { pass, results, killDay: !pass && enabled.length > 0 };
}

export interface GoldOrbDayTrade {
  side: StrategySide;
  entryTime: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  exitTime: string;
  exit: number;
  reason: 'tp' | 'sl' | 'flat_0600' | 'reversal';
  rMultiple: number;
}

export interface GoldOrbBacktestResult {
  strategyId: string;
  symbol: string;
  trades: GoldOrbDayTrade[];
  wins: number;
  losses: number;
  flats: number;
  sumR: number;
  notes: string[];
  config: GoldOrbConfig;
}

/** Simulate ORB rules over historical 5m bars (newest last). Pure — no IO. */
export function backtestGoldOrb(
  bars: StrategyBar[],
  config: GoldOrbConfig = DEFAULT_GOLD_ORB_CONFIG,
): GoldOrbBacktestResult {
  const notes: string[] = [];
  const trades: GoldOrbDayTrade[] = [];
  if (bars.length < 50) {
    return {
      strategyId: GOLD_ORB_STRATEGY_ID,
      symbol: config.symbol,
      trades,
      wins: 0,
      losses: 0,
      flats: 0,
      sumR: 0,
      notes: ['insufficient bars'],
      config,
    };
  }

  // Group bar indices by NY date
  const byDay = new Map<string, number[]>();
  for (let i = 0; i < bars.length; i++) {
    const key = nyParts(bars[i]!.time).dateKey;
    const arr = byDay.get(key) ?? [];
    arr.push(i);
    byDay.set(key, arr);
  }

  for (const [dateKey, idxs] of byDay) {
    const dayBars = idxs.map(i => ({ i, b: bars[i]!, p: nyParts(bars[i]!.time) }));
    const orbIdxs = dayBars.filter(x => minutesNy(x.p) >= 60 && minutesNy(x.p) < 75).map(x => x.i);
    if (orbIdxs.length < 1) continue;
    const orbHigh = Math.max(...orbIdxs.map(i => bars[i]!.high));
    const orbLow = Math.min(...orbIdxs.map(i => bars[i]!.low));
    if (!(orbHigh > orbLow)) continue;

    const preOrb = dayBars.filter(x => minutesNy(x.p) < 60).map(x => x.i);
    let killed = false;
    let tradesToday = 0;
    let open: {
      side: StrategySide;
      entry: number;
      stop: number;
      tp: number;
      entryTime: string;
      entryIdx: number;
      risk: number;
    } | null = null;

    const closeOpen = (exitIdx: number, reason: GoldOrbDayTrade['reason']) => {
      if (!open) return;
      const exitBar = bars[exitIdx]!;
      let exit = exitBar.close;
      if (reason === 'tp') exit = open.tp;
      if (reason === 'sl') exit = open.stop;
      if (reason === 'flat_0600') exit = exitBar.open;
      const signed = open.side === 'buy' ? exit - open.entry : open.entry - exit;
      const rMultiple = open.risk > 0 ? signed / open.risk : 0;
      trades.push({
        side: open.side,
        entryTime: open.entryTime,
        entry: open.entry,
        stopLoss: open.stop,
        takeProfit: open.tp,
        exitTime: exitBar.time,
        exit,
        reason,
        rMultiple,
      });
      open = null;
      tradesToday += 1;
    };

    for (const { i, p } of dayBars) {
      const mins = minutesNy(p);
      // Manage open first on this bar
      if (open) {
        const bar = bars[i]!;
        const hitSl =
          open.side === 'buy'
            ? bar.low <= open.stop
            : bar.high >= open.stop;
        const hitTp =
          open.side === 'buy'
            ? bar.high >= open.tp
            : bar.low <= open.tp;
        if (hitSl && hitTp) {
          // conservative: SL first
          closeOpen(i, 'sl');
        } else if (hitSl) {
          closeOpen(i, 'sl');
        } else if (hitTp) {
          closeOpen(i, 'tp');
        } else if (mins >= 6 * 60) {
          closeOpen(i, 'flat_0600');
          break;
        }
      }

      if (killed || tradesToday >= config.maxTradesPerDay) continue;
      if (mins < 75 || mins > 3 * 60 + 40) continue;
      // Signal on close outside range; enter next bar open
      const bar = bars[i]!;
      let side: StrategySide | null = null;
      if (bar.close > orbHigh) side = 'buy';
      else if (bar.close < orbLow) side = 'sell';
      if (!side) continue;

      // next bar must exist and still be in window for entry open
      const next = dayBars.find(x => x.i === i + 1) ?? dayBars.find(x => x.i > i);
      if (!next) continue;
      const entryMins = minutesNy(next.p);
      if (entryMins < 75 || entryMins > 3 * 60 + 40) continue;
      if (open && open.side === side) continue; // already same direction
      if (open && open.side !== side) {
        closeOpen(i, 'reversal');
      }
      if (tradesToday >= config.maxTradesPerDay) continue;

      const filt = runFilters({
        config,
        bars,
        orbHigh,
        orbLow,
        signalBarIdx: i,
        side,
        preOrbIndices: preOrb,
      });
      if (!filt.pass) {
        killed = filt.killDay;
        notes.push(`${dateKey}: filters rejected ${side} — day killed=${killed}`);
        continue;
      }

      const entry = bars[next.i]!.open;
      const stop = side === 'buy' ? orbLow : orbHigh;
      const risk = Math.abs(entry - stop);
      if (!(risk > 0)) continue;
      const tp = side === 'buy' ? entry + risk * config.tpR : entry - risk * config.tpR;
      open = {
        side,
        entry,
        stop,
        tp,
        entryTime: bars[next.i]!.time,
        entryIdx: next.i,
        risk,
      };
    }
    if (open) {
      const last = dayBars[dayBars.length - 1]!;
      closeOpen(last.i, 'flat_0600');
    }
  }

  const wins = trades.filter(t => t.rMultiple > 0).length;
  const losses = trades.filter(t => t.rMultiple < 0).length;
  const flats = trades.filter(t => t.rMultiple === 0).length;
  const sumR = trades.reduce((a, t) => a + t.rMultiple, 0);
  notes.push(`days=${byDay.size} trades=${trades.length} sumR=${sumR.toFixed(2)}`);
  return {
    strategyId: GOLD_ORB_STRATEGY_ID,
    symbol: config.symbol,
    trades,
    wins,
    losses,
    flats,
    sumR,
    notes,
    config,
  };
}

/** Evaluate the latest actionable ORB signal for Scout (bars newest last). */
export function evaluateGoldOrb(
  bars: StrategyBar[],
  config: GoldOrbConfig = DEFAULT_GOLD_ORB_CONFIG,
  nowIso?: string,
): StrategyEvaluation {
  const notes: string[] = [];
  if (!bars.length) {
    return { strategyId: GOLD_ORB_STRATEGY_ID, status: 'no-data', signal: null, notes: ['no bars'] };
  }
  const now = nowIso ?? bars[bars.length - 1]!.time;
  const nowP = nyParts(now);
  const mins = minutesNy(nowP);

  if (mins >= 6 * 60) {
    return {
      strategyId: GOLD_ORB_STRATEGY_ID,
      status: 'outside-window',
      signal: null,
      notes: [`past 06:00 NY flat — ${nowP.dateKey}`],
    };
  }
  if (mins < 75) {
    return {
      strategyId: GOLD_ORB_STRATEGY_ID,
      status: 'outside-window',
      signal: null,
      notes: [`before ORB complete (need ≥01:15 NY) — now ${nowP.h}:${String(nowP.min).padStart(2, '0')}`],
    };
  }
  if (mins > 3 * 60 + 40) {
    return {
      strategyId: GOLD_ORB_STRATEGY_ID,
      status: 'outside-window',
      signal: null,
      notes: ['after 03:40 NY entry cutoff'],
    };
  }

  const dayIdxs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (nyParts(bars[i]!.time).dateKey === nowP.dateKey) dayIdxs.push(i);
  }
  const orbIdxs = dayIdxs.filter(i => {
    const p = nyParts(bars[i]!.time);
    const m = minutesNy(p);
    return m >= 60 && m < 75;
  });
  if (!orbIdxs.length) {
    return { strategyId: GOLD_ORB_STRATEGY_ID, status: 'no-setup', signal: null, notes: ['no ORB bars today'] };
  }
  const orbHigh = Math.max(...orbIdxs.map(i => bars[i]!.high));
  const orbLow = Math.min(...orbIdxs.map(i => bars[i]!.low));
  if (!(orbHigh > orbLow)) {
    return { strategyId: GOLD_ORB_STRATEGY_ID, status: 'no-setup', signal: null, notes: ['zero-width ORB'] };
  }
  notes.push(`ORB ${nowP.dateKey} high=${orbHigh} low=${orbLow}`);

  // Walk today's bars in entry window for the latest valid close breakout
  const preOrb = dayIdxs.filter(i => minutesNy(nyParts(bars[i]!.time)) < 60);
  let latest: { idx: number; side: StrategySide } | null = null;
  for (const i of dayIdxs) {
    const p = nyParts(bars[i]!.time);
    const m = minutesNy(p);
    if (m < 75 || m > 3 * 60 + 40) continue;
    const bar = bars[i]!;
    if (bar.close > orbHigh) latest = { idx: i, side: 'buy' };
    else if (bar.close < orbLow) latest = { idx: i, side: 'sell' };
  }
  if (!latest) {
    return {
      strategyId: GOLD_ORB_STRATEGY_ID,
      status: 'no-setup',
      signal: null,
      notes: [...notes, 'no close outside ORB in window'],
    };
  }

  const filt = runFilters({
    config,
    bars,
    orbHigh,
    orbLow,
    signalBarIdx: latest.idx,
    side: latest.side,
    preOrbIndices: preOrb,
  });
  if (!filt.pass) {
    return {
      strategyId: GOLD_ORB_STRATEGY_ID,
      status: 'filtered',
      signal: null,
      notes: [...notes, 'filters rejected (day kill)', ...filt.results.filter(r => r.enabled).map(r => `${r.id}:${r.ok} ${r.detail}`)],
    };
  }

  // Entry = next bar open if present, else last close as proxy for live propose
  const nextIdx = latest.idx + 1 < bars.length ? latest.idx + 1 : latest.idx;
  const entry = nextIdx === latest.idx ? bars[latest.idx]!.close : bars[nextIdx]!.open;
  const stopLoss = latest.side === 'buy' ? orbLow : orbHigh;
  const risk = Math.abs(entry - stopLoss);
  if (!(risk > 0)) {
    return { strategyId: GOLD_ORB_STRATEGY_ID, status: 'no-setup', signal: null, notes: [...notes, 'zero risk'] };
  }
  const takeProfit = latest.side === 'buy' ? entry + risk * config.tpR : entry - risk * config.tpR;
  const signal: StrategySignal = {
    strategyId: GOLD_ORB_STRATEGY_ID,
    symbol: config.symbol,
    side: latest.side,
    entry,
    stopLoss,
    takeProfit,
    riskReward: config.tpR,
    orbHigh,
    orbLow,
    sessionDateNy: nowP.dateKey,
    filters: filt.results,
    filterMode: config.filterMode,
    notes: [
      ...notes,
      `signal ${latest.side} close=${bars[latest.idx]!.close}`,
      ...filt.results.filter(r => r.enabled).map(r => `${r.id}: ${r.detail}`),
    ],
  };
  return { strategyId: GOLD_ORB_STRATEGY_ID, status: 'signal', signal, notes: signal.notes };
}

export const goldOrb1amNyModule: StrategyModule = {
  id: GOLD_ORB_STRATEGY_ID,
  label: 'Gold ORB 1AM NY',
  symbols: [GOLD_ORB_SYMBOL],
  timeframe: GOLD_ORB_TIMEFRAME,
  evaluate(bars, nowIso) {
    return evaluateGoldOrb(bars, goldOrbConfigFromEnv(), nowIso);
  },
};
