/**
 * SignalBacktestDetails — wat de signaaltest altijd al uitrekende en nooit
 * liet zien: elke trade en de equitycurve. Dit is de signaalkwaliteitstest
 * (instap op de slotkoers, geen stop, geen kosten); de Strategy Lab
 * hieronder rekent met een account.
 */
import { useState } from 'react';
import type { BacktestResult } from '@/application/tradingIntel/backtestEngine';

export function SignalBacktestDetails({ result }: { result: BacktestResult }) {
  const [showAll, setShowAll] = useState(false);
  const curve = result.equityCurve;
  const w = 720; const h = 110;
  const min = Math.min(1, ...curve); const max = Math.max(1, ...curve); const range = max - min || 1;
  const pts = curve.map((v, k) => `${((k / Math.max(1, curve.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * (h - 6) - 3).toFixed(1)}`).join(' ');
  const oneY = h - ((1 - min) / range) * (h - 6) - 3;
  const trades = showAll ? result.trades : result.trades.slice(-25);
  return (
    <div className="mt-3 space-y-2">
      {curve.length > 1 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none" role="img" aria-label="Signal backtest equity">
          <line x1={0} y1={oneY} x2={w} y2={oneY} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
          <polyline points={pts} fill="none" stroke={curve[curve.length - 1] >= 1 ? '#34d399' : '#f87171'} strokeWidth={1.5} />
        </svg>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] font-mono-data">
          <thead>
            <tr style={{ color: 'rgba(255,255,255,0.35)' }}>
              {['Side', 'Entry', 'Exit', 'Entry px', 'Exit px', 'Return', 'Reason'].map(hd => <th key={hd} className="text-left font-normal pb-1 pr-3">{hd}</th>)}
            </tr>
          </thead>
          <tbody>
            {trades.map(t => (
              <tr key={`${t.entryIndex}-${t.exitIndex}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td className="py-1 pr-3" style={{ color: t.side === 'buy' ? '#6ee7b7' : '#fca5a5' }}>{t.side.toUpperCase()}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.entryTime.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.exitTime.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{t.entryPrice}</td>
                <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{t.exitPrice}</td>
                <td className="py-1 pr-3" style={{ color: t.returnPct >= 0 ? '#6ee7b7' : '#fca5a5' }}>{(t.returnPct * 100).toFixed(2)}%</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.trades.length > 25 && (
        <button type="button" onClick={() => setShowAll(v => !v)} className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {showAll ? 'Show last 25' : `Show all ${result.trades.length} trades`}
        </button>
      )}
    </div>
  );
}
