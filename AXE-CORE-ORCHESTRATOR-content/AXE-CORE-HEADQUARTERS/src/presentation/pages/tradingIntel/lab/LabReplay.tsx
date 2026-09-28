/**
 * LabReplay — een lab-run bar voor bar terugkijken op de echte grafiek.
 *
 * De grafiek is CompanionChart zelf, in replay-modus: dezelfde candles-weergave,
 * indicatorlagen en panes als live. Alles wat hij tekent komt uit replayFrame,
 * en dat krijgt alleen bars 0..cursor — een indicator kan op bar N nooit iets
 * van N+1 weten (zie domain/tradingIntel/replay en zijn test).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CompanionChart } from '@/presentation/components/trading/companion/CompanionChart';
import type { ChartTradeMarker } from '@/presentation/components/trading/companion/ChartCanvas';
import type { ChartOverlayRow, MetaApiCandle } from '@/presentation/components/trading/companion/types';
import { replayFrame, type ReplayCandle } from '@/domain/tradingIntel/replay';
import { barMs } from '@/domain/tradingIntel/candleCache';
import type { LabEquityPoint, LabTrade } from '@/domain/tradingIntel/strategyLab/simulate';
import { getHistory } from '@/application/tradingIntel/historyService';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId } from '@/application/tradingIntel/strategySignals';
import { buildSeriesFromCandles } from '@/application/tradingIntel/backtestEngine';

const SPEEDS = [1, 2, 5, 10, 25];
const BTN = { border: '1px solid rgba(255,255,255,0.12)', color: '#F5F0E6' } as const;

export function LabReplay({ symbol, timeframe, from, to, strategy, trades, equity, onClose }: {
  symbol: string;
  timeframe: string;
  from: string | null;
  to: string | null;
  /** De strategie van de run, om zijn signaal op de cursor te tonen (alleen enkelvoudige strategieën). */
  strategy: string | null;
  trades: LabTrade[];
  equity: LabEquityPoint[];
  onClose: () => void;
}) {
  const [candles, setCandles] = useState<ReplayCandle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);

  useEffect(() => {
    let alive = true;
    const warmFrom = from ? new Date(Date.parse(from) - 60 * barMs(timeframe)).toISOString() : null;
    void getHistory({ symbol, timeframe, from: warmFrom, to }).then(res => {
      if (!alive) return;
      if (!res.ok) { setError(res.error); return; }
      setCandles(res.candles);
      // Begin waar de run begon, zodat de eerste stap iets laat zien.
      const start = from ? res.candles.findIndex(c => Date.parse(c.time) >= Date.parse(from)) : 60;
      setCursor(Math.max(0, start));
    });
    return () => { alive = false; };
  }, [symbol, timeframe, from, to]);

  const max = (candles?.length ?? 1) - 1;
  const cursorRef = useRef(cursor);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (cursorRef.current >= max) { setPlaying(false); return; }
      setCursor(c => Math.min(max, c + 1));
    }, Math.max(20, 1000 / speed));
    return () => window.clearInterval(id);
  }, [playing, speed, max]);

  const frame = useMemo(() => (candles ? replayFrame(candles, cursor, trades) : null), [candles, cursor, trades]);

  // Het signaal van de strategie op de cursor, berekend op 0..cursor.
  const signal = useMemo(() => {
    if (!frame || !strategy || !DISTINCT_STRATEGIES.has(strategy as StrategyId) || frame.candles.length < 60) return null;
    return computeStrategySignal(strategy as StrategyId, buildSeriesFromCandles(frame.candles), frame.candles.length - 1);
  }, [frame, strategy]);

  const replayProp = useMemo(() => {
    if (!frame) return null;
    const lastClose = frame.candles[frame.candles.length - 1]?.close ?? null;
    const overlays: ChartOverlayRow[] = frame.openTrades.map(t => ({
      id: `replay-${t.tradeId}`, side: t.side, volume: t.lots, entryPrice: t.entryPrice,
      stopLoss: t.stopLoss, takeProfit: t.takeProfit, profit: null, openTime: t.entryTime, currentPrice: lastClose,
    }));
    const markers: ChartTradeMarker[] = frame.markers.map(m => ({
      time: Math.floor(Date.parse(m.time) / 1000),
      position: m.kind === 'entry' ? (m.side === 'buy' ? 'belowBar' : 'aboveBar') : (m.side === 'buy' ? 'aboveBar' : 'belowBar'),
      shape: m.kind === 'entry' ? (m.side === 'buy' ? 'arrowUp' : 'arrowDown') : 'circle',
      color: m.kind === 'entry' ? (m.side === 'buy' ? '#34d399' : '#f87171') : '#c4b5fd',
      text: m.text,
    }));
    return { candles: frame.candles as MetaApiCandle[], overlays, markers };
  }, [frame]);

  const eqAtCursor = useMemo(() => {
    if (!frame?.time) return null;
    const t = Date.parse(frame.time);
    let best: LabEquityPoint | null = null;
    for (const p of equity) { if (Date.parse(p.time) <= t) best = p; else break; }
    return best;
  }, [frame, equity]);

  if (error) return <p className="text-[11px]" style={{ color: '#fca5a5' }}>Replay: {error}</p>;
  if (!candles || !frame || !replayProp) return <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading replay candles…</p>;

  const bar = frame.candles[frame.candles.length - 1];
  const ind = frame.indicators;
  const fmt = (v: number | null, d = 5) => (v == null ? '—' : v.toFixed(d).replace(/0+$/, '').replace(/\.$/, ''));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setCursor(0)} className="px-2 py-1 rounded text-[11px]" style={BTN} aria-label="Start">⏮</button>
        <button type="button" onClick={() => setCursor(c => Math.max(0, c - 1))} className="px-2 py-1 rounded text-[11px]" style={BTN} aria-label="Previous candle">◀</button>
        <button type="button" onClick={() => setPlaying(p => !p)} className="px-3 py-1 rounded text-[11px]" style={{ ...BTN, color: '#c4b5fd' }}>{playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={() => setCursor(c => Math.min(max, c + 1))} className="px-2 py-1 rounded text-[11px]" style={BTN} aria-label="Next candle">▶</button>
        <button type="button" onClick={() => setCursor(max)} className="px-2 py-1 rounded text-[11px]" style={BTN} aria-label="End">⏭</button>
        <select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="rounded px-1.5 py-1 text-[11px]"
          style={{ background: 'var(--bg-surface)', ...BTN }} aria-label="Replay speed">
          {SPEEDS.map(s => <option key={s} value={s}>{s} bar/s</option>)}
        </select>
        <select value="" onChange={e => { const t = trades.find(x => x.id === Number(e.target.value)); if (t) { const i = candles.findIndex(c => Date.parse(c.time) === Date.parse(t.entryTime)); if (i >= 0) setCursor(i); } }}
          className="rounded px-1.5 py-1 text-[11px]" style={{ background: 'var(--bg-surface)', ...BTN }} aria-label="Jump to trade">
          <option value="">Jump to trade…</option>
          {trades.map(t => <option key={t.id} value={t.id}>#{t.id} {t.side} {t.entryTime.slice(0, 16).replace('T', ' ')} {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(0)}</option>)}
        </select>
        <button type="button" onClick={onClose} className="ml-auto px-2 py-1 rounded text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Close replay</button>
      </div>
      <input type="range" min={0} max={max} value={cursor} onChange={e => setCursor(Number(e.target.value))} className="w-full" aria-label="Replay cursor" />
      <div className="text-[10.5px] font-mono-data flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
        <span style={{ color: '#F5F0E6' }}>{bar?.time.slice(0, 16).replace('T', ' ')}</span>
        <span>bar {cursor + 1}/{max + 1}</span>
        <span>O {fmt(bar?.open)} H {fmt(bar?.high)} L {fmt(bar?.low)} C {fmt(bar?.close)}</span>
        <span>SMA20 {fmt(ind.sma20)} · SMA50 {fmt(ind.sma50)} · RSI {fmt(ind.rsi14, 1)} · ATR {fmt(ind.atr14)}</span>
        {signal && <span>signal <span style={{ color: signal === 'buy' ? '#6ee7b7' : signal === 'sell' ? '#fca5a5' : 'rgba(255,255,255,0.5)' }}>{signal}</span></span>}
        <span>{frame.openTrades.length} open · {frame.closedTrades} closed · realized <span style={{ color: frame.realizedPnl >= 0 ? '#6ee7b7' : '#fca5a5' }}>{frame.realizedPnl.toFixed(2)}</span></span>
        {eqAtCursor && <span>equity {eqAtCursor.equity.toFixed(2)} · DD {(eqAtCursor.drawdownPct * 100).toFixed(2)}%</span>}
      </div>
      <div style={{ height: 460 }}>
        <CompanionChart symbol={symbol} timeframe={timeframe} replay={replayProp} className="h-full" />
      </div>
    </div>
  );
}
