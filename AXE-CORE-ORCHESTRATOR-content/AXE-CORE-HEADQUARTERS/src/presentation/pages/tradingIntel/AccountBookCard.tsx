/**
 * One account's book: what it holds now, what it closed, and how it is doing.
 *
 * The rule the old single-account version established still holds and matters
 * more with three: if a number is on this card, a broker returned it for THIS
 * account. An unreadable history says so and names the account; it is never
 * filled in from somewhere else, and never from the simulated book that once
 * put $21,592,099 where a 48k EUR account belonged.
 */
import { useMemo, useState } from 'react';
import { TradeBadge } from '@/presentation/components/trading/TradeBadge';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  computeAccountStats, PERIOD_LABELS, type StatsPeriod,
} from '@/domain/tradingIntel/accountStats';
import type { AccountBook } from './useAccountBooks';
import { ScrollArea } from './AccountColumns';
import { tradesToCsv, exportFilename } from '@/domain/tradingIntel/tradeCsv';

function rawSide(type: unknown): string {
  const t = String(type ?? '').toUpperCase();
  return t.includes('SELL') ? 'sell' : 'buy';
}

const TF_RE = /^(.*?)\s+(m5|m15|m30|h1|h4|d1)$/i;

function tagOf(comment: unknown): string | null {
  const m = typeof comment === 'string' ? comment.trim().match(/^AXE\s+(.+)$/i) : null;
  const tag = m?.[1]?.trim();
  return tag && !/^[bs]\d+$/i.test(tag) ? tag : null;
}
function tfOf(comment: unknown): string | null {
  return tagOf(comment)?.match(TF_RE)?.[2]?.toLowerCase() ?? null;
}
function stratOf(comment: unknown): string | null {
  const t = tagOf(comment);
  if (!t) return null;
  return t.match(TF_RE)?.[1]?.trim() ?? t;
}

const PERIODS: StatsPeriod[] = ['day', 'week', 'month', 'year', 'all'];

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded p-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="text-[8px] uppercase tracking-wider truncate" style={{ color: 'rgba(255,255,255,0.32)' }}>{label}</div>
      <div className="text-[11px] font-mono-data mt-0.5" style={{ color: color ?? '#F5F0E6' }}>{value}</div>
    </div>
  );
}

/**
 * Hand the account's closed trades over as a CSV.
 *
 * The importer on the Scorecard tab exists for accounts we cannot reach; ours
 * we can, so the useful direction is outward. This turns "go and export it
 * from the terminal" into a button, which is the difference between a step
 * that can be automated and one that always needs a person.
 */
function exportBook(book: AccountBook): void {
  const csv = tradesToCsv(book.trades);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename(book.account.label);
  a.click();
  URL.revokeObjectURL(url);
}

