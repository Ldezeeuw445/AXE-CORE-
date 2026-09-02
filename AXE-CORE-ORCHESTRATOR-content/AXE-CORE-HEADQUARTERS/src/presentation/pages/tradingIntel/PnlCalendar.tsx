/**
 * A month of days, coloured by what the desk made or lost on each.
 *
 * Green for a winning day, red for a losing one, at half opacity so the number
 * stays readable on top of it. A day with no trades is left alone entirely —
 * not painted a neutral colour, because "flat" and "did not trade" are
 * different facts and a calendar that blends them is a calendar that says the
 * desk worked every day.
 *
 * The default is all accounts added together, since that is the number that
 * decides whether the DESK had a good day. The filter narrows to one account
 * when the question is which of them carried it.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { dailyPnl, mergeDailyPnl, monthGrid } from '@/domain/tradingIntel/accountStats';
import type { AccountBook } from './useAccountBooks';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Half-opacity fills, exactly as asked: readable text, obvious colour. */
function cellStyle(net: number | null): React.CSSProperties {
  if (net == null) {
    return { background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-subtle)' };
  }
  if (net === 0) {
    return { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' };
  }
  return net > 0
    ? { background: 'rgba(52,211,153,0.5)', border: '1px solid rgba(52,211,153,0.6)' }
    : { background: 'rgba(248,113,113,0.5)', border: '1px solid rgba(248,113,113,0.6)' };
}

function short(net: number): string {
  const a = Math.abs(net);
  const s = a >= 1000 ? `${(a / 1000).toFixed(1)}k` : a.toFixed(0);
  return `${net < 0 ? '−' : '+'}${s}`;
}

export function PnlCalendar({ books }: { books: AccountBook[] }) {
  const [filter, setFilter] = useState<string>('all');
  const [offset, setOffset] = useState(0); // months back from today

  const view = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - offset);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [offset]);

  const daily = useMemo(() => {
    const chosen = filter === 'all' ? books : books.filter(b => b.account.id === filter);
    return mergeDailyPnl(chosen.map(b => dailyPnl(b.trades)));
  }, [books, filter]);

  const weeks = useMemo(() => monthGrid(view.year, view.month, daily), [view, daily]);

  const monthTotal = weeks.flat().reduce((sum, c) => sum + (c.inMonth && c.net != null ? c.net : 0), 0);
  const greenDays = weeks.flat().filter(c => c.inMonth && c.net != null && c.net > 0).length;
  const redDays = weeks.flat().filter(c => c.inMonth && c.net != null && c.net < 0).length;

  return (
    <WidgetCard
      title="P&L calendar"
      headerAction={
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOffset(o => o + 1)} style={{ color: 'rgba(255,255,255,0.4)' }}>
            <ChevronLeft size={12} />
          </button>
          <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {MONTHS[view.month]} {view.year}
          </span>
          <button
            type="button"
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={offset === 0}
            style={{ color: offset === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)' }}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      }
    >
      <div className="flex gap-1 mb-2 flex-wrap">
        {[{ id: 'all', label: 'All accounts' }, ...books.map(b => ({ id: b.account.id, label: b.account.label }))].map(o => {
          const on = filter === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setFilter(o.id)}
              className="px-2 py-0.5 rounded-full text-[9px]"
              style={{
                background: on ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${on ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: on ? '#22d3ee' : 'rgba(255,255,255,0.4)',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-[8px] text-center uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {d}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((cell, ci) => (
              <div
                key={ci}
                className="rounded aspect-square flex flex-col items-center justify-center"
                style={cell.inMonth ? cellStyle(cell.net) : { background: 'transparent' }}
                title={cell.inMonth && cell.net != null ? `${cell.day}: ${cell.net.toFixed(2)}` : cell.day}
              >
                {cell.inMonth && (
                  <>
                    <span className="text-[9px] leading-none" style={{ color: cell.net != null ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                      {cell.date}
                    </span>
                    {cell.net != null && cell.net !== 0 && (
                      <span className="text-[8px] font-mono-data leading-tight mt-0.5" style={{ color: '#fff' }}>
                        {short(cell.net)}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-baseline gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Month</span>
        <span className="text-[13px] font-mono-data" style={{ color: monthTotal >= 0 ? '#34d399' : '#f87171' }}>
          {monthTotal >= 0 ? '+' : ''}{monthTotal.toFixed(2)}
        </span>
        <span className="text-[9px] ml-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {greenDays} green · {redDays} red
        </span>
      </div>
    </WidgetCard>
  );
}
