/**
 * Companion desk — live volume: MetaAPI tick/real volume, public Binance volume, 5s poll merge.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { metaApiGetHistoricalCandles } from '@/infrastructure/gateways/metaApiMarketData';
import { getMetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { fetchMarketSnapshot, sma, rsi } from '@/infrastructure/gateways/marketDataService';
import { detectAllSmc, type Bar } from '@/presentation/components/trading/smcDetect';
import {
  getDemoAccount, executeDemoTrade, equity, unrealizedPnl, markPositions,
} from '@/infrastructure/persistence/demoTradingService';
import { brokerPlaceOrder } from '@/infrastructure/gateways/brokerConnector';
import type { DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { toast } from 'sonner';
import CompanionChartDesk, { barsToMetaApiCandles } from '@/presentation/components/trading/companion/CompanionChartDesk';
import type { ChartOverlayRow } from '@/presentation/components/trading/companion/types';

export type IndicatorSnapshot = {
  symbol: string; timeframe: string; last: number;
  sma20: number | null; sma50: number | null; rsi14: number | null;
  fvgCount: number; obCount: number; pdh: number | null; pdl: number | null;
  fib382: number | null; fib618: number | null; bars: number; lastVolume: number | null;
};

type Props = { symbol?: string; timeframe?: string; onIndicators?: (snap: IndicatorSnapshot) => void; className?: string };
const TFS = ['15m', '1h', '4h', '1d'] as const;
const LIVE_POLL_MS = 5000;

function candleVol(c: { tickVolume?: number; volume?: number }): number | undefined {
  const v = c.tickVolume ?? c.volume;
  return Number.isFinite(v as number) && (v as number) > 0 ? Number(v) : undefined;
}

function toBars(candles: { time: string; open: number; high: number; low: number; close: number; tickVolume?: number; volume?: number }[]): Bar[] {
  return candles.map(c => ({
    time: Math.floor(Date.parse(c.time) / 1000),
    open: c.open, high: c.high, low: c.low, close: c.close, volume: candleVol(c),
  })).filter(b => Number.isFinite(b.time) && b.time > 0).sort((a, b) => a.time - b.time);
}

function mergeBars(prev: Bar[], next: Bar[]): Bar[] {
  if (!next.length) return prev;
  const map = new Map<number, Bar>();
  for (const b of prev) map.set(b.time, b);
  for (const b of next) {
    const old = map.get(b.time);
    if (!old) { map.set(b.time, b); continue; }
    map.set(b.time, { ...old, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? old.volume });
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

function formatVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return `${Math.round(v)}`;
}

export function CompanionStyleChart({ symbol = 'XAUUSD', timeframe: tfProp = '1h', onIndicators, className }: Props) {
  const [tf, setTf] = useState(tfProp);
  const [status, setStatus] = useState('Loading…');
  const [bars, setBars] = useState<Bar[]>([]);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [qty, setQty] = useState('0.1');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<'metaapi' | 'public' | 'none'>('none');

  const smc = useMemo(() => detectAllSmc(bars), [bars]);
  const ohlc = useMemo(() => bars.map(b => ({ t: b.time * 1000, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })), [bars]);
  const closes = useMemo(() => bars.map(b => b.close), [bars]);
  const last = closes.length ? closes[closes.length - 1] : 0;
  const lastVolume = bars.length ? bars[bars.length - 1].volume ?? null : null;
  const sma20 = useMemo(() => sma(ohlc, 20), [ohlc]);
  const sma50 = useMemo(() => sma(ohlc, 50), [ohlc]);
  const rsi14 = useMemo(() => rsi(ohlc, 14), [ohlc]);
  const candles = useMemo(() => barsToMetaApiCandles(bars.map(b => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
  }))), [bars]);

  const overlays: ChartOverlayRow[] = useMemo(() => {
    if (!account?.positions) return [];
    return account.positions.filter(p => p.symbol.toUpperCase() === symbol.toUpperCase()).map(p => ({
      id: p.symbol, side: 'buy', volume: p.qty, entryPrice: p.avgPrice, stopLoss: null, takeProfit: null,
      profit: (p.markPrice ?? p.avgPrice) - p.avgPrice,
      openTime: null, currentPrice: p.markPrice ?? null,
    }));
  }, [account, symbol]);

  const snap: IndicatorSnapshot = useMemo(() => {
    const pdh = smc.zones.find(z => z.kind === 'pdh');
    const pdl = smc.zones.find(z => z.kind === 'pdl');
    const f382 = smc.fib.find(f => f.label.includes('38.2'));
    const f618 = smc.fib.find(f => f.label.includes('61.8'));
    return {
      symbol, timeframe: tf, last, sma20, sma50, rsi14,
      fvgCount: smc.zones.filter(z => z.kind === 'fvg').length,
      obCount: smc.zones.filter(z => z.kind === 'ob').length,
      pdh: pdh?.top ?? null, pdl: pdl?.top ?? null,
      fib382: f382?.price ?? null, fib618: f618?.price ?? null, bars: bars.length, lastVolume,
    };
  }, [symbol, tf, last, sma20, sma50, rsi14, smc, bars.length, lastVolume]);

  useEffect(() => { onIndicators?.(snap); }, [snap, onIndicators]);

  const reloadAccount = useCallback(async () => {
    const acc = await getDemoAccount();
    if (last > 0) setAccount(await markPositions({ [symbol.toUpperCase()]: last }));
    else setAccount(acc);
  }, [last, symbol]);
  useEffect(() => { void reloadAccount(); }, [reloadAccount]);

  const loadCandles = useCallback(async (mode: 'full' | 'live') => {
    const cfg = await getMetaApiConfig();
    if (cfg?.token && cfg.accountId) {
      const res = await metaApiGetHistoricalCandles({ symbol, timeframe: tf, limit: mode === 'live' ? 12 : 400 });
      if (res.ok && res.candles.length) {
        const mapped = toBars(res.candles);
        if (mode === 'live') setBars(prev => mergeBars(prev, mapped));
        else setBars(mapped);
        setSource('metaapi');
        const lv = mapped[mapped.length - 1]?.volume;
        setStatus(`${symbol} · ${tf} · MetaAPI · ${mode === 'live' ? 'live' : mapped.length + ' bars'}` + (lv != null ? ` · vol ${formatVolume(lv)}` : ''));
        return true;
      }
      if (mode === 'full' && !res.ok) setStatus(`MetaAPI: ${res.error} — trying public feed…`);
    }
    if (mode === 'live' && source === 'metaapi') return false;
    try {
      const snapM = await fetchMarketSnapshot(symbol);
      const mapped: Bar[] = snapM.bars.map(b => ({
        time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c,
        volume: b.v != null && Number.isFinite(b.v) ? Number(b.v) : undefined,
      }));
      if (mapped.length) {
        if (mode === 'live') setBars(prev => mergeBars(prev, mapped.slice(-12)));
        else setBars(mapped);
        setSource('public');
        const lv = mapped[mapped.length - 1]?.volume;
        setStatus(`${symbol} · ${tf} · public · ${mapped.length} bars` + (lv != null ? ` · vol ${formatVolume(lv)}` : ''));
        return true;
      }
      if (mode === 'full') setStatus('No candles — set MetaAPI token/account or use a public symbol');
    } catch (e) {
      if (mode === 'full') setStatus(e instanceof Error ? e.message : String(e));
    }
    return false;
  }, [symbol, tf, source]);

  useEffect(() => {
    let cancelled = false;
    void (async () => { setStatus('Loading candles…'); if (!cancelled) await loadCandles('full'); })();
    return () => { cancelled = true; };
  }, [symbol, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = window.setInterval(() => { void loadCandles('live'); }, LIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadCandles]);

  const place = async (side: 'buy' | 'sell') => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) { toast.error('Invalid quantity'); return; }
    setBusy(true);
    try {
      const res = await brokerPlaceOrder({ symbol, side, qty: q, reason: 'Manual desk execution', confidence: 1 });
      if (!res.ok) {
        const price = last || (await fetchMarketSnapshot(symbol)).last;
        const paper = await executeDemoTrade({ symbol, side, qty: q, price, reason: 'Manual desk (paper)', confidence: 1 });
        if ('error' in paper) toast.error(paper.error);
        else { toast.success(`${side.toUpperCase()} ${q} ${symbol} @ ${price}`); setAccount(paper.account); }
      } else {
        toast.success(`${side.toUpperCase()} via ${res.venue || 'broker'} @ ${res.price ?? 'mkt'}`);
        await reloadAccount();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
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
        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono-data" style={{ color: 'rgba(167,139,250,0.9)', background: 'rgba(167,139,250,0.1)' }} title="Last candle volume">
          Vol {formatVolume(lastVolume)}
        </span>
        {rsi14 != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
            color: rsi14 > 70 ? '#f87171' : rsi14 < 30 ? '#34d399' : 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.05)',
          }}>RSI {rsi14.toFixed(1)}</span>
        )}
        <div className="flex-1" />
        <div className="flex gap-1">
          {TFS.map(t => (
            <button key={t} type="button" onClick={() => setTf(t)} className="px-2 py-0.5 rounded text-[10px]" style={{
              color: tf === t ? '#F5F0E6' : 'rgba(255,255,255,0.35)',
              background: tf === t ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: `1px solid ${tf === t ? 'rgba(255,255,255,0.18)' : 'transparent'}`,
            }}>{t}</button>
          ))}
        </div>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{status}</span>
      </div>

      <div className="flex gap-2 flex-1" style={{ minHeight: 520 }}>
        <div className="flex-1 min-w-0" style={{ minHeight: 520 }}>
          {candles.length > 0 ? (
            <CompanionChartDesk symbol={symbol} candles={candles} height={560} overlays={overlays} />
          ) : (
            <div className="flex items-center justify-center rounded-xl h-full" style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.06)', minHeight: 520 }}>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{status}</span>
            </div>
          )}
        </div>
        <div className="w-[220px] shrink-0 flex flex-col gap-2 rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-2 gap-1 text-[11px] font-mono-data">
            <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div><div style={{ color: '#a78bfa' }}>${eq.toFixed(2)}</div></div>
            <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>uPnL</div><div style={{ color: upnl >= 0 ? '#34d399' : '#f87171' }}>${upnl.toFixed(2)}</div></div>
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
                  <div className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>{p.qty} @ {p.avgPrice.toFixed(2)}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Closed</div>
          <div className="max-h-[160px] overflow-y-auto space-y-1">
            {!closed.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No fills yet</p>}
            {closed.map(t => (
              <div key={t.id} className="flex justify-between text-[10px] font-mono-data gap-1">
                <span style={{ color: t.side === 'buy' ? '#34d399' : '#f87171' }}>{t.side.toUpperCase()} {t.qty}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>{t.createdAt.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Execution</span>
        <label className="text-[11px] flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Qty
          <input value={qty} onChange={e => setQty(e.target.value)} className="w-20 rounded px-2 py-1 text-[12px] font-mono-data" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
        </label>
        <button type="button" disabled={busy} onClick={() => void place('buy')} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.35)' }}>BUY</button>
        <button type="button" disabled={busy} onClick={() => void place('sell')} className="px-4 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }}>SELL</button>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
          Live vol · {source === 'metaapi' ? 'MetaAPI ticks' : source === 'public' ? 'public feed' : '—'} · poll {LIVE_POLL_MS / 1000}s
        </span>
      </div>
    </div>
  );
}

export default CompanionStyleChart;
