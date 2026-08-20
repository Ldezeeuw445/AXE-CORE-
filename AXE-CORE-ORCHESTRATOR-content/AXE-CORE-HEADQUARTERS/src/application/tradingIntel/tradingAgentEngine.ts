/**
 * tradingAgentEngine — single self-improving demo trading agent.
 *
 * Pipeline:
 *  1) Live market snapshot
 *  2) Latest intel report
 *  3) Private agent memory
 *  4) Risk profile gates (personal vs funded)
 *  5) Score + decision (desk indicators when provided)
 *  6) Optional paper fill via broker connector
 *  7) Learning stats + thinking journal
 */
import type { TradingIntelReport } from '@/domain/tradingIntel/types';
import type { TradingAgentDecision } from '@/domain/tradingIntel/demoTypes';
import type { DecisionStep, ThinkingTrace } from '@/domain/tradingIntel/botTypes';
import type { MetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { listIntelReports } from '@/infrastructure/persistence/tradingIntelService';
import {
  getDemoAccount,
  markPositions,
} from '@/infrastructure/persistence/demoTradingService';
import {
  buildTradingAgentContext,
  rememberLesson,
  rememberOpenThesis,
  rememberTradeDecision,
} from '@/infrastructure/persistence/tradingAgentMemoryService';
import {
  recordTrade,
  recordIntelSnapshot,
  recordThesis,
  recordMistake,
} from '@/infrastructure/persistence/tradingAgentBrain';
import { fetchMarketSnapshot, rsi, sma, atr } from '@/infrastructure/gateways/marketDataService';
import { getRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import {
  getLearningStats,
  saveThinkingTrace,
} from '@/infrastructure/persistence/tradingLearningService';
import { checkAndUpdateCircuitBreaker } from '@/infrastructure/persistence/tradingCircuitBreakerService';
import { brokerPlaceOrder, getEffectiveAccountState } from '@/infrastructure/gateways/brokerConnector';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId, type StrategySeries, type StrategySignal } from '@/application/tradingIntel/strategySignals';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';

export interface AgentRunResult {
  decision: TradingAgentDecision;
  trace: ThinkingTrace;
  tradeId?: string;
  error?: string;
  accountCash?: number;
  blockedByRisk?: string;
  message?: string;
}

function signalToBias(signal: string): number {
  switch (signal) {
    case 'BUY': return 1;
    case 'SELL':
    case 'AVOID': return -1;
    case 'HOLD': return 0;
    default: return 0.12;
  }
}

// Previously no order the agent placed ever carried a stop-loss or take-
// profit — brokerPlaceOrder/metaApiMarketOrder simply didn't accept them.
// ATR-based sizing (1.5x recent volatility for the stop, 1.5R for the
// target) instead of a fixed %, so the stop distance actually reflects how
// much this specific symbol has been moving.
const SL_ATR_MULTIPLE = 1.5;
const REWARD_RISK_RATIO = 1.5;

/**
 * Builds the same StrategySeries shape backtestEngine uses, from live bars —
 * O(n²) over ~120 bars (a few thousand ops), trivial cost, and keeps this
 * self-contained in application/ rather than reaching into the presentation-
 * layer indicatorMath.ts backtestEngine already (pre-existingly) does.
 */
export function buildStrategySeries(bars: OhlcBar[]): StrategySeries {
  const closes = bars.map(b => b.c);
  const highs = bars.map(b => b.h);
  const lows = bars.map(b => b.l);
  const opens = bars.map(b => b.o);
  const times = bars.map(b => new Date(b.t).toISOString());
  const sma20: Array<number | null> = [];
  const sma50: Array<number | null> = [];
  const rsi14: Array<number | null> = [];
  for (let i = 0; i < bars.length; i++) {
    const slice = bars.slice(0, i + 1);
    sma20.push(sma(slice, 20));
    sma50.push(sma(slice, 50));
    rsi14.push(rsi(slice, 14));
  }
  // volumetric-ob needs real volume — only attach the series when every bar
  // actually has one, so it degrades to 'hold' rather than trading against
  // fabricated zeros for symbols the broker doesn't report volume for.
  const volumes = bars.every(b => b.v != null) ? bars.map(b => b.v as number) : undefined;
  return { closes, highs, lows, opens, times, sma20, sma50, rsi14, volumes };
}

function step(
  phase: DecisionStep['phase'],
  title: string,
  detail: string,
  weight?: number,
): DecisionStep {
  return {
    id: `${phase}-${Math.random().toString(36).slice(2, 7)}`,
    phase,
    title,
    detail,
    weight,
  };
}

export async function runTradingAgent(input: {
  symbol: string;
  autoExecute?: boolean;
  minConfidence?: number;
  riskPct?: number;
  /** When set, THIS strategy's signal drives the technical component of the
   *  score (see below) instead of the generic SMA/RSI blend — the same
   *  strategySignals.ts function backtestEngine uses, so a live cycle can
   *  actually be compared against its own backtest. Falls back to the
   *  generic blend for proxy strategies (still no real logic yet) or when
   *  no strategy is passed at all. */
  strategy?: StrategyId;
  /** Framework strategies (vbt:*, ml:*) aren't StrategyIds and compute their
   *  signal off-box (the VPS engine). When the autopilot selects one, it passes
   *  the live signal here — it drives the technical score exactly like a
   *  distinct strategy's own signal would, so a framework strategy is a
   *  first-class, auto-tradeable competitor, not just a backtest number. */
  strategySignalOverride?: StrategySignal;
  /** Attribution label for the ledger + broker comment — the actual strategy
   *  being traded (e.g. 'vbt:macd'), which may not be a StrategyId. Defaults
   *  to `strategy`. */
  strategyName?: string;
  /** Which timeframe to decide on. The algo now picks this per pair from the
   *  ledger, alongside the strategy — see agentAutopilot.strategyForSymbol. */
  timeframe?: string;
  /**
   * Decide and execute for THIS account.
   *
   * The whole decision is re-run per account on purpose. Sizing, the circuit
   * breaker and the risk checks all read account state, so an account that is
   * near its drawdown limit must be able to refuse a trade another account
   * takes. Mirroring one account's order onto the others would skip exactly
   * the checks that matter most on a prop account.
   */
  account?: MetaApiConfig;
  indicatorHint?: {
    sma20?: number | null;
    sma50?: number | null;
    rsi14?: number | null;
    fvgCount?: number;
    obCount?: number;
    pdh?: number | null;
    pdl?: number | null;
  };
}): Promise<AgentRunResult> {
  const symbol = input.symbol.trim().toUpperCase();
  const steps: DecisionStep[] = [];

  // Every source is fetched together, but a failure in ONE of them must not
  // take the cycle with it. Before this, a plain Promise.all meant any thrown
  // error surfaced as `SYMBOL: cycle error — <message>` and the whole run for
  // every pair died: on 2026-08-18 that was MetaAPI answering "The quota has
  // been exceeded" to ten symbols in a row, and the agent recorded nothing at
  // all — no decision, no trace, nothing to learn from. A cycle that loses its
  // intel or its memory should still think and still write down what it saw;
  // only the market snapshot is genuinely load-bearing, and that one already
  // falls back through MetaAPI → Binance → the rest internally.
  const settled = await Promise.allSettled([
    fetchMarketSnapshot(symbol, input.timeframe ?? 'h1'),
    listIntelReports(),
    buildTradingAgentContext(symbol),
    // Paper mirror — kept only for markPositions() continuity and the
    // trades-today frequency count below, both of which capture every
    // fill regardless of venue. It must NEVER feed equity, position, or
    // sizing math below; that all goes through `effective`, which reads
    // the real MetaAPI account whenever one is connected. He can only
    // learn from — and only avoid mistakes against — the account that's
    // actually real; a paper number that never truly moves teaches nothing.
    getDemoAccount(),
    getEffectiveAccountState(symbol, input.account),
    getRiskProfile(),
    getLearningStats(),
  ]);

  const degraded: string[] = [];
  const took = <T,>(index: number, label: string, fallback: T): T => {
    const outcome = settled[index];
    if (outcome.status === 'fulfilled') return outcome.value as T;
    const why = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    console.warn(`[tradingAgent] ${label} unavailable for ${symbol}: ${why}`);
    degraded.push(`${label}: ${why}`);
    return fallback;
  };

  // Three things a decision genuinely cannot be invented without. Each of them
  // already has internal fallbacks (the snapshot walks MetaAPI → Binance → …;
  // the other two read local settings), so a rejection here is a real fault and
  // still stops the cycle.
  for (const [index, label] of [[0, 'market snapshot'], [3, 'paper mirror'], [5, 'risk profile']] as const) {
    const outcome = settled[index];
    if (outcome.status === 'rejected') throw outcome.reason;
  }
  const snap = (settled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof fetchMarketSnapshot>>>).value;
  const account = (settled[3] as PromiseFulfilledResult<Awaited<ReturnType<typeof getDemoAccount>>>).value;
  const risk = (settled[5] as PromiseFulfilledResult<Awaited<ReturnType<typeof getRiskProfile>>>).value;

  // The rest degrade. Losing intel or memory makes a cycle less sharp; it does
  // not make it impossible, and a thinking-but-blinder agent that records what
  // it saw beats one that dies and records nothing.
  const reports = took(1, 'Intel reports', [] as Awaited<ReturnType<typeof listIntelReports>>);
  const memCtx = took(2, 'Agent memory', '');
  // An empty record rather than null: "no history" is a real, meaningful state
  // the whole engine already handles (it is what a fresh agent has), whereas a
  // null would need a check at every one of the dozen sites that read it.
  // learnedMinConfidence stays at the default floor, so losing this file makes
  // the agent no bolder than usual.
  const learning = took(6, 'Learning stats', {
    tradesClosed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    // Same neutral floor tradingLearningService starts a fresh agent on.
    learnedMinConfidence: 0.58,
    aggressiveness: 0,
    recentOutcomes: [],
    updatedAt: new Date().toISOString(),
  } as Awaited<ReturnType<typeof getLearningStats>>);

  // Refusing is the safe default: `available: false` is already the signal the
  // block below uses to stop this cycle sizing or placing anything, which is
  // exactly right when the balance could not be read.
  const effective = took(4, 'Live account', {
    isReal: false,
    available: false,
    unavailableReason: 'Account state unreadable this cycle',
    equity: 0,
    positionQty: () => 0,
  } as Awaited<ReturnType<typeof getEffectiveAccountState>>);

  // Recorded in the trace rather than only the console, so a quiet degradation
  // is visible on the ALGO tab instead of looking like a normal cycle.
  if (degraded.length) {
    steps.push(step(
      'data',
      `Degraded — ${degraded.length} source(s) unavailable`,
      degraded.join(' · '),
      0.2,
    ));
  }

  // No real account, no cycle. Checked before the circuit breaker so an
  // unreadable balance can never move the breaker's peak-equity high-water
  // mark, and before any sizing math runs at all.
  if (!effective.available) {
    steps.push(step(
      'risk',
      'Live account unavailable',
      `${effective.unavailableReason ?? 'No live account'} — no order sized or placed this cycle.`,
      0,
    ));
    const reason = effective.unavailableReason ?? 'Live account unavailable';
    const blockedDecision: TradingAgentDecision = {
      id: crypto.randomUUID?.() ?? `dec-${Date.now()}`,
      symbol,
      action: 'hold',
      confidence: 0,
      rationale: reason,
      inputs: { memoryKeys: ['risk'] },
      createdAt: new Date().toISOString(),
    };
    const blockedTrace: ThinkingTrace = {
      decisionId: blockedDecision.id,
      symbol,
      steps,
      finalAction: 'hold',
      confidence: 0,
      blockedByRisk: reason,
      createdAt: new Date().toISOString(),
    };
    await saveThinkingTrace(blockedTrace);
    return {
      decision: blockedDecision,
      trace: blockedTrace,
      tradeId: undefined,
      error: undefined,
      accountCash: 0,
      blockedByRisk: reason,
      message: `HOLD ${symbol} — ${reason}`,
    };
  }

  steps.push(step(
    'data',
    'Live market data',
    `${symbol} last=${snap.last.toFixed(4)} source=${snap.source} bars=${snap.bars.length} change=${snap.changePct?.toFixed(2) ?? 'n/a'}%`,
    1,
  ));

  // Hard equity-drawdown stop, checked before anything else decides whether
  // to trade. Independent of the learning knobs below — a fast, sharp
  // drawdown doesn't wait for enough closed trades to move a rolling
  // average. Once tripped it stays tripped (forcing HOLD every cycle) until
  // a human resets it from the Scorecard — see tradingCircuitBreakerService.
  const eqForBreaker = effective.equity;
  // Scoped to the account this decision is for. A shared high-water mark
  // across accounts subtracts one account's equity from another's peak — which
  // is exactly what forced every cycle to HOLD at "51.5% drawdown" while the
  // account it named sat flat at its starting balance.
  const breaker = await checkAndUpdateCircuitBreaker(
    eqForBreaker,
    risk.maxDrawdownPct ?? 0.12,
    effective.isReal ? 'live' : 'paper',
    input.account?.accountId ?? null,
  );
  steps.push(step(
    'risk',
    breaker.tripped ? 'Circuit breaker TRIPPED' : 'Circuit breaker OK',
    breaker.tripped
      ? (breaker.trippedReason ?? 'Drawdown limit exceeded — reset manually from the Scorecard to resume.')
      : `equity $${eqForBreaker.toFixed(0)} (${effective.isReal ? 'live MT5' : 'paper'}) · peak $${breaker.peakEquity.toFixed(0)}`,
    breaker.tripped ? 0 : 1,
  ));

  if (input.indicatorHint) {
    const h = input.indicatorHint;
    steps.push(step(
      'data',
      'Desk indicators',
      [
        h.sma20 != null ? `SMA20=${Number(h.sma20).toFixed(4)}` : null,
        h.sma50 != null ? `SMA50=${Number(h.sma50).toFixed(4)}` : null,
        h.rsi14 != null ? `RSI=${Number(h.rsi14).toFixed(1)}` : null,
        h.fvgCount != null ? `FVG×${h.fvgCount}` : null,
        h.obCount != null ? `OB×${h.obCount}` : null,
        h.pdh != null ? `PDH=${Number(h.pdh).toFixed(4)}` : null,
        h.pdl != null ? `PDL=${Number(h.pdl).toFixed(4)}` : null,
      ].filter(Boolean).join(' · ') || 'no values',
      0.85,
    ));
  }

  const intel =
    reports.find(r => r.ticker === symbol && r.status === 'complete') ||
    reports.find(r => r.ticker.includes(symbol.split('-')[0]) && r.status === 'complete');

  steps.push(step(
    'intel',
    intel ? 'Intel report loaded' : 'No intel — tape mode',
    intel
      ? `${intel.signal} @ ${(intel.confidence * 100).toFixed(0)}% · ${intel.thesis.slice(0, 200)}`
      : 'Run Research crew first for stronger edge.',
    intel ? intel.confidence : 0.3,
  ));

  steps.push(step('memory', 'Agent memory', memCtx.slice(0, 320), 0.5));

  const last = snap.last;
  await markPositions({ [symbol]: last });
  const bars = snap.bars;
  const sma20 = input.indicatorHint?.sma20 ?? sma(bars, 20);
  const sma50 = input.indicatorHint?.sma50 ?? sma(bars, Math.min(50, bars.length));
  const rsi14 = input.indicatorHint?.rsi14 ?? rsi(bars, 14);
  const atr14 = atr(bars, 14);

  let score = (intel ? signalToBias(intel.signal) : 0) * (intel?.confidence ?? 0.4);
  // learning.aggressiveness is deliberately NOT added here anymore — it used
  // to inflate this score on top of ALSO lowering learnedMinConfidence below,
  // double-counting the same rolling-window signal through two channels and
  // compounding exactly when a streak should invite more scrutiny, not less.
  // One lever (learnedMinConfidence) now carries that signal; aggressiveness
  // is kept only as a display mirror of it — see tradingLearningService.

  // Strategy-driven technical component when a genuinely distinct strategy
  // is selected — same computeStrategySignal() backtestEngine runs, so a
  // live cycle actually matches what its own backtest predicted. Falls
  // back to the generic SMA/RSI blend for proxy strategies or when no
  // strategy is passed (unchanged default behavior).
  const strategyIsDistinct = input.strategy != null && DISTINCT_STRATEGIES.has(input.strategy);
  const usesFrameworkSignal = input.strategySignalOverride != null;
  let strategySignalUsed: 'buy' | 'sell' | 'hold' | null = null;
  if (usesFrameworkSignal) {
    // A framework strategy (vbt:*, ml:*) the ledger selected — its live signal
    // was computed off-box and passed in. Drives the technical score exactly
    // like a distinct strategy's own signal.
    strategySignalUsed = input.strategySignalOverride!;
    if (strategySignalUsed === 'buy') score += 0.4;
    else if (strategySignalUsed === 'sell') score -= 0.4;
  } else if (strategyIsDistinct) {
    const series = buildStrategySeries(bars);
    strategySignalUsed = computeStrategySignal(input.strategy as StrategyId, series, series.closes.length - 1);
    if (strategySignalUsed === 'buy') score += 0.4;
    else if (strategySignalUsed === 'sell') score -= 0.4;
  } else {
    if (sma20 != null && last > sma20) score += 0.12;
    if (sma20 != null && last < sma20) score -= 0.12;
    if (sma50 != null && sma20 != null && sma20 > sma50) score += 0.08;
    if (rsi14 != null && rsi14 > 70) score -= 0.1;
    if (rsi14 != null && rsi14 < 30) score += 0.08;
  }
  if ((input.indicatorHint?.fvgCount || 0) > 0) score += 0.04;
  if ((input.indicatorHint?.obCount || 0) > 0) score += 0.04;
  if (/cut|stop|loss|failed/i.test(memCtx) && score > 0) score *= 0.85;

  steps.push(step(
    'score',
    'Edge score',
    strategyIsDistinct
      ? `score=${score.toFixed(3)} · strategy=${input.strategy} signal=${strategySignalUsed} · learnBias(display only, not in score)=${learning.aggressiveness.toFixed(2)} winRate=${(learning.winRate * 100).toFixed(0)}%`
      : `score=${score.toFixed(3)} · SMA20=${sma20?.toFixed(2) ?? 'n/a'} RSI=${rsi14?.toFixed(1) ?? 'n/a'}${input.strategy ? ` · strategy=${input.strategy} (proxy, no distinct logic yet)` : ''} · learnBias(display only, not in score)=${learning.aggressiveness.toFixed(2)} winRate=${(learning.winRate * 100).toFixed(0)}%`,
    Math.abs(score),
  ));

  // A clean signal from a genuinely-distinct strategy (the same logic its own
  // backtest just validated) is a real, standalone edge — it shouldn't need a
  // fresh research report to clear the confidence floor. Without this bonus a
  // clean strategy buy scores ~46% and is permanently blocked by the 58% floor,
  // so the agent could only ever trade when the full VPS research/LLM stack was
  // healthy AND producing confident intel — i.e. it never traded on the demo
  // account off its own setups when the crew was degraded. The learned floor
  // (recomputed from real outcomes) still applies on top, so a losing streak
  // still tightens selectivity; this only lets a proven technical setup stand
  // on its own.
  const strategyFired = (strategyIsDistinct || usesFrameworkSignal) && strategySignalUsed != null && strategySignalUsed !== 'hold';
  const strategyConfBonus = strategyFired ? 0.15 : 0;
  const confidence = Math.min(
    0.92,
    Math.max(0.35, Math.abs(score) * 0.75 + (intel?.confidence ?? 0.45) * 0.35 + strategyConfBonus),
  );

  let action: TradingAgentDecision['action'] = 'hold';
  if (score >= 0.35) action = 'buy';
  else if (score <= -0.35) action = 'sell';

  const posQty = effective.positionQty(symbol);
  if (action === 'sell' && posQty <= 0 && !risk.allowShort) {
    action = 'hold';
    steps.push(step('risk', 'No short', 'Sell signal but no long position and shorts disabled.', 0));
  }

  const eq = eqForBreaker;
  const minConf = Math.max(
    input.minConfidence ?? risk.minConfidence,
    learning.learnedMinConfidence,
  );
  const riskPct = input.riskPct ?? risk.riskPerTradePct;
  const today = new Date().toISOString().slice(0, 10);
  const tradesToday = account.trades.filter(t => t.createdAt.startsWith(today)).length;

  let blockedByRisk: string | undefined;
  if (breaker.tripped) {
    blockedByRisk = breaker.trippedReason ?? 'Circuit breaker tripped — reset manually to resume';
  } else if (tradesToday >= risk.maxTradesPerDay) {
    blockedByRisk = `Max trades/day (${risk.maxTradesPerDay}) [${risk.mode}]`;
  }
  if (!blockedByRisk && confidence < minConf && (action === 'buy' || action === 'sell')) {
    blockedByRisk = `Confidence ${(confidence * 100).toFixed(0)}% < floor ${(minConf * 100).toFixed(0)}%`;
  }

  steps.push(step(
    'risk',
    blockedByRisk ? 'Risk blocked' : 'Risk OK',
    blockedByRisk ||
      `mode=${risk.mode} risk/trade=${(riskPct * 100).toFixed(2)}% minConf=${(minConf * 100).toFixed(0)}% tradesToday=${tradesToday}/${risk.maxTradesPerDay}`,
    blockedByRisk ? 0 : 1,
  ));

  const riskBudget = eq * riskPct;
  let qty = 0;
  if (action === 'buy' && !blockedByRisk) {
    qty = Math.floor((riskBudget / last) * 1000) / 1000;
    if (qty * last < 10) qty = 0;
  } else if (action === 'sell' && posQty > 0 && !blockedByRisk) {
    qty = Math.min(posQty, Math.floor((riskBudget / last) * 1000) / 1000 || posQty);
  }

  steps.push(step('size', 'Position sizing', `equity=$${eq.toFixed(0)} (${effective.isReal ? 'live MT5' : 'paper'}) budget=$${riskBudget.toFixed(0)} qty=${qty}`, qty));

  // ATR-based protective stop + target — falls back to a flat 1% of price
  // when there isn't enough bar history for a real ATR yet (new symbol,
  // thin data), rather than shipping the order with no stop at all.
  const slDistance = (atr14 ?? last * 0.01) * SL_ATR_MULTIPLE;
  const tpDistance = slDistance * REWARD_RISK_RATIO;
  const stopLoss = qty > 0 ? (action === 'buy' ? last - slDistance : last + slDistance) : null;
  const takeProfit = qty > 0 ? (action === 'buy' ? last + tpDistance : last - tpDistance) : null;
  if (qty > 0) {
    steps.push(step(
      'size',
      'Protective levels',
      `ATR14=${atr14?.toFixed(4) ?? 'n/a (flat 1% fallback)'} · SL=${stopLoss?.toFixed(4)} (${SL_ATR_MULTIPLE}x) · TP=${takeProfit?.toFixed(4)} (${REWARD_RISK_RATIO}R)`,
    ));
  }

  const rationale = [
    `Agent ${symbol} @ ${last.toFixed(4)} (${snap.source}).`,
    intel
      ? `Intel ${intel.signal} ${(intel.confidence * 100).toFixed(0)}%: ${intel.thesis.slice(0, 160)}`
      : 'Tape-only (no completed intel).',
    `Score ${score.toFixed(3)} → ${action.toUpperCase()} conf ${(confidence * 100).toFixed(0)}%.`,
    blockedByRisk ? `RISK: ${blockedByRisk}` : `Size qty=${qty}.`,
    `Learn: winRate ${(learning.winRate * 100).toFixed(0)}% minConf ${learning.learnedMinConfidence.toFixed(2)}.`,
  ].join(' ');

  const decision: TradingAgentDecision = {
    id: crypto.randomUUID?.() ?? `dec-${Date.now()}`,
    symbol,
    action,
    qty: qty || undefined,
    confidence,
    rationale,
    inputs: {
      lastPrice: last,
      signal: intel?.signal,
      intelId: intel?.id,
      memoryKeys: ['ta:context', 'risk', 'learning'],
    },
    createdAt: new Date().toISOString(),
  };

  await rememberTradeDecision(decision);
  if (intel?.thesis) await rememberOpenThesis(symbol, intel.thesis);

  // Structured brain record. Written for every decision including holds and
  // risk-blocked ones: a review that only sees executed trades cannot tell
  // whether the agent was right to stay out.
  await recordTrade({
    id: decision.id,
    symbol,
    action,
    qty: qty || undefined,
    confidence,
    rationale,
    context: {
      lastPrice: last,
      indicators: { score, source: snap.source, blockedByRisk: blockedByRisk || null },
      intelIds: intel?.id ? [intel.id] : [],
    },
    createdAt: decision.createdAt,
  });

  if (intel?.thesis) {
    // Snapshot the research as it stood at decision time — the live report can
    // be superseded later, and a post-mortem needs what was actually on the
    // table, not what the crew concluded afterwards.
    await recordIntelSnapshot({
      symbol,
      cycleId: intel.id,
      signal: intel.signal,
      thesis: intel.thesis,
    });
    await recordThesis(symbol, intel.thesis, intel.confidence);
  }

  const shouldExec =
    Boolean(input.autoExecute) &&
    !blockedByRisk &&
    (action === 'buy' || action === 'sell') &&
    qty > 0;

  let tradeId: string | undefined;
  let error: string | undefined;

  if (shouldExec) {
    const placed = await brokerPlaceOrder({
      account: input.account,
      symbol,
      side: action === 'buy' ? 'buy' : 'sell',
      qty,
      reason: rationale.slice(0, 400),
      confidence,
      intelReportId: intel?.id,
      stopLoss,
      takeProfit,
      strategy: input.strategyName ?? input.strategy,
      timeframe: input.timeframe,
    });
    if (!placed.ok) {
      error = placed.error;
      steps.push(step('execute', 'Order rejected', placed.error || 'unknown', 0));
      await rememberLesson(symbol, `Order rejected: ${placed.error}`);
      // A rejected order is a process failure, not a market loss — file it
      // where the agent reads before sizing the next one.
      await recordMistake({
        tradeId: decision.id,
        symbol,
        kind: 'execution',
        detail: `Order rejected by broker: ${placed.error ?? 'unknown'}`,
        correction: 'Verify buying power, symbol tradability and order type before sizing.',
      });
    } else {
      tradeId = placed.tradeId;
      decision.executedTradeId = tradeId;
      steps.push(step('execute', 'Demo fill', `${action.toUpperCase()} ${qty} @ ${placed.price}`, 1));
      await rememberTradeDecision(decision);
      await rememberLesson(symbol, `Filled ${action} ${qty} @ ${placed.price}`, confidence);
    }
  } else {
    steps.push(step(
      'execute',
      'No fill',
      blockedByRisk || (action === 'hold' ? 'HOLD' : 'autoExecute off or qty=0'),
      0,
    ));
    if (action === 'hold') await rememberLesson(symbol, `HOLD score=${score.toFixed(3)}`);
  }

  steps.push(step(
    'learn',
    'Learning state',
    learning.lastLesson ||
      `trades=${learning.tradesClosed} winRate=${(learning.winRate * 100).toFixed(0)}% minConf=${learning.learnedMinConfidence.toFixed(2)}`,
    learning.winRate,
  ));

  const trace: ThinkingTrace = {
    decisionId: decision.id,
    symbol,
    steps,
    finalAction: action,
    confidence,
    blockedByRisk,
    createdAt: new Date().toISOString(),
    // Same two values already written onto the decision at line ~557, so the
    // trace and the decision can no longer disagree about who decided.
    strategy: input.strategyName ?? input.strategy,
    timeframe: input.timeframe,
  };
  await saveThinkingTrace(trace);

  return {
    decision,
    trace,
    tradeId,
    error,
    accountCash: effective.isReal ? effective.equity : account.cash,
    blockedByRisk,
    message: `${action.toUpperCase()} ${symbol} conf=${(confidence * 100).toFixed(0)}%${tradeId ? ` · fill ${tradeId}` : blockedByRisk ? ` · ${blockedByRisk}` : ''}`,
  };
}

export async function latestIntelForSymbol(symbol: string): Promise<TradingIntelReport | null> {
  const reports = await listIntelReports();
  const s = symbol.toUpperCase();
  return (
    reports.find(r => r.ticker === s && r.status === 'complete') ||
    reports.find(r => r.ticker.startsWith(s.split('-')[0]) && r.status === 'complete') ||
    null
  );
}
