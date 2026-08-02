/**
 * Companion-style chart for AXE CORE.
 *
 * Note on engine: the published AXE-COMPANION-OS repo drives the canvas with
 * TradingView Lightweight Charts (`createChart` from `lightweight-charts`) with
 * `attributionLogo: false` (no TV logo). Custom SMC (FVG, iFVG, OB, PDH/PDL, fib)
 * is drawn as overlays — same product feel as Companion. If you have a private
 * klinecharts branch, that code is not in the public tree we ported from.
 *
 * Companion repo is never modified by this module.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { metaApiGetHistoricalCandles } from '@/infrastructure/gateways/metaApiMarketData';
import { getMetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { detectAllSmc, type Bar } from '@/presentation/components/trading/smcDetect';

type Props = {
  symbol?: string;
  timeframe?: string;
  height?: number;
};

function toBars(
  candles: { time: string; open: number; high: number; low: number; close: number }[],
): Bar[] {
  return candles
    .map(c => ({
      time: Math.floor(Date.parse(c.time) / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    .filter(b => Number.isFinite(b.time))
    .sort((a, b) => a.time - b.time);
}

export function CompanionStyleChart({ symbol = 'XAUUSD', timeframe = '1h', height = 360 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [status, setStatus] = useState('Loading…');
  const [bars, setBars] = useState<Bar[]>([]);
  const [show, setShow] = useState({ fvg: true, ob: true, pdh: true, fib: true });

  const smc = useMemo(() => detectAllSmc(bars), [bars]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await getMetaApiConfig();
      if (!cfg?.token) {
        setStatus('Configure MetaAPI token + account under Agent tab');
        return;
      }
      setStatus('Fetching MT5 candles…');
      const res = await metaApiGetHistoricalCandles({ symbol, timeframe, limit: 300 });
      if (cancelled) return;
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      setBars(toBars(res.candles));
      setStatus(`${symbol} · ${timeframe} · ${res.candles.length} bars · MetaAPI`);
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || bars.length === 0) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#050608' },
        textColor: 'rgba(200,210,220,0.85)',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(255,255,255,0.04)', style: LineStyle.Solid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
      autoSize: true,
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = series;

    series.setData(
      bars.map(b => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    // Fib + PDH/PDL as price lines
    if (show.fib) {
      for (const f of smc.fib) {
        series.createPriceLine({
          price: f.price,
          color: 'rgba(168,85,247,0.45)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: f.label,
        });
      }
    }
    if (show.pdh) {
      for (const z of smc.zones.filter(z => z.kind === 'pdh' || z.kind === 'pdl')) {
        series.createPriceLine({
          price: z.top,
          color: z.kind === 'pdh' ? 'rgba(34,211,238,0.85)' : 'rgba(244,63,94,0.85)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: z.label,
        });
      }
    }
    // FVG / OB mid lines
    if (show.fvg) {
      for (const z of smc.zones.filter(z => z.kind === 'fvg' || z.kind === 'ifvg')) {
        const mid = (z.top + z.bottom) / 2;
        series.createPriceLine({
          price: mid,
          color: z.dir === 'up' ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: z.label,
        });
      }
    }
    if (show.ob) {
      for (const z of smc.zones.filter(z => z.kind === 'ob')) {
        series.createPriceLine({
          price: (z.top + z.bottom) / 2,
          color: z.dir === 'up' ? 'rgba(56,189,248,0.5)' : 'rgba(251,146,60,0.5)',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `OB ${z.dir}`,
        });
      }
    }

    const visible = Math.min(100, bars.length);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, bars.length - visible),
      to: bars.length + 4,
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [bars, show, smc]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        <span>{status}</span>
        <span className="ml-auto flex gap-1">
          {(['fvg', 'ob', 'pdh', 'fib'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(s => ({ ...s, [k]: !s[k] }))}
              className="px-1.5 py-0.5 rounded"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                color: show[k] ? '#a5f3fc' : 'rgba(255,255,255,0.3)',
              }}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <div ref={hostRef} className="w-full rounded-lg overflow-hidden" style={{ height, background: '#050608' }} />
      <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
        Engine: Lightweight Charts (Companion canvas path, logo off). SMC overlays: FVG · iFVG · OB · PDH/PDL · Fib.
        Companion app unchanged.
      </p>
    </div>
  );
}
