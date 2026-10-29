/**
 * Charts — HTF/LTF structure + entry/SL/TP.
 * When Scout carries a strategy signal (Gold ORB), Charts validates that
 * range/R:R instead of inventing a separate swing setup.
 */
import { fetchEodHistory } from '@/infrastructure/gateways/researchSources';
import type { ChartsResult, ScoutCandidate, SentimentResult } from '../types';
import { GOLD_ORB_STRATEGY_ID } from '../strategies';

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

export async function runCharts(
  symbol: string,
  sentiment: SentimentResult | null,
  scoutTop?: ScoutCandidate | null,
): Promise<ChartsResult> {
  const notes: string[] = [];
  const sig = scoutTop?.strategySignal;
  if (sig && scoutTop?.strategyId === GOLD_ORB_STRATEGY_ID && scoutTop.symbol === symbol) {
    const risk = Math.abs(sig.entry - sig.stopLoss);
    const reward = Math.abs(sig.takeProfit - sig.entry);
    const riskReward = risk > 0 ? reward / risk : sig.riskReward;
    // Gold ORB uses 0.5R by design — structureOk when levels are coherent.
    const structureOk = risk > 0 && Number.isFinite(sig.entry) && riskReward > 0;
    notes.push(
      `strategy=${GOLD_ORB_STRATEGY_ID}`,
      `ORB ${sig.orbLow}–${sig.orbHigh}`,
      `R:R=${riskReward.toFixed(2)} (strategy TP, not generic 1:2)`,
      ...(sig.notes ?? []).slice(0, 4),
    );
    return {
      symbol,
      bias: sig.side === 'buy' ? 'bullish' : 'bearish',
      entry: sig.entry,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit,
      riskReward,
      structureOk,
      notes,
    };
  }

  let closes: number[] = [];
  try {
    const bars = await fetchEodHistory(symbol, daysAgoIso(60));
    closes = (bars ?? []).map(b => Number(b.close)).filter(n => Number.isFinite(n));
  } catch (e) {
    notes.push(`ohlc unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (closes.length < 5) {
    return {
      symbol,
      bias: sentiment?.bias ?? 'neutral',
      structureOk: false,
      notes: [...notes, 'insufficient bars for structure — Charts abstains'],
    };
  }

  const last = closes[closes.length - 1]!;
  const prev = closes[closes.length - 5]!;
  const swingHigh = Math.max(...closes.slice(-20));
  const swingLow = Math.min(...closes.slice(-20));
  const up = last > prev;
  const bias: ChartsResult['bias'] = up ? 'bullish' : 'bearish';
  const aligned = !sentiment || sentiment.bias === 'neutral' || sentiment.bias === bias;

  const entry = last;
  let stopLoss: number;
  let takeProfit: number;
  if (bias === 'bullish') {
    stopLoss = Math.min(swingLow, last * 0.995);
    const risk = entry - stopLoss;
    takeProfit = entry + risk * 2.2;
  } else {
    stopLoss = Math.max(swingHigh, last * 1.005);
    const risk = stopLoss - entry;
    takeProfit = entry - risk * 2.2;
  }
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const riskReward = risk > 0 ? reward / risk : 0;
  const structureOk = riskReward >= 2 && aligned && risk > 0;

  notes.push(`bias=${bias} R:R=${riskReward.toFixed(2)} aligned=${aligned}`);
  return {
    symbol,
    bias,
    entry,
    stopLoss,
    takeProfit,
    riskReward,
    structureOk,
    notes,
  };
}
