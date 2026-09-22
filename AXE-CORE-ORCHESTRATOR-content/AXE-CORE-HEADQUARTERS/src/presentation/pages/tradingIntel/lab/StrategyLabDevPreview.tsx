/**
 * StrategyLabDevPreview — alleen in `npm run dev` (zie App.tsx): de echte
 * StrategyLabPanel en HistoryPanel buiten de login-muur, zodat de lab en de
 * replay in een browser te bekijken zijn. Geen nepdata: dezelfde candle-routes
 * als in de app (MetaAPI als die geconfigureerd is, anders TwelveData via de VPS).
 */
import { Suspense, useState } from 'react';
import { StrategyLabPanel } from './StrategyLabPanel';
import { HistoryPanel } from './HistoryPanel';
import type { StrategyId } from '@/application/tradingIntel/strategySignals';

const STRATS: StrategyId[] = ['volumetric-ob', 'ifvg', 'smc-structure', 'trend-follow', 'mean-reversion', 'pdh', 'golden-pocket', 'fib-retracement'];

export default function StrategyLabDevPreview() {
  const [symbol, setSymbol] = useState('XAUUSD');
  const [timeframe, setTimeframe] = useState('1h');
  const [strategy, setStrategy] = useState<StrategyId>('trend-follow');
  const [limit, setLimit] = useState(2000);
  const style = { background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' } as const;
  return (
    <div className="min-h-[100dvh] p-4 space-y-3" style={{ background: 'var(--bg-base, #0b0c0e)', color: '#F5F0E6' }}>
      <div className="flex flex-wrap gap-2 items-center text-[12px]">
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>DEV preview —</span>
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="rounded px-2 py-1 w-24" style={style} aria-label="Symbol" />
        <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="rounded px-2 py-1" style={style} aria-label="Timeframe">
          {['15m', '1h', '4h', '1d'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={strategy} onChange={e => setStrategy(e.target.value as StrategyId)} className="rounded px-2 py-1" style={style} aria-label="Strategy">
          {STRATS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="rounded px-2 py-1" style={style} aria-label="Bars">
          {[500, 1000, 2000, 5000].map(n => <option key={n} value={n}>{n} bars</option>)}
        </select>
      </div>
      <Suspense fallback={null}>
        <StrategyLabPanel symbol={symbol} timeframe={timeframe} limit={limit} strategy={{ kind: 'single', strategy }} />
        <HistoryPanel symbol={symbol} timeframe={timeframe} />
      </Suspense>
    </div>
  );
}
