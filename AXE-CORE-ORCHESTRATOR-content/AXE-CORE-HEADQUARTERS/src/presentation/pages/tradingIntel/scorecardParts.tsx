/**
 * Shared scorecard building blocks.
 *
 * Pulled out of ScorecardTab when that tab went from one account to three:
 * the tiles, the equity curve and the analytics panel are now rendered once
 * per account as well as desk-wide, and duplicating them would have let the
 * two drift into showing the same numbers differently.
 */
import type { JournalAnalytics } from '@/application/tradingIntel/csvJournalAnalytics';

export function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div>
      <div className="text-[15px] font-mono-data mt-0.5" style={{ color: color || '#F5F0E6' }}>{value}</div>
    </div>
  );
}

export function EquityCurveSvg({ curve }: { curve: JournalAnalytics['equityCurve'] }) {
  if (curve.length < 2) return null;
  const w = 640;
  const h = 120;
  const values = curve.map(p => p.equity);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const points = curve.map((p, i) => {
    const x = (i / (curve.length - 1)) * w;
    const y = h - ((p.equity - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const zeroY = h - ((0 - min) / range) * h;
  const positive = values[values.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[120px]" preserveAspectRatio="none">
      <line x1={0} y1={zeroY} x2={w} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
      <polyline points={points} fill="none" stroke={positive ? '#34d399' : '#f87171'} strokeWidth={1.5} />
    </svg>
  );
}

export function Breakdown({ title, rows }: { title: string; rows: { label: string; trades: number; netProfit: number; winRate: number }[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{title}</p>
      <div className="space-y-1">
        {rows.slice(0, 12).map(r => (
          <div key={r.label} className="flex items-center justify-between text-[11px] font-mono-data">
            <span style={{ color: '#F5F0E6' }}>{r.label}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>{r.trades} trades · {(r.winRate * 100).toFixed(0)}% win</span>
            <span style={{ color: r.netProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>{r.netProfit >= 0 ? '+' : ''}{r.netProfit.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The scoreboard — every (strategy, symbol) combination actually traded,
 *  ranked by net profit. Answers "is Golden Pocket working on XAUUSD
 *  specifically" without cross-referencing two separate breakdowns. */
export function Scoreboard({ rows }: { rows: JournalAnalytics['byStrategyAndSymbol'] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.netProfit - a.netProfit);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Scoreboard — strategy × pair</p>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid grid-cols-5 gap-2 px-2 py-1.5 text-[9px] uppercase tracking-wide" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.35)' }}>
          <span className="col-span-2">Strategy</span>
          <span>Pair</span>
          <span className="text-right">Win rate</span>
          <span className="text-right">Net</span>
        </div>
        {sorted.slice(0, 20).map((r, i) => (
          <div
            key={`${r.strategy}-${r.symbol}`}
            className="grid grid-cols-5 gap-2 px-2 py-1.5 text-[11px] font-mono-data"
            style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
          >
            <span className="col-span-2 truncate" style={{ color: '#F5F0E6' }}>{r.strategy}</span>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>{r.symbol}</span>
            <span className="text-right" style={{ color: r.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5' }}>{(r.winRate * 100).toFixed(0)}% ({r.trades})</span>
            <span className="text-right" style={{ color: r.netProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>{r.netProfit >= 0 ? '+' : ''}{r.netProfit.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared render for any computed JournalAnalytics, whether it came from the
 *  agent's own book or an uploaded CSV. */
export function AnalyticsPanel({ analytics, byStrategyHint }: { analytics: JournalAnalytics; byStrategyHint?: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatTile label="Net profit" value={`${analytics.netProfit >= 0 ? '+' : ''}${analytics.netProfit.toFixed(2)}`} color={analytics.netProfit >= 0 ? '#6ee7b7' : '#fca5a5'} />
        <StatTile label="Win rate" value={`${(analytics.winRate * 100).toFixed(0)}% (${analytics.wins}/${analytics.totalTrades})`} color={analytics.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5'} />
        <StatTile label="Profit factor" value={Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : '∞'} />
        <StatTile label="Max drawdown" value={`-${analytics.maxDrawdown.toFixed(2)} (${(analytics.maxDrawdownPct * 100).toFixed(1)}%)`} color="#fca5a5" />
        <StatTile label="Avg win" value={`+${analytics.avgWin.toFixed(2)}`} color="#6ee7b7" />
        <StatTile label="Avg loss" value={analytics.avgLoss.toFixed(2)} color="#fca5a5" />
        <StatTile label="Expectancy / trade" value={`${analytics.expectancy >= 0 ? '+' : ''}${analytics.expectancy.toFixed(2)}`} />
        <StatTile label="Largest win / loss" value={`+${analytics.largestWin.toFixed(2)} / ${analytics.largestLoss.toFixed(2)}`} />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Equity curve {analytics.dateRange.from ? `· ${analytics.dateRange.from} → ${analytics.dateRange.to}` : ''}
        </p>
        <EquityCurveSvg curve={analytics.equityCurve} />
      </div>

      <Scoreboard rows={analytics.byStrategyAndSymbol} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Breakdown title="By symbol" rows={analytics.bySymbol.map(r => ({ label: r.symbol, trades: r.trades, netProfit: r.netProfit, winRate: r.winRate }))} />
        <Breakdown title="By side" rows={analytics.bySide.map(r => ({ label: r.side, trades: r.trades, netProfit: r.netProfit, winRate: r.winRate }))} />
      </div>
      <Breakdown title="By strategy" rows={analytics.byStrategy.map(r => ({ label: r.label, trades: r.trades, netProfit: r.netProfit, winRate: r.winRate }))} />
      {!analytics.byStrategy.length && byStrategyHint && (
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{byStrategyHint}</p>
      )}
    </div>
  );
}
