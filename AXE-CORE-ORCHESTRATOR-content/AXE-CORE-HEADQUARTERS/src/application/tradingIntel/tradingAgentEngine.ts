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
import { listIntelReports } from '@/infrastructure/persistence/tradingIntelService';
import {
  getDemoAccount,
  markPositions,
  positionFor,
  equity as accountEquity,
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
import { brokerPlaceOrder } from '@/infrastructure/gateways/brokerConnector';

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

  const [snap, reports, memCtx, account, risk, learning] = await Promise.all([
    fetchMarketSnapshot(symbol),
    listIntelReports(),
    buildTradingAgentContext(symbol),
    getDemoAccount(),
    getRiskProfile(),
    getLearningStats(),
  ]);

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
  const eqForBreaker = accountEquity(account);
  const breaker = await checkAndUpdateCircuitBreaker(eqForBreaker, risk.maxDrawdownPct ?? 0.12);
  steps.push(step(
    'risk',
    breaker.tripped ? 'Circuit breaker TRIPPED' : 'Circuit breaker OK',
    breaker.tripped
      ? (breaker.trippedReason ?? 'Drawdown limit exceeded — reset manually from the Scorecard to resume.')
      : `equity $${eqForBreaker.toFixed(0)} · peak $${breaker.peakEquity.toFixed(0)}`,
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

  if (sma20 != null && last > sma20) score += 0.12;
  if (sma20 != null && last < sma20) score -= 0.12;
  if (sma50 != null && sma20 != null && sma20 > sma50) score += 0.08;
  if (rsi14 != null && rsi14 > 70) score -= 0.1;
  if (rsi14 != null && rsi14 < 30) score += 0.08;
  if ((input.indicatorHint?.fvgCount || 0) > 0) score += 0.04;
  if ((input.indicatorHint?.obCount || 0) > 0) score += 0.04;
  if (/cut|stop|loss|failed/i.test(memCtx) && score > 0) score *= 0.85;

  steps.push(step(
    'score',
    'Edge score',
    `score=${score.toFixed(3)} · SMA20=${sma20?.toFixed(2) ?? 'n/a'} RSI=${rsi14?.toFixed(1) ?? 'n/a'} · learnBias(display only, not in score)=${learning.aggressiveness.toFixed(2)} winRate=${(learning.winRate * 100).toFixed(0)}%`,
    Math.abs(score),
  ));

  const confidence = Math.min(
    0.92,
    Math.max(0.35, Math.abs(score) * 0.75 + (intel?.confidence ?? 0.45) * 0.35),
  );

  let action: TradingAgentDecision['action'] = 'hold';
  if (score >= 0.35) action = 'buy';
  else if (score <= -0.35) action = 'sell';

  const pos = positionFor(account, symbol);
  if (action === 'sell' && (!pos || pos.qty <= 0) && !risk.allowShort) {
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
  } else if (action === 'sell' && pos && !blockedByRisk) {
    qty = Math.min(pos.qty, Math.floor((riskBudget / last) * 1000) / 1000 || pos.qty);
  }

  steps.push(step('size', 'Position sizing', `equity=$${eq.toFixed(0)} budget=$${riskBudget.toFixed(0)} qty=${qty}`, qty));

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
      symbol,
      side: action === 'buy' ? 'buy' : 'sell',
      qty,
      reason: rationale.slice(0, 400),
      confidence,
      intelReportId: intel?.id,
      stopLoss,
      takeProfit,
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
  };
  await saveThinkingTrace(trace);

  return {
    decision,
    trace,
    tradeId,
    error,
    accountCash: account.cash,
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
