/**
 * ResearchTab — the CrewAI intel desk. Every report the research crew (or
 * the deep 18-agent flow) has produced, newest first, with the confidence
 * trend per symbol so you can see whether conviction is building or fading.
 */
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { DataPlanePanel } from '@/presentation/components/trading/DataPlanePanel';
import { signalMeta } from './useTradingDeskState';
import type { TradingDeskState } from './useTradingDeskState';
import type { TradingIntelReport, TradingSignal } from '@/domain/tradingIntel/types';

function Badge({ signal }: { signal: TradingSignal }) {
  const m = signalMeta(signal);
  return <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

export function ResearchTab({ desk }: { desk: TradingDeskState }) {
  const { reports, summary, isAxeApiConfigured, deleteIntelReport, chartSymbol } = desk;

  const bySymbol = new Map<string, TradingIntelReport[]>();
  for (const r of reports) {
    const arr = bySymbol.get(r.ticker) ?? [];
    arr.push(r);
    bySymbol.set(r.ticker, arr);
  }

  return (
    <div className="flex gap-4 max-w-[1500px]">
      <div className="space-y-3 flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {summary.total} reports · bullish {summary.bySignal.BUY} · bearish {summary.bySignal.SELL}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
            {isAxeApiConfigured ? 'CrewAI research crew connected' : 'Local desk — CrewAI not configured'}
          </span>
        </div>

        {Array.from(bySymbol.entries()).map(([ticker, group]) => (
        <div key={ticker}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {ticker} · confidence trend {group.slice(0, 6).reverse().map(r => `${(r.confidence * 100).toFixed(0)}%`).join(' → ')}
          </p>
          <div className="space-y-2">
            {group.map(r => (
              <WidgetCard
                key={r.id}
                title={`${r.ticker} · ${r.horizon || '—'}`}
                headerAction={
                  <button type="button" className="text-[10px]" style={{ color: 'var(--error)' }} onClick={() => void deleteIntelReport(r.id)}>
                    Delete
                  </button>
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge signal={r.signal} />
                  <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.45)' }}>{(r.confidence * 100).toFixed(0)}% confidence</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.createdAt?.slice(0, 19)}</span>
                  {r.tags?.length ? (
                    <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{r.tags.join(', ')}</span>
                  ) : null}
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{r.thesis}</p>
              </WidgetCard>
            ))}
          </div>
        </div>
      ))}
        {!reports.length && <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No intel yet — run research from the Chart tab.</p>}
      </div>

      <div className="w-[280px] shrink-0">
        <DataPlanePanel symbol={chartSymbol} />
      </div>
    </div>
  );
}
