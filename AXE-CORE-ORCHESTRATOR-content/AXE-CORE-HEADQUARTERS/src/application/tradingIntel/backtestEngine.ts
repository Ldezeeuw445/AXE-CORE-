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
import { metaApiGetHistoricalCandles, type MetaApiCandle } from '@/infrastructure/gateways/metaApiMarketData';
import { fetchHistoricalCandles } from '@/infrastructure/gateways/axeCoreApiService';
import { smaSeries, rsiSeries } from '@/presentation/components/trading/companion/indicatorMath';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId, type StrategySeries } from '@/application/tradingIntel/strategySignals';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

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
  const timeframe = input.timeframe ?? '1h';
  const limit = Math.min(Math.max(input.limit ?? 500, 100), 1000);

  // MetaAPI's own broker history is the primary source — it matches exactly
  // what the live agent trades against. Falls back to the TwelveData proxy
  // (backend/axe_api/main.py's /market/history) only when that isn't
  // available: no MT5 connected yet, or the broker doesn't carry the symbol.
  // Never silently substitutes fake data — a real failure from both sources
  // still surfaces as ok:false, not a synthetic result.
  let candles: MetaApiCandle[];
  let source: 'metaapi' | 'twelvedata' = 'metaapi';
  const primary = await metaApiGetHistoricalCandles({ symbol, timeframe, limit });
  if (primary.ok && primary.candles.length >= 60) {
    candles = primary.candles;
  } else {
    try {
      const fallback = await fetchHistoricalCandles(symbol, timeframe, limit);
      if (fallback.candles.length < 60) {
        return {
          ok: false,
          error: `Only ${fallback.candles.length} candles available from TwelveData (MetaAPI: ${primary.ok ? `${primary.candles.length} candles, need 60+` : primary.error}) — need at least 60 for warm-up.`,
        };
      }
      candles = fallback.candles;
      source = 'twelvedata';
    } catch (e) {
      return {
        ok: false,
        error: `MetaAPI: ${primary.ok ? `only ${primary.candles.length} candles` : primary.error} · TwelveData fallback also failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  const closes = candles.map(c => c.close);
  // volumetric-ob needs real volume — MetaAPI candles carry tickVolume/volume,
  // TwelveData's fallback always has a `volume` field (often 0 for FX, which
  // the strategy's own averaging naturally treats as "no signal" rather than
  // a fabricated one). Only attach the series when every bar actually has a
  // value at all.
  const volumeOf = (c: (typeof candles)[number]): number | undefined =>
    'tickVolume' in c ? (c.tickVolume ?? c.volume) : c.volume;
  const volumes = candles.every(c => volumeOf(c) != null) ? candles.map(c => volumeOf(c) as number) : undefined;
  const series: StrategySeries = {
    closes,
    highs: candles.map(c => c.high),
    lows: candles.map(c => c.low),
    opens: candles.map(c => c.open),
    times: candles.map(c => c.time),
    volumes,
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
      (DISTINCT_STRATEGIES.has(input.strategy)
        ? 'Technical-only backtest — live intel/research from the crew is not included (no historical archive to replay).'
        : `"${input.strategy}" has no dedicated backtest logic yet — this run used the same generic trend+RSI proxy as every other unimplemented strategy, so results are identical across all of them. Only Mean Reversion and Trend Follow are genuinely distinct right now.`) +
      (source === 'twelvedata' ? ' Candles from TwelveData (MetaAPI unavailable for this symbol/account) — real data, but not the exact broker feed the live agent trades against.' : ''),
  };

  return { ok: true, result };
}

export interface AllPairsBacktestRow {
  symbol: string;
  result: BacktestResult | null;
  error?: string;
}

/**
 * Same backtest, one strategy, replayed across every symbol in `symbols` —
 * sequential, not parallel, same reasoning as agentAutopilot.ts's watchlist
 * loop: MetaAPI/TwelveData calls are already rate-limit-sensitive, and
 * running 17 pairs concurrently would multiply that pressure for no
 * benefit (a batch backtest isn't time-critical the way a live decision
 * cycle is).
 */
export async function runBacktestAllPairs(input: {
  symbols: readonly string[];
  strategy: BacktestStrategyId;
  timeframe?: string;
  limit?: number;
  onProgress?: (done: number, total: number, symbol: string) => void;
}): Promise<AllPairsBacktestRow[]> {
  const rows: AllPairsBacktestRow[] = [];
  for (let i = 0; i < input.symbols.length; i++) {
    const symbol = input.symbols[i];
    input.onProgress?.(i, input.symbols.length, symbol);
    const res = await runBacktest({ symbol, strategy: input.strategy, timeframe: input.timeframe, limit: input.limit });
    rows.push(res.ok ? { symbol, result: res.result } : { symbol, result: null, error: res.error });
  }
  input.onProgress?.(input.symbols.length, input.symbols.length, '');
  return rows;
}

// ── Saved strategy runs — a small persisted library so a validated
// backtest doesn't just vanish the moment you click a different strategy.
// Stored as one JSON array via userSettingsService (same durable,
// cross-window store as everything else this session), not a new Supabase
// table — this is a simple growing list, not relational data.

export interface SavedStrategyRun {
  id: string;
  strategy: BacktestStrategyId;
  symbol: string;
  savedAt: string;
  note?: string;
  netReturnPct: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  maxDrawdownPct: number;
}

const SAVED_STRATEGIES_KEY = 'axe_trading_saved_strategies';

export async function getSavedStrategies(): Promise<SavedStrategyRun[]> {
  return loadSetting<SavedStrategyRun[]>(SAVED_STRATEGIES_KEY, []);
}

export async function saveStrategyRun(result: BacktestResult, note?: string): Promise<SavedStrategyRun[]> {
  const existing = await getSavedStrategies();
  const entry: SavedStrategyRun = {
    id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    strategy: result.strategy,
    symbol: result.symbol,
    savedAt: new Date().toISOString(),
    note,
    netReturnPct: result.netReturnPct,
    winRate: result.winRate,
    totalTrades: result.totalTrades,
    profitFactor: result.profitFactor,
    maxDrawdownPct: result.maxDrawdownPct,
  };
  const next = [entry, ...existing].slice(0, 100);
  await saveSetting(SAVED_STRATEGIES_KEY, next);
  return next;
}

export async function deleteSavedStrategyRun(id: string): Promise<SavedStrategyRun[]> {
  const existing = await getSavedStrategies();
  const next = existing.filter(s => s.id !== id);
  await saveSetting(SAVED_STRATEGIES_KEY, next);
  return next;
}
