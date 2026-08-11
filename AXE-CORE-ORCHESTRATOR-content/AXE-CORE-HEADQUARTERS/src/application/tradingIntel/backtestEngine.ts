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

export type BacktestStrategyId = 'mean-reversion' | 'trend-follow' | 'smc-structure' | 'crew-hybrid';

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

function signalAt(
  strategy: BacktestStrategyId,
  i: number,
  closes: number[],
  sma20: Array<number | null>,
  sma50: Array<number | null>,
  rsi14: Array<number | null>,
): 'buy' | 'sell' | 'hold' {
  const c = closes[i];
  const s20 = sma20[i];
  const s50 = sma50[i];
  const r = rsi14[i];

  if (strategy === 'mean-reversion') {
    if (r == null) return 'hold';
    if (r < 30) return 'buy';
    if (r > 70) return 'sell';
    return 'hold';
  }

  if (strategy === 'trend-follow') {
    if (s20 == null || s50 == null) return 'hold';
    const prevS20 = sma20[i - 1];
    const prevS50 = sma50[i - 1];
    if (prevS20 == null || prevS50 == null) return 'hold';
    const crossedUp = prevS20 <= prevS50 && s20 > s50;
    const crossedDown = prevS20 >= prevS50 && s20 < s50;
    if (crossedUp) return 'buy';
    if (crossedDown) return 'sell';
    return 'hold';
  }

  // smc-structure / crew-hybrid: full SMC pattern detection (BOS/MSS/OB/FVG)
  // lives in ChartIndicatorLayer.tsx as canvas-coordinate React rendering,
  // not yet extracted into a pure series function. Until that extraction
  // happens, both fall back to a blended trend+mean-reversion proxy so the
  // rail isn't dead — flagged clearly in the result's `note` field.
  if (s20 == null || s50 == null || r == null) return 'hold';
  const trendUp = s20 > s50;
  if (trendUp && r < 45) return 'buy';
  if (!trendUp && r > 55) return 'sell';
  return 'hold';
}

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
  const sma20 = smaSeries(closes, 20);
  const sma50 = smaSeries(closes, 50);
  const rsi14 = rsiSeries(closes, 14);

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

    const sig = signalAt(input.strategy, i, closes, sma20, sma50, rsi14);

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
      input.strategy === 'mean-reversion' || input.strategy === 'trend-follow'
        ? 'Technical-only backtest — live intel/research from the crew is not included (no historical archive to replay).'
        : `"${input.strategy}" has no dedicated backtest logic yet — this run used the same generic trend+RSI proxy as every other unimplemented strategy, so results are identical across all of them. Only Mean Reversion and Trend Follow are genuinely distinct right now.`,
  };

  return { ok: true, result };
}
