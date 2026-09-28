/** LabTradeTable — elke trade van een lab-run: instap, uitstap, reden, P&L, R. */
import { useState } from 'react';
import type { LabTrade } from '@/domain/tradingIntel/strategyLab/simulate';

const PAGE = 50;

export function LabTradeTable({ trades, currency }: { trades: LabTrade[]; currency: string }) {
  const [page, setPage] = useState(0);
  if (!trades.length) return <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No trades.</p>;
  const pages = Math.ceil(trades.length / PAGE);
  const rows = trades.slice(page * PAGE, page * PAGE + PAGE);
  const num = (v: number, d = 2) => v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] font-mono-data">
          <thead>
            <tr style={{ color: 'rgba(255,255,255,0.35)' }}>
              {['#', 'Side', 'Entry', 'Exit', 'Entry px', 'Exit px', 'SL', 'TP', 'Lots', 'Reason', `P&L ${currency}`, 'R', 'Balance'].map(hd => (
                <th key={hd} className="text-left font-normal pb-1.5 pr-3 whitespace-nowrap">{hd}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.4)' }}>{t.id}</td>
                <td className="py-1 pr-3" style={{ color: t.side === 'buy' ? '#6ee7b7' : '#fca5a5' }}>{t.side.toUpperCase()}</td>
                <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.entryTime.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.exitTime.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{t.entryPrice.toFixed(5).replace(/0+$/, '')}</td>
                <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{t.exitPrice.toFixed(5).replace(/0+$/, '')}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.45)' }}>{t.stopLoss.toFixed(5).replace(/0+$/, '')}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.45)' }}>{t.takeProfit == null ? '—' : t.takeProfit.toFixed(5).replace(/0+$/, '')}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{t.lots}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.5)' }}>{t.exitReason}</td>
                <td className="py-1 pr-3" style={{ color: t.pnl >= 0 ? '#6ee7b7' : '#fca5a5' }}>{t.pnl >= 0 ? '+' : ''}{num(t.pnl)}</td>
                <td className="py-1 pr-3" style={{ color: t.rMultiple >= 0 ? '#6ee7b7' : '#fca5a5' }}>{t.rMultiple.toFixed(2)}</td>
                <td className="py-1 pr-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{num(t.balanceAfter, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="disabled:opacity-30">‹ prev</button>
          <span>{page + 1} / {pages} · {trades.length} trades</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} className="disabled:opacity-30">next ›</button>
        </div>
      )}
    </div>
  );
}
