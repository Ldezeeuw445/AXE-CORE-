/**
 * Decision — combine Scout/News/Sentiment/Charts/Risk into GO|WAIT|NO-GO.
 * Strategy signals (Gold ORB) use Charts levels + Risk; still propose-only by default.
 */
import type {
  ChartsResult,
  DecisionResult,
  RiskResult,
  ScoutResult,
  SentimentResult,
  TradeProposal,
} from '../types';
import { GOLD_ORB_STRATEGY_ID } from '../strategies';

export function runDecision(input: {
  scout: ScoutResult;
  sentiment: SentimentResult | null;
  charts: ChartsResult | null;
  risk: RiskResult | null;
  blockedByGuard?: boolean;
}): DecisionResult {
  if (input.blockedByGuard) {
    return {
      verdict: 'BLOCKED',
      confidence: 0,
      proposal: null,
      summary: 'Account allowlist rejected — fail closed',
      notes: ['guard'],
    };
  }

  const top = input.scout.candidates[0];
  if (!top) {
    return {
      verdict: 'WAIT',
      confidence: 0.2,
      proposal: null,
      summary: 'Scout returned no candidates',
      notes: ['empty scout'],
    };
  }

  if (input.risk && !input.risk.ok) {
    return {
      verdict: 'NO-GO',
      confidence: 0.35,
      proposal: null,
      summary: `Risk blocked: ${input.risk.blockedReasons.join(', ')}`,
      notes: input.risk.blockedReasons,
    };
  }

  const charts = input.charts;
  const sentiment = input.sentiment;
  const isOrb = top.strategyId === GOLD_ORB_STRATEGY_ID && top.strategySignal;
  if (!charts?.structureOk || charts.entry == null || charts.stopLoss == null || charts.takeProfit == null) {
    return {
      verdict: 'WAIT',
      confidence: 0.4,
      proposal: null,
      summary: 'Charts not ready for a proposal',
      notes: charts?.notes ?? [],
    };
  }

  const side = isOrb
    ? top.strategySignal!.side
    : charts.bias === 'bearish' ? 'sell' : 'buy';
  const aligned =
    !sentiment || sentiment.bias === 'neutral' ||
    (side === 'buy' ? sentiment.bias === 'bullish' : sentiment.bias === 'bearish');

  let confidence = isOrb ? 0.62 : 0.55;
  if (aligned) confidence += 0.12;
  if (isOrb) {
    confidence += 0.1; // concrete strategy setup
    if (top.strategySignal?.filterSummary?.includes('volatility:ok')) confidence += 0.05;
  } else if ((charts.riskReward ?? 0) >= 2.2) {
    confidence += 0.1;
  }
  if ((sentiment?.score ?? 50) >= 65 || (sentiment?.score ?? 50) <= 35) confidence += 0.05;
  confidence = Math.min(0.92, confidence);

  const proposal: TradeProposal = {
    symbol: top.symbol,
    side,
    entry: charts.entry,
    stopLoss: charts.stopLoss,
    takeProfit: charts.takeProfit,
    riskReward: charts.riskReward,
    lots: input.risk?.suggestedLots ?? top.strategySignal?.lots ?? 0.1,
    rationale: isOrb
      ? `Gold ORB 1AM NY ${side.toUpperCase()} XAUUSD — ORB ${top.strategySignal!.orbLow}–${top.strategySignal!.orbHigh}, TP ${top.strategySignal!.riskReward}R, filters=${top.strategySignal!.filterSummary ?? 'n/a'}. Scout: ${top.reason}`
      : `TEST Decision: ${charts.bias} structure, sentiment=${sentiment?.bias ?? 'n/a'}, R:R=${(charts.riskReward ?? 0).toFixed(2)}. Scout: ${top.reason}`,
  };

  const verdict = confidence >= 0.7 && (isOrb || aligned) ? 'GO' : 'WAIT';
  return {
    verdict,
    confidence,
    proposal,
    summary:
      verdict === 'GO'
        ? `GO ${side.toUpperCase()} ${top.symbol} @ ${charts.entry}${isOrb ? ' [gold-orb-1am-ny]' : ''}`
        : `WAIT — confidence ${confidence.toFixed(2)} or sentiment misaligned`,
    notes: [
      `aligned=${aligned}`,
      isOrb ? `strategy=${GOLD_ORB_STRATEGY_ID}` : 'strategy=none',
      ...(input.risk?.checks.map(c => `${c.id}:${c.ok}`) ?? []),
    ],
  };
}
