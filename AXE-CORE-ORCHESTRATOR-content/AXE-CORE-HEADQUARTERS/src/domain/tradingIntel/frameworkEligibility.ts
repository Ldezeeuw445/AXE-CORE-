/**
 * frameworkEligibility — welke strategie van welk framework live mag meedingen.
 *
 * De dispatch voor nt:, kr: en ta: bestond en werkte, maar de live-kandidatenlijst
 * bevatte ze niet: alleen AXE en vectorbt konden ooit gekozen worden, hoe goed
 * een Nautilus-strategie zich in de zelftest ook hield. Ze er gewoon bij zetten
 * zou het omgekeerde fout doen — een placeholder, een forecaster op een
 * timeframe waar hij niet voor is afgesteld, of een aandelen-debat op goud
 * zouden dan even hard meedingen als een geteste regelstrategie.
 *
 * Dus expliciete geschiktheid, per (strategie, symbool, timeframe, account):
 *   - geïmplementeerd (geen placeholder)
 *   - engine gezond (geïnstalleerd volgens de VPS)
 *   - toepasbaar op dit instrument en deze timeframe
 *   - genoeg steekproef
 *   - het account staat dit framework toe
 * Alles wat faalt, staat met reden in het resultaat — geen stille uitsluiting.
 */
import type { FrameworkId } from '@/domain/tradingIntel/strategyColors';

export type AssetKind = 'fx' | 'metal' | 'index' | 'crypto' | 'energy' | 'equity';

/** Wat voor ding een strategie is. Een forecaster is geen regel; een debat ook niet. */
export type CapabilityKind = 'rule' | 'forecast' | 'debate' | 'placeholder';

export interface StrategyCapability {
  id: string;
  engine: FrameworkId;
  kind: CapabilityKind;
  implemented: boolean;
  /** Kan het een live signaal voor de laatste bar geven? */
  liveSignal: boolean;
  /** Timeframes waarvoor het gemaakt is; leeg = alle. */
  timeframes: readonly string[];
  /** Volledig gedekt. */
  assets: readonly AssetKind[];
  /** Draait, maar de redenering is niet voor dit soort instrument gebouwd. */
  partialAssets: readonly AssetKind[];
  note?: string;
}

const ALL_ASSETS: readonly AssetKind[] = ['fx', 'metal', 'index', 'crypto', 'energy', 'equity'];

const rule = (id: string, engine: FrameworkId): StrategyCapability => ({
  id, engine, kind: 'rule', implemented: true, liveSignal: true, timeframes: [], assets: ALL_ASSETS, partialAssets: [],
});

/** De ene lijst van wat er bestaat — negentien echt, drie gereserveerd. */
export const STRATEGY_CAPABILITIES: readonly StrategyCapability[] = [
  ...['smc-structure', 'volumetric-ob', 'fib-retracement', 'pdh', 'ifvg', 'golden-pocket', 'mean-reversion', 'trend-follow']
    .map(id => rule(id, 'axe')),
  {
    ...rule('crew-hybrid', 'axe'),
    liveSignal: false,
    note: 'proxy — carries the CrewAI research vote into the funnel; never a live candidate on its own',
  },
  ...['vbt:ma-cross', 'vbt:rsi-meanrev', 'vbt:bbands', 'vbt:macd'].map(id => rule(id, 'vbt')),
  ...['nt:ema-bracket', 'nt:atr-breakout', 'nt:donchian-trail', 'nt:rsi-pullback'].map(id => ({
    ...rule(id, 'nt'), note: 'bracket SL/TP fills against bar high/low, with commission',
  })),
  {
    id: 'kr:forecast', engine: 'kr', kind: 'forecast', implemented: true, liveSignal: true,
    // Twaalf-bars horizon, afgesteld en zelfgetest op h1. Op andere timeframes is
    // er geen enkel bewijs, en een forecaster zonder bewijs is een gok.
    timeframes: ['h1'], assets: ['crypto', 'fx', 'metal', 'index', 'energy', 'equity'], partialAssets: [],
    note: 'price forecaster (median of 5 samples); buy/sell/hold is derived from the forecast, not a rule',
  },
  {
    id: 'ta:debate', engine: 'ta', kind: 'debate', implemented: true, liveSignal: true,
    // Redeneert over nieuws en fundamentals met een horizon in dagen: alleen d1.
    timeframes: ['d1'], assets: ['equity'], partialAssets: ['fx', 'metal', 'crypto', 'index', 'energy'],
    note: 'multi-agent LLM debate built for equities; other asset classes are partial coverage',
  },
  ...['pa:impulse-pullback', 'pa:bos-retest', 'pa:liquidity-sweep'].map(id => ({
    id, engine: 'pa' as FrameworkId, kind: 'placeholder' as const, implemented: false, liveSignal: false,
    timeframes: [], assets: [], partialAssets: [], note: 'reserved name and colour only — no implementation exists',
  })),
];

