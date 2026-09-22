/**
 * strategyLab — één realistische testrun: echte candles, het echte signaal,
 * een account met geld, kosten, stops en (optioneel) de regels van een account.
 *
 * Samengesteld uit wat er al is, niets opnieuw:
 *   candles       backtestEngine.loadBacktestSeries (MetaAPI, TwelveData-terugval)
 *   signaal       strategySignals.computeStrategySignal — hetzelfde als live
 *   instrument    de specificatie van de broker als er een account verbonden is,
 *                 anders een schatting die zich zo noemt
 *   rekenen       domain/strategyLab/simulate
 *   regels        evaluateAccountRules, via het profiel
 *
 * Het resultaat draagt alles wat nodig is om het eerlijk te vergelijken: engine,
 * strategie, symbool, timeframe, periode, steekproef, kosten- en
 * risico-aannames, en waarschuwingen.
 */
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId } from '@/application/tradingIntel/strategySignals';
import { loadBacktestSeries } from '@/application/tradingIntel/backtestEngine';
import {
  simulateAccount,
  type LabBar,
  type LabCosts,
  type LabRun,
  type LabSizing,
  type LabSignal,
} from '@/domain/tradingIntel/strategyLab/simulate';
import {
  brokerInstrument,
  estimateInstrument,
  type LabInstrument,
} from '@/domain/tradingIntel/strategyLab/instrumentEstimate';
import { currenciesOf, COVERED_CURRENCIES, isHighImpact } from '@/domain/tradingIntel/economicCalendar';
import { loadInstrumentSpec, resolveOrderAccount } from '@/application/tradingIntel/preTradeGateService';
import { fetchEconomicReleases } from '@/infrastructure/gateways/researchSources';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

export type LabStrategy =
  | { kind: 'single'; strategy: StrategyId }
  | { kind: 'combo'; strategies: StrategyId[]; minAgree: number };

export interface StrategyLabInput {
  symbol: string;
  timeframe: string;
  strategy: LabStrategy;
  /** Aantal bars om op te halen (vóór de From/To-selectie). */
  limit: number;
  /** ISO-datums; bars daarbuiten doen niet mee. */
  from?: string | null;
  to?: string | null;
  startingBalance: number;
  sizing: LabSizing;
  costs: LabCosts;
  maxConcurrent?: number;
  maxTradesPerDay?: number | null;
  maxHoldBars?: number | null;
  allowShort?: boolean;
  atrMultiple?: number;
  rewardRisk?: number | null;
  exitOnOppositeSignal?: boolean;
  /** Accountregels (en funded-bewaking) — een profiel van een account of een eigen. */
  profile?: RiskProfile | null;
  profileLabel?: string | null;
  /** Probeer de specificatie van de broker (standaard ja). */
  useBrokerSpec?: boolean;
}

export interface LabMeta {
  engine: 'axe-lab';
  strategyLabel: string;
  symbol: string;
  timeframe: string;
  from: string | null;
  to: string | null;
  bars: number;
  source: 'metaapi' | 'twelvedata';
  instrumentSource: 'broker' | 'estimate';
  pnlCurrency: string;
  startingBalance: number;
  sizing: LabSizing;
  costs: LabCosts;
  stop: { atrMultiple: number; rewardRisk: number | null };
  profileLabel: string | null;
  sample: number;
  warnings: string[];
  ranAt: string;
}

export interface StrategyLabResult {
  meta: LabMeta;
  run: LabRun;
}

function strategyLabel(s: LabStrategy): string {
  return s.kind === 'single' ? s.strategy : `combo ${s.minAgree}/${s.strategies.length}: ${s.strategies.join('+')}`;
}

/** Dagen (New York) met een high-impact release voor dit paar; null als de kalender er niets over kan zeggen. */
async function highImpactDaysFor(symbol: string): Promise<Set<string> | null> {
  if (!currenciesOf(symbol).some(c => COVERED_CURRENCIES.has(c))) return null;
  const events = await fetchEconomicReleases().catch(() => null);
  if (!events?.length) return null;
  return new Set(events.filter(e => isHighImpact(e.name)).map(e => e.date));
}

