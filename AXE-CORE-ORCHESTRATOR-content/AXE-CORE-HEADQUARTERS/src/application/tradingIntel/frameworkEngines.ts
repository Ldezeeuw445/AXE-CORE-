/**
 * frameworkEngines — één getypte vorm om de framework-engines eerlijk naast
 * elkaar (en naast de AXE Strategy Lab) te zetten.
 *
 * De brug bestond al: /backtest/vectorbt, /nautilus, /kronos, /tradingagents op
 * de VPS, en het ledger-prefix vbt:/nt:/kr:/ta:. Wat ontbrak: (1) de
 * interactieve lab kon er niet bij, alleen de zelftest van de autopilot; (2) een
 * getal van vectorbt en een getal van Nautilus zagen er hetzelfde uit terwijl ze
 * iets heel anders meten. vectorbt rekent van slot tot slot zonder stop en
 * zonder kosten; Nautilus vult een bracket tegen high/low met commissie. Een
 * vergelijking zonder die aannames ernaast is geen vergelijking.
 *
 * Deze module vervangt niets: ze roept dezelfde endpoints aan en zet het
 * antwoord in één vorm, met de aannames, de steekproef, de geschiktheid voor
 * live en de waarschuwingen erbij.
 */
import {
  backtestKronos, backtestNautilus, backtestTradingAgents, backtestVectorbt, frameworksStatus,
  type VectorbtBacktestResult,
} from '@/infrastructure/gateways/axeCoreApiService';
import { evaluateEligibility, type AssetKind, type CapabilityKind, type Eligibility } from '@/domain/tradingIntel/frameworkEligibility';
import { canonicalTimeframe, toEngineInterval } from '@/domain/tradingIntel/timeframes';
import { pairSpec } from '@/domain/tradingIntel/pairRegistry';
import type { StrategyLabResult } from '@/application/tradingIntel/strategyLab';

export type EngineId = 'axe-lab' | 'vbt' | 'nt' | 'kr' | 'ta';

export interface EngineAssumptions {
  fills: string;
  stops: string;
  costs: string;
  sizing: string;
  returns: string;
}

export interface EngineDescriptor {
  id: Exclude<EngineId, 'axe-lab'>;
  label: string;
  kind: CapabilityKind;
  /** Alleen deze timeframes; null = alle. */
  timeframes: string[] | null;
  assumptions: EngineAssumptions;
  /** Hoe lang een run ongeveer duurt, als dat merkbaar is. */
  slow?: string;
}

export const FRAMEWORK_ENGINES: Record<Exclude<EngineId, 'axe-lab'>, EngineDescriptor> = {
  vbt: {
    id: 'vbt', label: 'vectorbt', kind: 'rule', timeframes: null,
    assumptions: {
      fills: 'close of the signal bar', stops: 'none — exits on the opposite signal', costs: 'none',
      sizing: 'whole portfolio per trade', returns: 'percent of portfolio',
    },
  },
  nt: {
    id: 'nt', label: 'NautilusTrader', kind: 'rule', timeframes: null,
    assumptions: {
      fills: 'market order on the next bar', stops: 'bracket SL/TP in ATR, filled against bar high/low (stop first)',
      costs: 'commission', sizing: 'one lot per trade', returns: 'percent of committed capital (one lot)',
    },
  },
  kr: {
    id: 'kr', label: 'Kronos', kind: 'forecast', timeframes: ['h1'],
    assumptions: {
      fills: 'walk-forward steps', stops: 'none — side held over the forecast horizon', costs: 'none',
      sizing: 'unit exposure', returns: 'percent move over the horizon',
    },
    slow: '~12 s per step on the VPS CPU; a run takes minutes',
  },
  ta: {
    id: 'ta', label: 'TradingAgents', kind: 'debate', timeframes: ['d1'],
    assumptions: {
      fills: 'sampled daily decision dates', stops: 'none — held for the agents’ horizon', costs: 'none',
      sizing: 'unit exposure', returns: 'percent move over the horizon',
    },
    slow: 'a multi-agent LLM debate per date; a run takes minutes',
  },
};

export interface FrameworkResult {
  engine: EngineId;
  engineLabel: string;
  strategy: string;
  kind: CapabilityKind;
  symbol: string;
  timeframe: string;
  bars: number;
  /** De engines op de VPS geven geen periode terug; dan is dit null en staat dat in de waarschuwingen. */
  dateRange: { from: string; to: string } | null;
  sampleSize: number;
  assumptions: EngineAssumptions;
  metrics: {
    netReturnPct: number;
    winRate: number;
    profitFactor: number;
    trades: number;
    maxDrawdownPct: number | null;
    sharpe: number | null;
  };
  /** Geschiktheid voor live, als het framework op het account aan zou staan. */
  eligibility: Eligibility;
  warnings: string[];
}

const SMALL_SAMPLE = 30;

async function engineHealth(): Promise<Record<string, boolean> | null> {
  try {
    const st = await frameworksStatus();
    return st?.ok ? Object.fromEntries(Object.entries(st.frameworks).map(([k, v]) => [k, Boolean(v?.installed)])) : null;
  } catch {
    return null;
  }
}