function capabilityOf(strategy: string): StrategyCapability | null {
  return STRATEGY_CAPABILITIES.find(c => c.id === strategy) ?? null;
}

/** Wat elk account vandaag al mocht: AXE en vectorbt. Uitbreiden is een keuze per account. */
export const DEFAULT_LIVE_FRAMEWORKS: readonly FrameworkId[] = ['axe', 'vbt'];

/** Minimale steekproef voordat een framework-strategie live mag meedingen. */
export const MIN_BACKTEST_TRADES_FOR_LIVE = 30;
export const MIN_LIVE_TRADES_FOR_LIVE = 5;

export interface EligibilityContext {
  asset: AssetKind | null;
  timeframe: string;
  /** Engine geïnstalleerd volgens /frameworks/status; null = niet te zeggen. */
  engineHealthy: boolean | null;
  /** Steekproef onder het bewijsbeleid van dit account. */
  sample: { backtestTrades: number; liveTrades: number };
  account: { liveFrameworks?: readonly FrameworkId[]; allowPartialCoverage?: boolean };
}

export interface Eligibility {
  strategy: string;
  eligible: boolean;
  /** Elke reden waarom niet, in volgorde. Leeg als eligible. */
  reasons: string[];
  kind: CapabilityKind | 'unknown';
  warnings: string[];
}

export function evaluateEligibility(strategy: string, ctx: EligibilityContext): Eligibility {
  const cap = capabilityOf(strategy);
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!cap) return { strategy, eligible: false, reasons: ['unknown strategy'], kind: 'unknown', warnings };

  if (!cap.implemented) reasons.push('placeholder — not implemented');
  if (!cap.liveSignal) reasons.push('no live signal');

  const allowed = ctx.account.liveFrameworks ?? DEFAULT_LIVE_FRAMEWORKS;
  if (!allowed.includes(cap.engine)) reasons.push(`${cap.engine} not enabled for live on this account`);

  // AXE's eigen strategieën draaien in de app zelf; alleen de VPS-engines kunnen ontbreken.
  if (cap.engine !== 'axe') {
    if (ctx.engineHealthy === false) reasons.push(`${cap.engine} engine not installed/healthy`);
    // vectorbt dong altijd mee zonder gezondheidscheck; een onbekende status
    // sluit hem niet ineens uit. Voor de nieuw toegelaten engines wel.
    else if (ctx.engineHealthy === null && cap.engine !== 'vbt') reasons.push(`${cap.engine} engine health unknown`);
  }

  if (cap.timeframes.length && !cap.timeframes.includes(ctx.timeframe)) {
    reasons.push(`${cap.kind === 'forecast' ? 'forecaster' : cap.kind} built for ${cap.timeframes.join('/')}, not ${ctx.timeframe}`);
  }

  if (!ctx.asset) {
    if (cap.engine !== 'axe' && cap.engine !== 'vbt') reasons.push('instrument class unknown');
  } else if (cap.partialAssets.includes(ctx.asset)) {
    if (ctx.account.allowPartialCoverage) warnings.push(`partial coverage: ${cap.engine} was not built for ${ctx.asset}`);
    else reasons.push(`partial coverage for ${ctx.asset} — not allowed on this account`);
  } else if (!cap.assets.includes(ctx.asset)) {
    reasons.push(`not applicable to ${ctx.asset}`);
  }

  // Steekproef. Voor AXE en vectorbt gold die eis niet, en dat blijft zo: ze
  // dongen altijd al mee, en de ranking zelf weegt steekproefgrootte al.
  if (cap.engine !== 'axe' && cap.engine !== 'vbt') {
    const enough = ctx.sample.liveTrades >= MIN_LIVE_TRADES_FOR_LIVE
      || ctx.sample.backtestTrades >= MIN_BACKTEST_TRADES_FOR_LIVE;
    if (!enough) {
      reasons.push(`sample too small (${ctx.sample.backtestTrades} backtest / ${ctx.sample.liveTrades} live; needs ${MIN_BACKTEST_TRADES_FOR_LIVE} backtest or ${MIN_LIVE_TRADES_FOR_LIVE} live)`);
    }
  }

  if (cap.kind === 'forecast') warnings.push('forecaster: signal derived from a price forecast');
  if (cap.kind === 'debate') warnings.push('LLM debate: signal read from a cache refreshed off the trading path');

  return { strategy, eligible: reasons.length === 0, reasons, kind: cap.kind, warnings };
}

