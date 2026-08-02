/**
 * tradingAgentEngine — single demo trading agent.
 * Reads: latest intel + market snapshot + own global memory.
 * Writes: demo trades + trading-agent memory.
 * Never touches live capital.
 */
import type { TradingIntelReport } from '@/domain/tradingIntel/types';
import type { TradingAgentDecision } from '@/domain/tradingIntel/demoTypes';
import { listIntelReports } from '@/infrastructure/persistence/tradingIntelService';
import {
  executeDemoTrade,
  getDemoAccount,
  markPositions,
  positionFor,
} from '@/infrastructure/persistence/demoTradingService';
import {
  buildTradingAgentContext,
  rememberLesson,
  rememberOpenThesis,
  rememberTradeDecision,
} from '@/infrastructure/persistence/tradingAgentMemoryService';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { rsi, sma } from '@/infrastructure/gateways/marketDataService';

export interface AgentRunResult {
  decision: TradingAgentDecision;
  tradeId?: string;
  error?: string;
  accountCash?: number;
}

function signalToBias(signal: string): number {
  switch (signal) {
    case 'BUY':
      return 1;
    case 'SELL':
    case 'AVOID':
      return -1;
    case 'HOLD':
      return 0;
    default:
      return 0.15; // WATCH slight long bias only if tape agrees
  }
}

/**
 * Decide and optionally execute a demo trade for symbol.
 * autoExecute=true places paper order when confidence >= minConfidence.
 */
export async function runTradingAgent(input: {
  symbol: string;
  autoExecute?: boolean;
  minConfidence?: number;
  riskPct?: number; // fraction of equity per trade
}): Promise<AgentRunResult> {
  const symbol = input.symbol.trim().toUpperCase();
  const minConf = input.minConfidence ?? 0.58;
  const riskPct = input.riskPct ?? 0.02;

  const [snap, reports, memCtx, account] = await Promise.all([
    fetchMarketSnapshot(symbol),
    listIntelReports(),
    buildTradingAgentContext(symbol),
    getDemoAccount(),
  ]);

  const intel =
    reports.find(r => r.ticker === symbol && r.status === 'complete') ||
    reports.find(r => r.ticker.includes(symbol.split('-')[0]) && r.status === 'complete');

  const last = snap.last;
  await markPositions({ [symbol]: last });

  const bars = snap.bars;
  const sma20 = sma(bars, 20);
  const sma50 = sma(bars, Math.min(50, bars.length));
  const rsi14 = rsi(bars, 14);

  const bias = intel ? signalToBias(intel.signal) : 0;
  let score = bias * (intel?.confidence ?? 0.4);

  // Tape confirmation
  if (sma20 != null && last > sma20) score += 0.12;
  if (sma20 != null && last < sma20) score -= 0.12;
  if (sma50 != null && sma20 != null && sma20 > sma50) score += 0.08;
  if (rsi14 != null && rsi14 > 70) score -= 0.1;
  if (rsi14 != null && rsi14 < 30) score += 0.08;

  // Memory dampener: recent sell lesson reduces buy aggression
  if (/cut|stop|loss|failed/i.test(memCtx) && score > 0) score *= 0.85;

  const confidence = Math.min(0.92, Math.max(0.35, Math.abs(score) * 0.75 + (intel?.confidence ?? 0.45) * 0.35));

  let action: TradingAgentDecision['action'] = 'hold';
  if (score >= 0.35) action = 'buy';
  else if (score <= -0.35) action = 'sell';

  const pos = positionFor(account, symbol);
  if (action === 'sell' && (!pos || pos.qty <= 0)) {
    // No position — treat as hold unless strong avoid (still no short in v1 demo)
    action = 'hold';
  }

  const equity = account.cash + account.positions.reduce((s, p) => s + p.qty * (p.markPrice ?? p.avgPrice), 0);
  const riskBudget = equity * riskPct;
  let qty = 0;
  if (action === 'buy') {
    qty = Math.floor((riskBudget / last) * 1000) / 1000;
    if (qty * last < 10) qty = 0;
  } else if (action === 'sell' && pos) {
    qty = Math.min(pos.qty, Math.floor((riskBudget / last) * 1000) / 1000 || pos.qty);
  }

  const rationale = [
    `Agent decision on ${symbol} @ ${last.toFixed(4)} (${snap.source}).`,
    intel
      ? `Intel: ${intel.signal} conf ${(intel.confidence * 100).toFixed(0)}% — ${intel.thesis.slice(0, 180)}`
      : 'No completed intel report — tape-only mode.',
    `Indicators: SMA20=${sma20?.toFixed(2) ?? 'n/a'} SMA50=${sma50?.toFixed(2) ?? 'n/a'} RSI14=${rsi14?.toFixed(1) ?? 'n/a'}.`,
    `Score=${score.toFixed(3)} → ${action.toUpperCase()} (conf ${(confidence * 100).toFixed(0)}%).`,
    memCtx.slice(0, 240),
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
      memoryKeys: ['ta:context'],
    },
    createdAt: new Date().toISOString(),
  };

  await rememberTradeDecision(decision);
  if (intel?.thesis) await rememberOpenThesis(symbol, intel.thesis);

  const shouldExec =
    Boolean(input.autoExecute) &&
    confidence >= minConf &&
    (action === 'buy' || action === 'sell') &&
    qty > 0;

  if (!shouldExec) {
    if (action === 'hold') {
      await rememberLesson(symbol, `HOLD — score ${score.toFixed(3)}, waiting for clearer edge.`);
    }
    return { decision, accountCash: account.cash };
  }

  const result = await executeDemoTrade({
    symbol,
    side: action === 'buy' ? 'buy' : 'sell',
    qty,
    price: last,
    reason: rationale.slice(0, 400),
    confidence,
    intelReportId: intel?.id,
  });

  if ('error' in result) {
    await rememberLesson(symbol, `Order rejected: ${result.error}`);
    return { decision, error: result.error, accountCash: account.cash };
  }

  decision.executedTradeId = result.trade.id;
  await rememberTradeDecision(decision);
  await rememberLesson(
    symbol,
    `Executed ${result.trade.side.toUpperCase()} ${result.trade.qty} @ ${result.trade.price} — ${result.trade.reason.slice(0, 120)}`,
    confidence,
  );

  return {
    decision,
    tradeId: result.trade.id,
    accountCash: result.account.cash,
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