/** Vorm één engine-antwoord naar FrameworkResult. Puur, zodat het te testen is. */
export function toFrameworkResults(input: {
  engine: EngineDescriptor;
  symbol: string;
  timeframe: string;
  response: VectorbtBacktestResult;
  health: Record<string, boolean> | null;
}): FrameworkResult[] {
  const { engine, symbol, timeframe, response } = input;
  const asset = (pairSpec(symbol)?.kind ?? null) as AssetKind | null;
  return Object.entries(response.strategies ?? {}).map(([strategy, st]) => {
    const trades = Number.isFinite(st.trades) ? st.trades : 0;
    const warnings = ['Engine does not report its date range'];
    if (st.error) warnings.push(`engine error: ${st.error}`);
    if (trades < SMALL_SAMPLE) warnings.push(`Only ${trades} trades — too few to tell an edge from luck`);
    if (engine.assumptions.costs === 'none') warnings.push('No costs modelled — compare against the Strategy Lab with spread and commission');
    if (engine.assumptions.stops.startsWith('none')) warnings.push('No stop-loss modelled — drawdowns can be understated');
    const eligibility = evaluateEligibility(strategy, {
      asset,
      timeframe,
      engineHealthy: input.health ? (input.health[engine.id] ?? false) : null,
      sample: { backtestTrades: trades, liveTrades: 0 },
      account: { liveFrameworks: ['axe', 'vbt', 'nt', 'kr', 'ta'] },
    });
    return {
      engine: engine.id,
      engineLabel: engine.label,
      strategy,
      kind: engine.kind,
      symbol,
      timeframe,
      bars: response.bars,
      dateRange: null,
      sampleSize: trades,
      assumptions: engine.assumptions,
      metrics: {
        netReturnPct: st.netReturnPct,
        winRate: st.winRate,
        profitFactor: st.profitFactor,
        trades,
        maxDrawdownPct: Number.isFinite(st.maxDrawdownPct) ? st.maxDrawdownPct : null,
        sharpe: Number.isFinite(st.sharpe) ? st.sharpe : null,
      },
      eligibility,
      warnings,
    };
  });
}

export async function runFrameworkEngine(input: {
  engine: Exclude<EngineId, 'axe-lab'>;
  symbol: string;
  timeframe: string;
  bars?: number;
}): Promise<{ ok: true; results: FrameworkResult[] } | { ok: false; error: string }> {
  const engine = FRAMEWORK_ENGINES[input.engine];
  const tf = canonicalTimeframe(input.timeframe);
  if (!tf) return { ok: false, error: `Unknown timeframe ${input.timeframe}` };
  // Een forecaster of een debat op een timeframe waar het niet voor gebouwd is,
  // levert een getal zonder betekenis — dan liever geen getal.
  if (engine.timeframes && !engine.timeframes.includes(tf)) {
    return { ok: false, error: `${engine.label} is built for ${engine.timeframes.join('/')}, not ${tf}` };
  }
  const symbol = input.symbol.trim().toUpperCase();
  const interval = toEngineInterval(tf);
  try {
    const response = input.engine === 'vbt' ? await backtestVectorbt(symbol, interval, input.bars ?? 1000)
      : input.engine === 'nt' ? await backtestNautilus(symbol, interval, input.bars ?? 1000)
        : input.engine === 'kr' ? await backtestKronos(symbol, interval)
          : await backtestTradingAgents(symbol, interval);
    if (!response?.ok) return { ok: false, error: response?.error ?? `${engine.label} returned no result` };
    return { ok: true, results: toFrameworkResults({ engine, symbol, timeframe: tf, response, health: await engineHealth() }) };
  } catch (e) {
    return { ok: false, error: `${engine.label}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Een AXE Strategy Lab-run in dezelfde vorm, zodat hij in dezelfde tabel past. */
export function labResultToFramework(r: StrategyLabResult): FrameworkResult {
  const m = r.run.metrics;
  const meta = r.meta;
  const tf = canonicalTimeframe(meta.timeframe) ?? meta.timeframe;
  return {
    engine: 'axe-lab',
    engineLabel: 'AXE Strategy Lab',
    strategy: meta.strategyLabel,
    kind: 'rule',
    symbol: meta.symbol,
    timeframe: tf,
    bars: meta.bars,
    dateRange: meta.from && meta.to ? { from: meta.from, to: meta.to } : null,
    sampleSize: m.totalTrades,
    assumptions: {
      fills: 'market order on the next bar open, with spread and slippage',
      stops: `${meta.stop.atrMultiple}×ATR stop, ${meta.stop.rewardRisk ?? 'no'}R target, stop first`,
      costs: `spread ${meta.costs.spread}, commission ${meta.costs.commissionPerLot}/lot/side, slippage ${meta.costs.slippage}`,
      sizing: meta.sizing.mode === 'fixed' ? `${meta.sizing.lots} lots` : `${(meta.sizing.riskPct * 100).toFixed(2)}% at the stop`,
      returns: `percent of a ${meta.startingBalance} account`,
    },
    metrics: {
      netReturnPct: m.netReturnPct, winRate: m.winRate, profitFactor: m.profitFactor, trades: m.totalTrades,
      maxDrawdownPct: m.maxDrawdownPct, sharpe: null,
    },
    eligibility: { strategy: meta.strategyLabel, eligible: true, reasons: [], kind: 'rule', warnings: [] },
    warnings: meta.warnings,
  };
}
