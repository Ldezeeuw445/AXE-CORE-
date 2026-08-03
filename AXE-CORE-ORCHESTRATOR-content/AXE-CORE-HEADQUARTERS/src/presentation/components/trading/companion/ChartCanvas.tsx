/**
 * Companion-compatible ChartCanvas for AXE CORE (lightweight-charts v5).
 * Supports live candle updates + volume histogram from tick/real volume.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import type { MetaApiCandle, AnnotationPoint } from "./types";
import type { ChartOverlayRow } from "./brokerTypes";
import { getChartTheme, type ChartThemeKey } from "./chartTheme";
import { priceDigitsForSymbol } from "./symbolFormat";

type DrawingMode = "fib_retracement" | "trendline" | "rectangle" | "text" | "horizontal_level" | null;

type Props = {
  candles: MetaApiCandle[];
  overlays?: ChartOverlayRow[];
  pendingOrders?: unknown[];
  symbol: string;
  annotations?: unknown[];
  drawingMode?: DrawingMode;
  onPointClick?: (point: AnnotationPoint) => void;
  themeKey?: ChartThemeKey;
  compactLayout?: boolean;
  showVolume?: boolean;
};

export type ChartCanvasHandle = {
  updateLastCandle: (candle: MetaApiCandle) => void;
  applyTick: (price: number, volumeDelta?: number) => void;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => number | null;
  fitContent: () => void;
  setViewportPreset: (preset: number) => void;
  subscribeViewport: (cb: () => void) => () => void;
  getRightAxisWidth: () => number;
  scrollByPixels: (deltaX: number) => void;
};

function toUtcTimestamp(iso: string): UTCTimestamp | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function candleVolume(c: MetaApiCandle): number {
  const v = c.tickVolume ?? c.volume;
  return Number.isFinite(v as number) && (v as number) > 0 ? (v as number) : 0;
}

function buildSeriesData(candles: MetaApiCandle[]): CandlestickData[] {
  const data: CandlestickData[] = [];
  for (const c of candles) {
    const t = toUtcTimestamp(c.time);
    if (t == null) continue;
    data.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return data;
}

function buildVolumeData(candles: MetaApiCandle[]): HistogramData[] {
  const data: HistogramData[] = [];
  for (const c of candles) {
    const t = toUtcTimestamp(c.time);
    if (t == null) continue;
    const vol = candleVolume(c);
    const up = c.close >= c.open;
    data.push({
      time: t,
      value: vol,
      color: up ? "rgba(31,156,123,0.55)" : "rgba(201,84,80,0.55)",
    });
  }
  return data;
}

export const ChartCanvas = forwardRef<ChartCanvasHandle, Props>(function ChartCanvas(
  {
    candles,
    overlays = [],
    symbol,
    drawingMode = null,
    onPointClick,
    themeKey,
    compactLayout = false,
    showVolume = true,
  },
  ref,
) {
  const theme = getChartTheme(themeKey);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastBarRef = useRef<CandlestickData | null>(null);
  const lastVolRef = useRef<number>(0);
  const viewportSubscribersRef = useRef<Set<() => void>>(new Set());
  const drawingModeRef = useRef<DrawingMode>(drawingMode);
  const onPointClickRef = useRef(onPointClick);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  useEffect(() => {
    drawingModeRef.current = drawingMode;
    onPointClickRef.current = onPointClick;
  }, [drawingMode, onPointClick]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const digits = priceDigitsForSymbol(symbol);
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: theme.chartCanvasBackground },
        textColor: theme.textColor,
        fontSize: compactLayout ? 10 : 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: theme.borderColor,
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.12 },
      },
      timeScale: {
        borderColor: theme.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
      localization: {
        priceFormatter: (p: number) => p.toFixed(digits),
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme.bull,
      downColor: theme.bear,
      borderUpColor: theme.bullBorder,
      borderDownColor: theme.bearBorder,
      wickUpColor: theme.bullWick,
      wickDownColor: theme.bearWick,
      borderVisible: theme.borderVisible,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    if (showVolume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        borderVisible: false,
      });
      volumeRef.current = vol;
    } else {
      volumeRef.current = null;
    }

    const notify = () => {
      for (const cb of viewportSubscribersRef.current) {
        try { cb(); } catch { /* ignore */ }
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(notify);
    chart.subscribeClick((param: MouseEventParams) => {
      if (!drawingModeRef.current || !onPointClickRef.current) return;
      if (!param.point || param.time == null) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      const time = typeof param.time === "number" ? param.time : null;
      if (time == null) return;
      onPointClickRef.current({ time, price });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
    };
  }, [symbol, theme, compactLayout, showVolume]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = buildSeriesData(candles);
    if (!data.length) return;
    series.setData(data);
    lastBarRef.current = data[data.length - 1] ?? null;
    lastVolRef.current = candleVolume(candles[candles.length - 1] ?? ({} as MetaApiCandle));
    if (volumeRef.current) {
      volumeRef.current.setData(buildVolumeData(candles));
    }
    chart.timeScale().fitContent();
    for (const cb of viewportSubscribersRef.current) {
      try { cb(); } catch { /* ignore */ }
    }
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const lines: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];
    for (const o of overlays) {
      if (o.entryPrice != null && o.entryPrice > 0) {
        lines.push(
          series.createPriceLine({
            price: o.entryPrice,
            color: "rgba(250,204,21,0.7)",
            lineWidth: 1,
            axisLabelVisible: true,
            title: `AVG ${o.volume}`,
          }),
        );
      }
    }
    return () => {
      for (const l of lines) {
        try { series.removePriceLine(l); } catch { /* ignore */ }
      }
    };
  }, [overlays]);

  useImperativeHandle(ref, () => ({
    updateLastCandle: (candle: MetaApiCandle) => {
      const series = seriesRef.current;
      if (!series) return;
      const t = toUtcTimestamp(candle.time);
      if (t == null) return;
      const bar: CandlestickData = {
        time: t, open: candle.open, high: candle.high, low: candle.low, close: candle.close,
      };
      series.update(bar);
      lastBarRef.current = bar;
      const vol = candleVolume(candle);
      lastVolRef.current = vol;
      if (volumeRef.current) {
        volumeRef.current.update({
          time: t,
          value: vol,
          color: candle.close >= candle.open ? "rgba(31,156,123,0.55)" : "rgba(201,84,80,0.55)",
        });
      }
    },
    applyTick: (price: number, volumeDelta = 1) => {
      const series = seriesRef.current;
      const last = lastBarRef.current;
      if (!series || !last) return;
      const bar: CandlestickData = {
        ...last,
        close: price,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
      };
      series.update(bar);
      lastBarRef.current = bar;
      lastVolRef.current = Math.max(0, lastVolRef.current + Math.max(0, volumeDelta));
      if (volumeRef.current) {
        volumeRef.current.update({
          time: last.time,
          value: lastVolRef.current,
          color: price >= last.open ? "rgba(31,156,123,0.55)" : "rgba(201,84,80,0.55)",
        });
      }
    },
    priceToCoordinate: (price: number) => seriesRef.current?.priceToCoordinate(price) ?? null,
    timeToCoordinate: (time: number) =>
      chartRef.current?.timeScale().timeToCoordinate(time as UTCTimestamp) ?? null,
    coordinateToPrice: (y: number) => seriesRef.current?.coordinateToPrice(y) ?? null,
    coordinateToTime: (x: number) => {
      const t = chartRef.current?.timeScale().coordinateToTime(x);
      return typeof t === "number" ? t : null;
    },
    fitContent: () => chartRef.current?.timeScale().fitContent(),
    setViewportPreset: (preset: number) => {
      const chart = chartRef.current;
      if (!chart) return;
      const bars = [60, 120, 240][Math.min(2, Math.max(0, preset))] ?? 120;
      const data = buildSeriesData(candlesRef.current);
      const n = data.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - bars), to: n + 4 });
    },
    subscribeViewport: (cb: () => void) => {
      viewportSubscribersRef.current.add(cb);
      return () => { viewportSubscribersRef.current.delete(cb); };
    },
    getRightAxisWidth: () => 56,
    scrollByPixels: (deltaX: number) => {
      chartRef.current?.timeScale().scrollToPosition(
        (chartRef.current?.timeScale().scrollPosition() ?? 0) + deltaX / 10,
        false,
      );
    },
  }));

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      style={{
        cursor: drawingMode ? "crosshair" : undefined,
        userSelect: "none",
        touchAction: "none",
      }}
    />
  );
});

export default ChartCanvas;
