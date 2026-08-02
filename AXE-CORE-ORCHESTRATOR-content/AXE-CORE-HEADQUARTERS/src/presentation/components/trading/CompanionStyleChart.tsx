/**
 * Companion-style trading desk chart for AXE CORE.
 * Engine: lightweight-charts (same as AXE-COMPANION-OS public repo).
 * Large canvas + SMC/indicator toolbar + execution bar + open/closed book.
 * Companion repo is never modified.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { metaApiGetHistoricalCandles } from '@/infrastructure/gateways/metaApiMarketData';
import { getMetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { fetchMarketSnapshot, sma, rsi } from '@/infrastructure/gateways/marketDataService';
import { detectAllSmc, type Bar } from '@/presentation/components/trading/smcDetect';
import {
  getDemoAccount,
  executeDemoTrade,
  equity,
  unrealizedPnl,
  markPositions,
} from '@/infrastructure/persistence/demoTradingService';
import { brokerPlaceOrder } from '@/infrastructure/gateways/brokerConnector';
import type { DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { toast } from 'sonner';

export type IndicatorSnapshot = {
  symbol: string;
  timeframe: string;
  last: number;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  fvgCount: number;
  obCount: number;
  pdh: number | null;
  pdl: number | null;
  fib382: number | null;
  fib618: number | null;
  bars: number;
};

type Props = {
  symbol?: string;
  timeframe?: string;
  /** Called whenever indicators recompute so the agent can read them */
  onIndicators?: (snap: IndicatorSnapshot) => void;
  className?: string;
};

const TFS = ['15m', '1h', '4h', '1d'] as const;

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
    .filter(b => Number.isFinite(b.time) && b.time > 0)
    .sort((a, b) => a.time - b.time);
}