/** The account's positions and closed trades. Row one of the grid. */
export function AccountBookMain({ book }: { book: AccountBook }) {
  const cur = book.currency;
  const money = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)} ${cur}`);
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

  return (
    <div className="h-full min-w-0">
      <WidgetCard
        title={book.account.label}
        headerAction={
          book.trades.length ? (
            <button
              type="button"
              onClick={() => exportBook(book)}
              className="text-[10px]"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              title={`Export ${book.trades.length} closed trades as CSV`}
            >
              Export CSV
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-3 gap-2 mb-3 text-sm font-mono-data">
          <div>
            <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Balance</div>
            <div style={{ color: '#F5F0E6' }}>{money(book.balance)}</div>
          </div>
          <div>
            <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Equity</div>
            <div style={{ color: '#a78bfa' }}>{money(book.equity)}</div>
          </div>
          <div>
            <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Free margin</div>
            <div style={{ color: '#F5F0E6' }}>{money(book.freeMargin)}</div>
          </div>
        </div>

        <div className="text-[10px] uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Open positions {book.positions.length > 0 && `(${book.positions.length})`}
        </div>
        {book.loading && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading…</p>}
        {!book.loading && !book.positions.length && (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Flat</p>
        )}
        {book.positions.map((p, i) => {
          const profit = Number(p.profit ?? 0);
          return (
            <div key={String(p.id ?? i)} className="flex justify-between text-[11px] font-mono-data mb-1 gap-2" style={{ color: '#F5F0E6' }}>
              <span className="flex items-center gap-1.5 min-w-0">
                <TradeBadge
                  strategies={[stratOf(p.comment)]}
                  timeframe={tfOf(p.comment)}
                  side={rawSide(p.type)}
                  pair={String(p.symbol ?? '')}
                  detail={`${Number(p.volume ?? 0)} @ ${Number(p.openPrice ?? 0).toFixed(2)}`}
                />
              </span>
              <span style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>{signed(profit)}</span>
            </div>
          );
        })}

        <div className="text-[10px] uppercase mt-3 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Closed trades</div>
        <ScrollArea max={260}><div className="space-y-1">
          {book.trades.slice(0, 60).map((t, i) => (
            <div key={i} className="text-[10px] flex justify-between gap-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span className="flex items-center gap-1.5 min-w-0">
                <TradeBadge
                  strategies={[stratOf(`AXE ${t.comment ?? ''}`)]}
                  timeframe={tfOf(`AXE ${t.comment ?? ''}`)}
                  side={t.side}
                  pair={String(t.symbol ?? '')}
                  detail={`${t.volume ?? '—'} @ ${t.closePrice?.toFixed(2) ?? '—'}`}
                />
              </span>
              <span style={{ color: t.profit >= 0 ? '#34d399' : '#f87171' }}>{signed(t.profit)}</span>
            </div>
          ))}
          {!book.trades.length && !book.loading && book.historyError && (
            <p className="text-[10px]" style={{ color: '#f87171' }}>
              History unavailable for this account — {book.historyError}. Balance and open positions above are live.
            </p>
          )}
          {!book.trades.length && !book.loading && !book.historyError && (
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No closed trades in this window.</p>
          )}
        </div></ScrollArea>
      </WidgetCard>
    </div>
  );
}

/** The account's statistics over a chosen window. Row two of the grid. */
export function AccountBookStats({ book }: { book: AccountBook }) {
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const stats = useMemo(() => computeAccountStats(book.trades, period), [book.trades, period]);
  const cur = book.currency;
  const money = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)} ${cur}`);
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

  return (
    <div className="h-full min-w-0">
      <WidgetCard
        title="Stats"
        headerAction={
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as StatsPeriod)}
            className="text-[10px] rounded px-1 py-0.5"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            {PERIODS.map(p => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
          </select>
        }
      >
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Balance" value={money(book.balance)} />
          <Stat label="P&L" value={signed(stats.netPnl)} color={stats.netPnl >= 0 ? '#34d399' : '#f87171'} />
          <Stat label="Trades" value={String(stats.trades)} />

          <Stat label="Avg win" value={stats.avgWin ? `+${stats.avgWin.toFixed(2)}` : '—'} color="#34d399" />
          <Stat label="Avg loss" value={stats.avgLoss ? `−${stats.avgLoss.toFixed(2)}` : '—'} color="#f87171" />
          {/* null, not ∞: a window with no losing trade has no ratio. */}
          <Stat label="Profit factor" value={stats.profitFactor != null ? stats.profitFactor.toFixed(2) : '—'} />

          <Stat label="Win %" value={`${stats.winRatePct.toFixed(0)}%`} color="#34d399" />
          <Stat label="Loss %" value={`${stats.lossRatePct.toFixed(0)}%`} color="#f87171" />
          <Stat
            label="Consistency"
            value={stats.consistencyPct != null ? `${stats.consistencyPct.toFixed(0)}%` : '—'}
            color={stats.consistencyPct != null && stats.consistencyPct > 50 ? '#fbbf24' : undefined}
          />

          <Stat label="Win streak" value={String(stats.streaks.currentWin)} color={stats.streaks.currentWin > 0 ? '#34d399' : undefined} />
          <Stat label="Loss streak" value={String(stats.streaks.currentLoss)} color={stats.streaks.currentLoss > 0 ? '#f87171' : undefined} />
          <Stat label="Trading days" value={String(stats.tradingDays)} />

          <Stat
            label="Highest day"
            value={stats.bestDay ? signed(stats.bestDay.net) : '—'}
            color="#34d399"
          />
          <Stat
            label="Lowest day"
            value={stats.worstDay ? signed(stats.worstDay.net) : '—'}
            color="#f87171"
          />
          <Stat label="Longest loss run" value={String(stats.streaks.longestLoss)} />
        </div>

        <p className="text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
          Consistency is the share of profit made on the single best day — lower is better, and above
          50% is the pattern that fails a prop challenge even when the total is green. It is blank on
          a losing window, where the ratio means nothing.
        </p>
      </WidgetCard>
    </div>
  );
}
