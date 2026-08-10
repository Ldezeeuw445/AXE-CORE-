/**
 * DemoBookTab — the internal paper account: cash, equity, positions, fills.
 * Unchanged behavior from the old single-file page, just its own room now.
 */
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import type { TradingDeskState } from './useTradingDeskState';

export function DemoBookTab({ desk }: { desk: TradingDeskState }) {
  const { account, eq, upnl, resetDemoAccount } = desk;
  if (!account) return null;

  return (
    <div className="max-w-[900px]">
      <WidgetCard title="Demo book (local mirror)" headerAction={
        <button type="button" className="text-[10px]" style={{ color: '#f87171' }} onClick={() => void resetDemoAccount()}>Reset $100k</button>
      }>
        <div className="grid grid-cols-3 gap-2 mb-3 text-sm font-mono-data">
          <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Cash</div><div style={{ color: '#F5F0E6' }}>${account.cash.toFixed(2)}</div></div>
          <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div><div style={{ color: '#a78bfa' }}>${eq.toFixed(2)}</div></div>
          <div><div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>uPnL</div><div style={{ color: upnl >= 0 ? '#34d399' : '#f87171' }}>${upnl.toFixed(2)}</div></div>
        </div>
        <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Open positions</div>
        {!account.positions.length && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>}
        {account.positions.map(p => {
          const mark = p.markPrice ?? p.avgPrice;
          const pnl = (mark - p.avgPrice) * p.qty;
          return (
            <div key={p.symbol} className="flex justify-between text-[12px] font-mono-data mb-1" style={{ color: '#F5F0E6' }}>
              <span>{p.symbol} · {p.qty} @ {p.avgPrice.toFixed(2)}</span>
              <span style={{ color: pnl >= 0 ? '#34d399' : '#f87171' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</span>
            </div>
          );
        })}
        <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Fills / closed</div>
        <div className="max-h-[400px] overflow-y-auto space-y-1">
          {account.trades.slice(0, 60).map(t => (
            <div key={t.id} className="text-[11px] flex justify-between" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span style={{ color: t.side === 'buy' ? '#34d399' : '#f87171' }}>{t.side.toUpperCase()} {t.qty} {t.symbol} @ {t.price}</span>
              <span>{t.createdAt.slice(11, 19)}</span>
            </div>
          ))}
        </div>
      </WidgetCard>
    </div>
  );
}
