/**
 * backtestEngine — replays historical MetaAPI candles through a rules-based
 * strategy and reports whether the underlying edge is real before the live
 * agent (tradingAgentEngine.ts) is trusted to trade it.
 *
 * Honest limitation: intel/research from the CrewAI desk is *current-only* —
 * there's no historical archive of past research calls to replay — so
 * backtests here score the technical/indicator side of a strategy only.
 * The live agent additionally weighs live intel on top of this.
 */
import { metaApiGetHistoricalCandles } from '@/infrastructure/gateways/metaApiMarketData';
import { smaSeries, rsiSeries } from '@/presentation/components/trading/companion/indicatorMath';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId, type StrategySeries } from '@/application/tradingIntel/strategySignals';

export type BacktestStrategyId = StrategyId;

export interface BacktestTrade {
  entryIndex: number;
  exitIndex: number;
  entryTime: string;
  exitTime: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  reason: 'signal-flip' | 'max-hold';
}

export interface BacktestResult {
  symbol: string;
  strategy: BacktestStrategyId;
  candleCount: number;
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  equityCurve: number[];
  note: string;
}

const MAX_HOLD_BARS = 24;

export async function runBacktest(input: {
  symbol: string;
  timeframe?: string;
  strategy: BacktestStrategyId;
  limit?: number;
}): Promise<{ ok: true; result: BacktestResult } | { ok: false; error: string }> {
  const symbol = input.symbol.trim().toUpperCase();
  const limit = Math.min(Math.max(input.limit ?? 500, 100), 1000);

  const res = await metaApiGetHistoricalCandles({ symbol, timeframe: input.timeframe ?? '1h', limit });
  if (!res.ok) return { ok: false, error: res.error };
  if (res.candles.length < 60) {
    return { ok: false, error: `Only ${res.candles.length} candles available — need at least 60 for warm-up.` };
  }

  const candles = res.candles;
  const closes = candles.map(c => c.close);
  const series: StrategySeries = {
    closes,
    highs: candles.map(c => c.high),
    lows: candles.map(c => c.low),
    times: candles.map(c => c.time),
    sma20: smaSeries(closes, 20),
    sma50: smaSeries(closes, 50),
    rsi14: rsiSeries(closes, 14),
  };

  const trades: BacktestTrade[] = [];
  let openSide: 'buy' | 'sell' | null = null;
  let entryIndex = 0;
  let entryPrice = 0;

  const equityCurve: number[] = [1];
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;

  const closeTrade = (exitIndex: number, reason: BacktestTrade['reason']) => {
    if (openSide == null) return;
    const exitPrice = closes[exitIndex];
    const raw = (exitPrice - entryPrice) / entryPrice;
    const returnPct = openSide === 'buy' ? raw : -raw;
    trades.push({
      entryIndex,
      exitIndex,
      entryTime: candles[entryIndex].time,
      exitTime: candles[exitIndex].time,
      side: openSide,
      entryPrice,
      exitPrice,
      returnPct,
      reason,
    });
    equity *= 1 + returnPct;
    equityCurve.push(equity);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    openSide = null;
  };

  const warmup = 51;
  for (let i = warmup; i < candles.length; i++) {
    if (openSide != null && i - entryIndex >= MAX_HOLD_BARS) {
      closeTrade(i, 'max-hold');
    }

    const sig = computeStrategySignal(input.strategy, series, i);

    if (openSide == null) {
      if (sig === 'buy' || sig === 'sell') {
        openSide = sig;
        entryIndex = i;
        entryPrice = closes[i];
      }
    } else if ((openSide === 'buy' && sig === 'sell') || (openSide === 'sell' && sig === 'buy')) {
      closeTrade(i, 'signal-flip');
      openSide = sig;
      entryIndex = i;
      entryPrice = closes[i];
    }
  }
  if (openSide != null) closeTrade(candles.length - 1, 'max-hold');

  const wins = trades.filter(t => t.returnPct > 0);
  const losses = trades.filter(t => t.returnPct <= 0);
  const avgWinPct = wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((s, t) => s + t.returnPct, 0) / losses.length : 0;
  const grossWin = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));

  const result: BacktestResult = {
    symbol,
    strategy: input.strategy,
    candleCount: candles.length,
    trades,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    avgWinPct,
    avgLossPct,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    netReturnPct: equity - 1,
    maxDrawdownPct: maxDrawdown,
    equityCurve,
    note:
      DISTINCT_STRATEGIES.has(input.strategy)
        ? 'Technical-only backtest — live intel/research from the crew is not included (no historical archive to replay).'
        : `"${input.strategy}" has no dedicated backtest logic yet — this run used the same generic trend+RSI proxy as every other unimplemented strategy, so results are identical across all of them. Only Mean Reversion and Trend Follow are genuinely distinct right now.`,
  };

  return { ok: true, result };
}