export async function runStrategyLab(input: StrategyLabInput): Promise<{ ok: true; result: StrategyLabResult } | { ok: false; error: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  const limit = Math.min(Math.max(input.limit, 100), 20_000);
  const loaded = await loadBacktestSeries(symbol, input.timeframe, limit);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  // From/To: alleen bars binnen de periode, maar de signalen blijven op de hele
  // reeks berekend zodat de opwarmperiode vóór From niet wegvalt.
  const fromMs = input.from ? Date.parse(input.from) : -Infinity;
  const toMs = input.to ? Date.parse(input.to) : Infinity;
  const idx = loaded.candles.map((c, i) => ({ c, i })).filter(({ c }) => {
    const t = Date.parse(c.time);
    return t >= fromMs && t <= toMs;
  });
  if (idx.length < 60) return { ok: false, error: `Only ${idx.length} bars in the selected period — need at least 60.` };
  const offset = idx[0].i;
  // Opwarmen met bars van vóór From, zodat de eerste bar in de periode al een signaal kan hebben.
  const warmStart = Math.max(0, offset - 60);
  const window = loaded.candles.slice(warmStart, idx[idx.length - 1].i + 1);
  const bars: LabBar[] = window.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  const warmupBars = Math.max(offset - warmStart, 51);

  const signalAt = (i: number): LabSignal => {
    const at = warmStart + i;
    if (input.strategy.kind === 'single') return computeStrategySignal(input.strategy.strategy, loaded.series, at);
    let buys = 0; let sells = 0;
    for (const s of input.strategy.strategies) {
      const v = computeStrategySignal(s, loaded.series, at);
      if (v === 'buy') buys++; else if (v === 'sell') sells++;
    }
    if (buys >= input.strategy.minAgree && buys > sells) return 'buy';
    if (sells >= input.strategy.minAgree && sells > buys) return 'sell';
    return 'hold';
  };

  let instrument: LabInstrument = estimateInstrument(symbol);
  if (input.useBrokerSpec !== false) {
    const account = await resolveOrderAccount().catch(() => null);
    if (account) {
      const spec = await loadInstrumentSpec(account, symbol).catch(() => null);
      if (spec?.ok) instrument = brokerInstrument(spec.spec);
    }
  }

  const highImpactDays = input.profile?.newsRestriction === 'high_impact_day' ? await highImpactDaysFor(symbol) : null;

  const run = simulateAccount(bars, signalAt, {
    startingBalance: input.startingBalance,
    sizing: input.sizing,
    instrument,
    costs: input.costs,
    atrMultiple: input.atrMultiple,
    rewardRisk: input.rewardRisk,
    maxConcurrent: input.maxConcurrent,
    maxTradesPerDay: input.maxTradesPerDay,
    maxHoldBars: input.maxHoldBars,
    allowShort: input.allowShort,
    exitOnOppositeSignal: input.exitOnOppositeSignal,
    warmupBars,
    profile: input.profile ?? null,
    highImpactDays,
  });

  const warnings = [...run.warnings];
  if (loaded.source === 'twelvedata') warnings.push('Candles from TwelveData, not the broker feed the live agent trades against');
  if (input.strategy.kind === 'single' && !DISTINCT_STRATEGIES.has(input.strategy.strategy)) {
    warnings.push(`${input.strategy.strategy} has no dedicated logic — generic trend+RSI proxy`);
  }
  if (input.profile?.newsRestriction === 'high_impact_day' && !highImpactDays) {
    warnings.push('News restriction requested but the calendar cannot answer for this pair — not applied');
  }
  if (Number.isFinite(fromMs) && Date.parse(loaded.candles[0].time) > fromMs) {
    warnings.push(`History starts ${loaded.candles[0].time.slice(0, 10)}, later than the requested From date`);
  }

  return {
    ok: true,
    result: {
      meta: {
        engine: 'axe-lab',
        strategyLabel: strategyLabel(input.strategy),
        symbol,
        timeframe: input.timeframe,
        from: bars[warmupBars]?.time ?? null,
        to: bars[bars.length - 1]?.time ?? null,
        bars: bars.length - warmupBars,
        source: loaded.source,
        instrumentSource: instrument.spec.source,
        pnlCurrency: instrument.pnlCurrency,
        startingBalance: input.startingBalance,
        sizing: input.sizing,
        costs: input.costs,
        stop: { atrMultiple: input.atrMultiple ?? 1.5, rewardRisk: input.rewardRisk === undefined ? 1.5 : input.rewardRisk },
        profileLabel: input.profileLabel ?? (input.profile ? input.profile.mode : null),
        sample: run.metrics.totalTrades,
        warnings,
        ranAt: new Date().toISOString(),
      },
      run,
    },
  };
}

// ── Bewaarde lab-runs: genoeg om een test later te heropenen ─────────────────

export interface SavedLabRun {
  id: string;
  savedAt: string;
  note?: string;
  meta: LabMeta;
  metrics: LabRun['metrics'];
  funded: LabRun['funded'];
  trades: LabRun['trades'];
  equity: LabRun['equity'];
  events: LabRun['events'];
}

const LAB_RUNS_KEY = 'axe_strategy_lab_runs';
const MAX_SAVED = 30;
const MAX_EQUITY_POINTS = 400;
const MAX_TRADES = 1000;

/** Minder punten, maar pieken en dalen blijven: per emmer het laagste punt, plus het laatste. */
function downsampleEquity(points: LabRun['equity'], max = MAX_EQUITY_POINTS): LabRun['equity'] {
  if (points.length <= max) return points;
  const size = Math.ceil(points.length / max);
  const out: LabRun['equity'] = [];
  for (let k = 0; k < points.length; k += size) {
    const bucket = points.slice(k, k + size);
    out.push(bucket.reduce((a, b) => (b.worstEquity < a.worstEquity ? b : a)));
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export async function getSavedLabRuns(): Promise<SavedLabRun[]> {
  return loadSetting<SavedLabRun[]>(LAB_RUNS_KEY, []);
}

export async function saveLabRun(result: StrategyLabResult, note?: string): Promise<SavedLabRun[]> {
  const entry: SavedLabRun = {
    id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
    note,
    meta: result.meta,
    metrics: result.run.metrics,
    funded: result.run.funded,
    trades: result.run.trades.slice(-MAX_TRADES),
    equity: downsampleEquity(result.run.equity),
    events: result.run.events.filter(e => e.kind !== 'blocked').concat(result.run.events.filter(e => e.kind === 'blocked').slice(0, 20)),
  };
  const next = [entry, ...(await getSavedLabRuns())].slice(0, MAX_SAVED);
  await saveSetting(LAB_RUNS_KEY, next);
  return next;
}

export async function deleteLabRun(id: string): Promise<SavedLabRun[]> {
  const next = (await getSavedLabRuns()).filter(r => r.id !== id);
  await saveSetting(LAB_RUNS_KEY, next);
  return next;
}