function Toggle({
  on,
  label,
  color,
  onClick,
}: {
  on: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 rounded text-[10px] font-medium tracking-wide transition-all"
      style={{
        color: on ? color : 'rgba(255,255,255,0.35)',
        background: on ? `${color}22` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${on ? color + '55' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {label}
    </button>
  );
}

export function CompanionStyleChart({
  symbol = 'XAUUSD',
  timeframe: tfProp = '1h',
  onIndicators,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const [tf, setTf] = useState(tfProp);
  const [status, setStatus] = useState('Loading…');
  const [bars, setBars] = useState<Bar[]>([]);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [qty, setQty] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState({
    fvg: true,
    ifvg: true,
    ob: true,
    pdh: true,
    fib: true,
    sma20: true,
    sma50: true,
  });

  const smc = useMemo(() => detectAllSmc(bars), [bars]);
  const ohlc = useMemo(
    () => bars.map(b => ({ t: b.time * 1000, o: b.open, h: b.high, l: b.low, c: b.close })),
    [bars],
  );
  const closes = useMemo(() => bars.map(b => b.close), [bars]);
  const last = closes.length ? closes[closes.length - 1] : 0;
  const sma20 = useMemo(() => sma(ohlc, 20), [ohlc]);
  const sma50 = useMemo(() => sma(ohlc, 50), [ohlc]);
  const rsi14 = useMemo(() => rsi(ohlc, 14), [ohlc]);

  const snap: IndicatorSnapshot = useMemo(() => {
    const pdh = smc.zones.find(z => z.kind === 'pdh');
    const pdl = smc.zones.find(z => z.kind === 'pdl');
    const f382 = smc.fib.find(f => f.label.includes('38.2'));
    const f618 = smc.fib.find(f => f.label.includes('61.8'));
    return {
      symbol,
      timeframe: tf,
      last,
      sma20,
      sma50,
      rsi14,
      fvgCount: smc.zones.filter(z => z.kind === 'fvg').length,
      obCount: smc.zones.filter(z => z.kind === 'ob').length,
      pdh: pdh?.top ?? null,
      pdl: pdl?.top ?? null,
      fib382: f382?.price ?? null,
      fib618: f618?.price ?? null,
      bars: bars.length,
    };
  }, [symbol, tf, last, sma20, sma50, rsi14, smc, bars.length]);

  useEffect(() => {
    onIndicators?.(snap);
  }, [snap, onIndicators]);

  const reloadAccount = useCallback(async () => {
    const acc = await getDemoAccount();
    if (last > 0) {
      const marked = await markPositions({ [symbol.toUpperCase()]: last });
      setAccount(marked);
    } else {
      setAccount(acc);
    }
  }, [last, symbol]);

  useEffect(() => {
    void reloadAccount();
  }, [reloadAccount]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus('Loading candles…');
      const cfg = await getMetaApiConfig();
      if (cfg?.token && cfg.accountId) {
        const res = await metaApiGetHistoricalCandles({ symbol, timeframe: tf, limit: 400 });
        if (cancelled) return;
        if (res.ok && res.candles.length) {
          setBars(toBars(res.candles));
          setStatus(`${symbol} · ${tf} · MetaAPI · ${res.candles.length} bars`);
          return;
        }
        if (!res.ok) setStatus(`MetaAPI: ${res.error} — trying public feed…`);
      }
      try {
        const snapM = await fetchMarketSnapshot(symbol);
        if (cancelled) return;
        const mapped: Bar[] = snapM.bars.map(b => ({
          time: Math.floor(b.t / 1000),
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
        }));
        if (mapped.length) {
          setBars(mapped);
          setStatus(`${symbol} · ${tf} · public · ${mapped.length} bars`);
        } else {
          setStatus('No candles — set MetaAPI token/account or use a public symbol');
        }
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, tf]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !bars.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 480,
      layout: {
        background: { type: ColorType.Solid, color: '#050505' },
        textColor: 'rgba(245,240,230,0.55)',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
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

    if (show.sma20 && closes.length >= 20) {
      const s = chart.addSeries(LineSeries, {
        color: 'rgba(56,189,248,0.75)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const data = [];
      for (let i = 19; i < closes.length; i++) {
        const slice = closes.slice(i - 19, i + 1);
        const v = slice.reduce((a, b) => a + b, 0) / 20;
        data.push({ time: bars[i].time as UTCTimestamp, value: v });
      }
      s.setData(data);
    }
    if (show.sma50 && closes.length >= 50) {
      const s = chart.addSeries(LineSeries, {
        color: 'rgba(168,85,247,0.75)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      const data = [];
      for (let i = 49; i < closes.length; i++) {
        const slice = closes.slice(i - 49, i + 1);
        const v = slice.reduce((a, b) => a + b, 0) / 50;
        data.push({ time: bars[i].time as UTCTimestamp, value: v });
      }
      s.setData(data);
    }

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
    if (show.fvg) {
      for (const z of smc.zones.filter(z => z.kind === 'fvg')) {
        series.createPriceLine({
          price: (z.top + z.bottom) / 2,
          color: z.dir === 'up' ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: z.label,
        });
      }
    }
    if (show.ifvg) {
      for (const z of smc.zones.filter(z => z.kind === 'ifvg')) {
        series.createPriceLine({
          price: (z.top + z.bottom) / 2,
          color: z.dir === 'up' ? 'rgba(45,212,191,0.55)' : 'rgba(251,113,133,0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: 'iFVG',
        });
      }
    }
    if (show.ob) {
      for (const z of smc.zones.filter(z => z.kind === 'ob')) {
        series.createPriceLine({
          price: (z.top + z.bottom) / 2,
          color: z.dir === 'up' ? 'rgba(56,189,248,0.55)' : 'rgba(251,146,60,0.55)',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `OB ${z.dir}`,
        });
      }
    }

    if (account?.positions) {
      for (const p of account.positions) {
        if (p.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
        series.createPriceLine({
          price: p.avgPrice,
          color: 'rgba(250,204,21,0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `AVG ${p.qty}`,
        });
      }
    }

    const visible = Math.min(120, bars.length);
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, bars.length - visible),
      to: bars.length + 6,
    });

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: hostRef.current.clientWidth,
        height: hostRef.current.clientHeight || 480,
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, show, smc, symbol, account?.positions]);

  const place = async (side: 'buy' | 'sell') => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error('Invalid quantity');
      return;
    }
    setBusy(true);
    try {
      const res = await brokerPlaceOrder({
        symbol,
        side,
        qty: q,
        reason: 'Manual desk execution',
        confidence: 1,
      });
      if (!res.ok) {
        const price = last || (await fetchMarketSnapshot(symbol)).last;
        const paper = await executeDemoTrade({
          symbol,
          side,
          qty: q,
          price,
          reason: 'Manual desk (paper)',
          confidence: 1,
        });
        if ('error' in paper) {
          toast.error(paper.error);
        } else {
          toast.success(`${side.toUpperCase()} ${q} ${symbol} @ ${price}`);
          setAccount(paper.account);
        }
      } else {
        toast.success(`${side.toUpperCase()} via ${res.venue || 'broker'} @ ${res.price ?? 'mkt'}`);
        await reloadAccount();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const eq = account ? equity(account) : 0;
  const upnl = account ? unrealizedPnl(account) : 0;
  const openPos = account?.positions ?? [];
  const closed = (account?.trades ?? []).slice(0, 40);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, height: '100%' }}>
      <div className="flex items-center gap-2 flex-wrap px-1">
        <span className="text-sm font-semibold tracking-wide" style={{ color: '#F5F0E6' }}>{symbol}</span>
        <span className="text-[11px] font-mono-data" style={{ color: last ? '#F5F0E6' : 'rgba(255,255,255,0.35)' }}>
          {last ? last.toFixed(last > 100 ? 2 : 5) : '—'}
        </span>
        {rsi14 != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
            color: rsi14 > 70 ? '#f87171' : rsi14 < 30 ? '#34d399' : 'rgba(255,255,255,0.55)',
            background: 'rgba(255,255,255,0.05)',
          }}>
            RSI {rsi14.toFixed(1)}
          </span>
        )}
        {sma20 != null && (
          <span className="text-[10px]" style={{ color: 'rgba(56,189,248,0.85)' }}>SMA20 {sma20.toFixed(2)}</span>
        )}
        {sma50 != null && (
          <span className="text-[10px]" style={{ color: 'rgba(168,85,247,0.85)' }}>SMA50 {sma50.toFixed(2)}</span>
        )}
        <div className="flex-1" />
        <div className="flex gap-1">
          {TFS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className="px-2 py-0.5 rounded text-[10px]"
              style={{
                color: tf === t ? '#F5F0E6' : 'rgba(255,255,255,0.35)',
                background: tf === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: `1px solid ${tf === t ? 'rgba(255,255,255,0.18)' : 'transparent'}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap px-1">
        <span className="text-[9px] uppercase tracking-wider mr-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Indicators</span>
        <Toggle on={show.fvg} label="FVG" color="#34d399" onClick={() => setShow(s => ({ ...s, fvg: !s.fvg }))} />
        <Toggle on={show.ifvg} label="iFVG" color="#2dd4bf" onClick={() => setShow(s => ({ ...s, ifvg: !s.ifvg }))} />
        <Toggle on={show.ob} label="OB" color="#38bdf8" onClick={() => setShow(s => ({ ...s, ob: !s.ob }))} />
        <Toggle on={show.pdh} label="PDH/PDL" color="#22d3ee" onClick={() => setShow(s => ({ ...s, pdh: !s.pdh }))} />
        <Toggle on={show.fib} label="FIB" color="#a855f7" onClick={() => setShow(s => ({ ...s, fib: !s.fib }))} />
        <Toggle on={show.sma20} label="SMA20" color="#38bdf8" onClick={() => setShow(s => ({ ...s, sma20: !s.sma20 }))} />
        <Toggle on={show.sma50} label="SMA50" color="#a855f7" onClick={() => setShow(s => ({ ...s, sma50: !s.sma50 }))} />
        <span className="text-[10px] ml-2" style={{ color: 'rgba(255,255,255,0.28)' }}>{status}</span>
      </div>

      <div className="flex gap-2 flex-1" style={{ minHeight: 420 }}>
        <div
          ref={hostRef}
          className="flex-1 rounded-xl overflow-hidden"
          style={{
            background: '#050505',
            border: '1px solid rgba(255,255,255,0.06)',
            minHeight: 420,
            height: '100%',
          }}
        />
        <div
          className="w-[220px] shrink-0 flex flex-col gap-2 rounded-xl p-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="grid grid-cols-2 gap-1 text-[11px] font-mono-data">
            <div>
              <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div>
              <div style={{ color: '#a78bfa' }}>${eq.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>uPnL</div>
              <div style={{ color: upnl >= 0 ? '#34d399' : '#f87171' }}>${upnl.toFixed(2)}</div>
            </div>
          </div>

          <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Open</div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-[80px]">
            {!openPos.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Flat</p>}
            {openPos.map(p => {
              const mark = p.markPrice ?? p.avgPrice;
              const pnl = (mark - p.avgPrice) * p.qty;
              return (
                <div key={p.symbol} className="rounded-lg p-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div className="flex justify-between text-[11px]" style={{ color: '#F5F0E6' }}>
                    <span>{p.symbol}</span>
                    <span style={{ color: pnl >= 0 ? '#34d399' : '#f87171' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {p.qty} @ {p.avgPrice.toFixed(2)} → {mark.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Closed / fills</div>
          <div className="max-h-[160px] overflow-y-auto space-y-1">
            {!closed.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No fills yet</p>}
            {closed.map(t => (
              <div key={t.id} className="flex justify-between text-[10px] font-mono-data gap-1">
                <span style={{ color: t.side === 'buy' ? '#34d399' : '#f87171' }}>
                  {t.side.toUpperCase()} {t.qty} @ {t.price}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>{t.createdAt.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Execution</span>
        <label className="text-[11px] flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Qty
          <input
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-20 rounded px-2 py-1 text-[12px] font-mono-data"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void place('buy')}
          className="px-4 py-1.5 rounded-lg text-[12px] font-semibold"
          style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)' }}
        >
          BUY
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void place('sell')}
          className="px-4 py-1.5 rounded-lg text-[12px] font-semibold"
          style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }}
        >
          SELL
        </button>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
          Paper / MetaAPI demo · agent uses same indicator snapshot
        </span>
      </div>
    </div>
  );
}

export default CompanionStyleChart;
