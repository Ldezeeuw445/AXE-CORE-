/**
 * replay — wat de grafiek op replaycursor N mag laten zien, en niets meer.
 *
 * Een replay die de indicatoren over de hele geschiedenis berekent en dan bij N
 * "kijkt", laat de toekomst lekken: een iFVG die pas later geïnverteerd wordt,
 * een point of control dat bars na N meetelt, een order block dat op een latere
 * bar gemitigeerd is. De grafiek-indicatoren in ChartIndicatorLayer scannen
 * vooruit binnen de reeks die ze krijgen, dus de enige veilige regel is: ze
 * krijgen nooit meer dan bars 0..N.
 *
 * Dit is het ene frame waaruit de replay-grafiek tekent: de zichtbare candles,
 * de indicatorwaarden (met de wiskunde van de grafiek zelf), en de trades zoals
 * ze op N bekend waren — een uitstap die pas na N gebeurt, bestaat hier nog niet.
 */
import {
  atrSeries, bollingerBands, emaSeries, macdSeries, pointOfControl, rsiSeries, sessionVwap, smaSeries,
  type IndicatorMathCandle,
} from '@/domain/tradingIntel/indicatorMath';

export interface ReplayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickVolume?: number;
}

/** Een trade zoals de lab hem rapporteert (alleen wat de replay nodig heeft). */
export interface ReplayTradeInput {
  id: number;
  side: 'buy' | 'sell';
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  lots: number;
  pnl: number;
  exitReason: string;
}

export interface ReplayMarker {
  tradeId: number;
  time: string;
  kind: 'entry' | 'exit';
  side: 'buy' | 'sell';
  price: number;
  text: string;
}

export interface ReplayOpenTrade {
  tradeId: number;
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  lots: number;
  entryTime: string;
}

export interface ReplayIndicators {
  sma20: number | null;
  sma50: number | null;
  ema20: number | null;
  rsi14: number | null;
  atr14: number | null;
  macd: number | null;
  macdSignal: number | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  vwap: number | null;
  pointOfControl: number | null;
}

export interface ReplayFrame {
  cursor: number;
  time: string | null;
  candles: ReplayCandle[];
  indicators: ReplayIndicators;
  markers: ReplayMarker[];
  openTrades: ReplayOpenTrade[];
  closedTrades: number;
  realizedPnl: number;
}

const last = <T,>(xs: readonly T[]): T | null => (xs.length ? xs[xs.length - 1] : null);

/** De candles die op cursor N zichtbaar zijn: 0..N. Het enige wat indicatoren krijgen. */
export function replayWindow<T>(candles: readonly T[], cursor: number): T[] {
  const n = Math.max(-1, Math.min(cursor, candles.length - 1));
  return candles.slice(0, n + 1);
}

function indicatorsOf(visible: readonly ReplayCandle[]): ReplayIndicators {
  const closes = visible.map(c => c.close);
  const mathCandles: IndicatorMathCandle[] = visible.map(c => ({
    time: Math.floor(Date.parse(c.time) / 1000), open: c.open, high: c.high, low: c.low, close: c.close,
    volume: c.volume ?? c.tickVolume, tickVolume: c.tickVolume ?? c.volume,
  }) as IndicatorMathCandle);
  const macd = visible.length ? last(macdSeries(closes)) : null;
  const bb = visible.length ? last(bollingerBands(closes, 20, 2)) : null;
  const poc = visible.length ? pointOfControl(mathCandles) : null;
  return {
    sma20: last(smaSeries(closes, 20)),
    sma50: last(smaSeries(closes, 50)),
    ema20: last(emaSeries(closes, 20)),
    rsi14: last(rsiSeries(closes, 14)),
    atr14: visible.length > 14 ? last(atrSeries(mathCandles, 14)) : null,
    macd: macd?.macd ?? null,
    macdSignal: macd?.signal ?? null,
    bollingerUpper: bb?.upper ?? null,
    bollingerLower: bb?.lower ?? null,
    vwap: last(sessionVwap(mathCandles)),
    pointOfControl: poc?.price ?? null,
  };
}

export function replayFrame(
  candles: readonly ReplayCandle[],
  cursor: number,
  trades: readonly ReplayTradeInput[] = [],
): ReplayFrame {
  const visible = replayWindow(candles, cursor);
  const now = last(visible)?.time ?? null;
  const nowMs = now ? Date.parse(now) : -Infinity;
  const markers: ReplayMarker[] = [];
  const openTrades: ReplayOpenTrade[] = [];
  let closedTrades = 0;
  let realizedPnl = 0;
  for (const t of trades) {
    if (Date.parse(t.entryTime) > nowMs) continue;
    markers.push({
      tradeId: t.id, time: t.entryTime, kind: 'entry', side: t.side, price: t.entryPrice,
      text: `#${t.id} ${t.side === 'buy' ? 'BUY' : 'SELL'} ${t.lots}`,
    });
    if (Date.parse(t.exitTime) <= nowMs) {
      closedTrades += 1;
      realizedPnl += t.pnl;
      markers.push({
        tradeId: t.id, time: t.exitTime, kind: 'exit', side: t.side, price: t.exitPrice,
        text: `#${t.id} ${t.exitReason} ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(0)}`,
      });
    } else {
      openTrades.push({
        tradeId: t.id, side: t.side, entryPrice: t.entryPrice, stopLoss: t.stopLoss,
        takeProfit: t.takeProfit, lots: t.lots, entryTime: t.entryTime,
      });
    }
  }
  markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return {
    cursor: visible.length - 1,
    time: now,
    candles: visible,
    indicators: indicatorsOf(visible),
    markers,
    openTrades,
    closedTrades,
    realizedPnl,
  };
}