/** Een ranking-regel zoals rankStrategiesForPair hem geeft (alleen wat hier nodig is). */
export interface RankedCandidate {
  strategy: string;
  timeframe: string;
  score: number;
  tested: boolean;
  stats: { trades: number; backtest?: { trades: number } } | null;
}

/**
 * Kies de hoogst gerangschikte GESCHIKTE kandidaat, en zeg waarom — inclusief
 * welke framework-kandidaten niet mochten meedoen en de eerste reden.
 * null = geen enkele kandidaat geschikt.
 */
export function selectLiveStrategy(input: {
  ranked: readonly RankedCandidate[];
  asset: AssetKind | null;
  health: Record<string, boolean> | null;
  account: EligibilityContext['account'];
  evidenceLabel: string;
}): { strategy: string; timeframe: string; selection: string; eligibility: Eligibility } | null {
  const judged = input.ranked.map(r => {
    const engine = capabilityOf(r.strategy)?.engine ?? 'axe';
    return {
      r, engine,
      e: evaluateEligibility(r.strategy, {
        asset: input.asset,
        timeframe: r.timeframe,
        engineHealthy: input.health ? (input.health[engine] ?? false) : null,
        sample: { backtestTrades: r.stats?.backtest?.trades ?? 0, liveTrades: r.stats?.trades ?? 0 },
        account: input.account,
      }),
    };
  });
  const eligible = judged.filter(j => j.e.eligible);
  const excluded = [...new Set(judged
    .filter(j => !j.e.eligible && j.engine !== 'axe')
    .map(j => `${j.r.strategy}@${j.r.timeframe}: ${j.e.reasons[0]}`))].slice(0, 4);
  const top = eligible[0];
  if (!top) return null;
  const warn = top.e.warnings.length ? ` · ${top.e.warnings.join('; ')}` : '';
  const why = top.r.tested
    ? `ranked #1 of ${eligible.length} eligible on ${input.evidenceLabel} (score ${top.r.score.toFixed(5)})`
    : `exploration pick — nothing tested yet on this pair (${eligible.length} eligible)`;
  return {
    strategy: top.r.strategy,
    timeframe: top.r.timeframe,
    eligibility: top.e,
    selection: `${top.r.strategy}@${top.r.timeframe} [${top.e.kind}] ${why}${warn}${excluded.length ? ` · not eligible: ${excluded.join(' | ')}` : ''}`,
  };
}
