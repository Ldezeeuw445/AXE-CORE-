/**
 * Funnel analytics — what worked, with what, and how much to believe it.
 *
 * Six columns: pair → framework → strategy → timeframe → direction → outcome.
 * Every one of them is COUNTED from closed trades, not inferred. The old funnel
 * drew five columns off the ledger, which has never stored a direction, so the
 * column that matters most could only ever say "unknown".
 *
 * The point of the shape is that a wide band running into "loss" is a strategy
 * costing money at a glance, and a narrow one is a sample too small to mean
 * anything yet. Which is why the learning signal is on the same screen and not
 * a footnote: a 100% win rate over four trades and a 55% over sixty look
 * equally green in a table, and only one of them is a reason to do anything.
 *
 * Arithmetic lives in domain/tradingIntel/funnelAnalytics.ts and is tested
 * there. This file only draws.
 */
import { useMemo, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { CycleJournalPanel } from './CycleJournalPanel';
import {
  toFunnelRows, totals, combinations, columnCounts,
  UNTAGGED, type FunnelRow, type Combination, type LearningSignal,
} from '@/domain/tradingIntel/funnelAnalytics';
import {
  strategyColor, frameworkColor, timeframeColor, FRAMEWORK_LABELS,
} from '@/domain/tradingIntel/strategyColors';
import type { TradingDeskState } from './useTradingDeskState';

const WIN = 'var(--success)';
const LOSS = 'var(--error)';
const MUTED = 'rgba(255,255,255,0.30)';
const TEXT = 'var(--text-primary)';

const SIGNAL_META: Record<LearningSignal, { label: string; detail: string; color: string }> = {
  validated: { label: 'VALIDATED', detail: '30+ trades — a record worth acting on', color: WIN },
  early: { label: 'EARLY SIGNAL', detail: '10–29 trades — promising, not proven', color: '#fbbf24' },
  insufficient: { label: 'TOO FEW', detail: 'under 10 trades — this is still a coin flip', color: LOSS },
};

function colourFor(column: string, value: string): string {
  if (value === UNTAGGED || value === 'unknown') return MUTED;
  switch (column) {
    case 'framework': return frameworkColor(value === 'axe' ? 'x' : `${value}:x`);
    case 'strategy': return strategyColor(value);
    case 'timeframe': return timeframeColor(value) ?? MUTED;
    case 'direction': return value === 'buy' ? WIN : value === 'sell' ? LOSS : MUTED;
    case 'outcome': return value === 'win' ? WIN : LOSS;
    default: return 'rgba(255,255,255,0.55)';
  }
}

function label(column: string, value: string): string {
  if (column === 'framework' && value !== UNTAGGED) {
    return FRAMEWORK_LABELS[value as keyof typeof FRAMEWORK_LABELS] ?? value;
  }
  return value;
}

interface ColumnProps {
  title: string;
  column: string;
  rows: FunnelRow[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}

function Column({ title, column, rows, selected, onSelect }: ColumnProps) {
  const counts = useMemo(() => {
    if (column === 'outcome') {
      const wins = rows.filter(r => r.won).length;
      return [
        { value: 'win', trades: wins, wins, net: 0 },
        { value: 'loss', trades: rows.length - wins, wins: 0, net: 0 },
      ].filter(c => c.trades > 0);
    }
    return columnCounts(rows, column as keyof FunnelRow);
  }, [rows, column]);

  const total = rows.length || 1;

  return (
    <div className="flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-[0.12em] mb-2" style={{ color: MUTED }}>{title}</div>
      <div className="space-y-1">
        {counts.map(c => {
          const share = c.trades / total;
          const isSel = selected === c.value;
          const dim = selected !== null && !isSel;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onSelect(isSel ? null : c.value)}
              className="w-full text-left rounded transition-opacity"
              style={{ opacity: dim ? 0.3 : 1 }}
              title={`${label(column, c.value)} — ${c.trades} trade(s)`}
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="rounded-sm shrink-0"
                  style={{
                    background: colourFor(column, c.value),
                    width: 4,
                    // Height IS the trade count. A band you can barely see is a
                    // sample you should barely trust, and that has to be
                    // visible without reading a number.
                    height: Math.max(6, Math.round(share * 150)),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] truncate" style={{ color: isSel ? TEXT : 'rgba(255,255,255,0.7)' }}>
                    {label(column, c.value)}
                  </div>
                  <div className="text-[9px]" style={{ color: MUTED }}>{c.trades}</div>
                </div>
              </div>
            </button>
          );
        })}
        {!counts.length && <p className="text-[10px]" style={{ color: MUTED }}>—</p>}
      </div>
    </div>
  );
}

function Stat({ label: l, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <WidgetCard title="">
      <div className="text-[9px] uppercase tracking-[0.12em]" style={{ color: MUTED }}>{l}</div>
      <div className="text-[20px] font-mono-data mt-1" style={{ color: tone ?? TEXT }}>{value}</div>
      {sub && <div className="text-[9px] mt-0.5" style={{ color: MUTED }}>{sub}</div>}
    </WidgetCard>
  );
}

export function FunnelTab({ desk }: { desk: TradingDeskState }) {
  const { ownBookTrades, ownBookLoading, ownBookHistoryError } = desk;

  const rows = useMemo(
    () => toFunnelRows((ownBookTrades ?? []).map(t => ({
      symbol: String(t.symbol ?? ''),
      side: t.side,
      profit: Number(t.profit ?? 0),
      comment: t.comment,
      closeTime: t.closeTime,
    }))),
    [ownBookTrades],
  );

  // One filter per column. Clicking a band narrows every other column to the
  // trades that went through it — which is the question this page exists to
  // answer: given THIS strategy, what did it do on which timeframe, which way.
  const [filters, setFilters] = useState<Record<string, string | null>>({});
  const filtered = useMemo(
    () => rows.filter(r =>
      Object.entries(filters).every(([col, val]) => {
        if (!val) return true;
        if (col === 'outcome') return val === 'win' ? r.won : !r.won;
        return String(r[col as keyof FunnelRow]) === val;
      }),
    ),
    [rows, filters],
  );

  const stats = useMemo(() => totals(filtered), [filtered]);
  const combos = useMemo(() => combinations(filtered).slice(0, 10), [filtered]);
  const active = Object.entries(filters).filter(([, v]) => v);

  const columns = [
    ['PAIR', 'pair'], ['FRAMEWORK', 'framework'], ['STRATEGY', 'strategy'],
    ['TIMEFRAME', 'timeframe'], ['DIRECTION', 'direction'], ['OUTCOME', 'outcome'],
  ] as const;

  if (!rows.length) {
    return (
      <WidgetCard title="Funnel analytics">
        {ownBookLoading && <p className="text-[11px]" style={{ color: MUTED }}>Reading closed trades…</p>}
        {!ownBookLoading && ownBookHistoryError && (
          <p className="text-[11px]" style={{ color: LOSS }}>
            Closed-trade history unavailable — {ownBookHistoryError}. The funnel is built from real fills,
            so it stays empty rather than showing a shape made of nothing.
          </p>
        )}
        {!ownBookLoading && !ownBookHistoryError && (
          <p className="text-[11px]" style={{ color: MUTED }}>
            No closed trades yet. Every band here is counted from real fills — nothing is simulated,
            so this fills in as AXE actually trades.
          </p>
        )}
      </WidgetCard>
    );
  }

  return (
    <div className="space-y-3">
      {/* The cycle journal first: it is the only view that joins the stages,
          and the analytics below only make sense once you can see which
          cycles actually completed and which died halfway. */}
      <CycleJournalPanel />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Total trades" value={String(stats.trades)}
              sub={active.length ? `${Math.round(stats.trades / rows.length * 100)}% of all` : '100% of all'} />
        <Stat label="Win rate" value={`${stats.winRatePct.toFixed(1)}%`}
              sub={`${stats.wins} / ${stats.trades}`}
              tone={stats.winRatePct >= 50 ? WIN : LOSS} />
        <Stat label="Profit factor"
              value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)}
              sub={stats.profitFactor === null ? 'no losing trade yet' : 'gross win / gross loss'}
              tone={stats.profitFactor !== null && stats.profitFactor >= 1 ? WIN : LOSS} />
        <Stat label="Net P/L" value={`${stats.netProfit >= 0 ? '+' : ''}${stats.netProfit.toFixed(2)}`}
              tone={stats.netProfit >= 0 ? WIN : LOSS} />
        <Stat label="Max drawdown" value={`-${stats.maxDrawdownPct.toFixed(1)}%`}
              sub="worst peak-to-trough" tone={LOSS} />
      </div>

      <WidgetCard
        title="Funnel"
        headerAction={active.length ? (
          <button type="button" className="text-[10px]" style={{ color: MUTED }}
                  onClick={() => setFilters({})}>
            clear {active.length} filter{active.length > 1 ? 's' : ''}
          </button>
        ) : undefined}
      >
        <div className="flex gap-3 overflow-x-auto pb-1">
          {columns.map(([title, col]) => (
            <Column
              key={col}
              title={title}
              column={col}
              rows={filtered}
              selected={filters[col] ?? null}
              onSelect={v => setFilters(f => ({ ...f, [col]: v }))}
            />
          ))}
        </div>
        <p className="text-[9px] mt-2" style={{ color: MUTED }}>
          Bar height is trade count. Colours are the one registry that also paints the dots and
          triangles on every trade — a second palette here would drift within a week.
          Untagged trades are kept in the totals: dropping them would inflate the win rate of
          everything that did carry a tag.
        </p>
      </WidgetCard>

      <WidgetCard title="Top combinations">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: MUTED }}>
                {['#', 'Pair', 'Framework', 'Strategy', 'TF', 'Dir', 'Trades', 'Win rate', 'Net', 'Per trade', 'Confidence']
                  .map(h => <th key={h} className="text-left font-normal pb-1 pr-3 text-[9px] uppercase tracking-wide">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {combos.map((c: Combination, i) => (
                <tr key={`${c.pair}${c.strategy}${c.timeframe}${c.direction}`} style={{ color: 'rgba(255,255,255,0.75)' }}>
                  <td className="pr-3 py-0.5" style={{ color: MUTED }}>{i + 1}</td>
                  <td className="pr-3" style={{ color: TEXT }}>{c.pair}</td>
                  <td className="pr-3">
                    <span style={{ color: colourFor('framework', c.framework) }}>
                      ▲ {label('framework', c.framework)}
                    </span>
                  </td>
                  <td className="pr-3">
                    <span style={{ color: colourFor('strategy', c.strategy) }}>● </span>
                    {c.strategy}
                  </td>
                  <td className="pr-3">{c.timeframe}</td>
                  <td className="pr-3" style={{ color: colourFor('direction', c.direction) }}>
                    {c.direction.toUpperCase()}
                  </td>
                  <td className="pr-3 font-mono-data">{c.trades}</td>
                  <td className="pr-3 font-mono-data">{c.winRatePct.toFixed(0)}%</td>
                  <td className="pr-3 font-mono-data" style={{ color: c.netProfit >= 0 ? WIN : LOSS }}>
                    {c.netProfit >= 0 ? '+' : ''}{c.netProfit.toFixed(2)}
                  </td>
                  <td className="pr-3 font-mono-data" style={{ color: c.expectancy >= 0 ? WIN : LOSS }}>
                    {c.expectancy >= 0 ? '+' : ''}{c.expectancy.toFixed(2)}
                  </td>
                  <td>
                    <span className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ color: SIGNAL_META[c.confidence].color,
                                   background: `${SIGNAL_META[c.confidence].color}1a` }}>
                      {SIGNAL_META[c.confidence].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetCard>

      <WidgetCard title="Learning signal">
        <p className="text-[10px] mb-2" style={{ color: MUTED }}>
          How much of this record is worth acting on. A 100% win rate over four trades and a 55%
          over sixty look equally green in a table, and only one of them is a reason to change
          anything.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(['validated', 'early', 'insufficient'] as LearningSignal[]).map(sig => {
            const n = combinations(filtered).filter(c => c.confidence === sig).length;
            const m = SIGNAL_META[sig];
            return (
              <div key={sig} className="rounded-lg px-3 py-2"
                   style={{ background: `${m.color}0f`, border: `1px solid ${m.color}33` }}>
                <div className="text-[10px]" style={{ color: m.color }}>{m.label}</div>
                <div className="text-[18px] font-mono-data" style={{ color: TEXT }}>{n}</div>
                <div className="text-[9px]" style={{ color: MUTED }}>{m.detail}</div>
              </div>
            );
          })}
        </div>
      </WidgetCard>
    </div>
  );
}
