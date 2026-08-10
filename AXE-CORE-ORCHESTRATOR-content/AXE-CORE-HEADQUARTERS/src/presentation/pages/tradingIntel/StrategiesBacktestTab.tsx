/**
 * StrategiesBacktestTab — the strategy shelf gets its own room instead of a
 * 168px sidebar. Pick a strategy, replay it, see what actually works before
 * the agent leans on it live.
 */
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { STRATEGIES } from './useTradingDeskState';
import type { TradingDeskState } from './useTradingDeskState';

export function StrategiesBacktestTab({ desk }: { desk: TradingDeskState }) {
  const { activeStrategy, setActiveStrategy, chartSymbol, backtestRunning, backtestResult, runBacktestNow } = desk;

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="w-[260px] shrink-0 space-y-1.5 overflow-y-auto">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStrategy(s.id)}
            className="w-full text-left rounded-lg p-3"
            style={{
              background: activeStrategy === s.id ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${activeStrategy === s.id ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="text-[12px] font-medium" style={{ color: activeStrategy === s.id ? '#c4b5fd' : '#F5F0E6' }}>{s.label}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.detail}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <WidgetCard title={`Backtest — ${STRATEGIES.find(s => s.id === activeStrategy)?.label ?? activeStrategy} on ${chartSymbol}`}>
          <button
            type="button"
            disabled={backtestRunning || activeStrategy === 'crew-hybrid'}
            onClick={() => void runBacktestNow()}
            title={activeStrategy === 'crew-hybrid' ? 'Crew Hybrid needs live intel — not backtestable yet' : 'Replay this strategy over the last 500 H1 candles'}
            className="px-4 py-2 rounded-lg text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}
          >
            {backtestRunning ? 'Running…' : `Run backtest on ${chartSymbol}`}
          </button>

          {backtestResult && (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: 'Net return', value: `${(backtestResult.netReturnPct * 100).toFixed(1)}%`, color: backtestResult.netReturnPct >= 0 ? '#6ee7b7' : '#fca5a5' },
                { label: 'Trades', value: String(backtestResult.totalTrades) },
                { label: 'Win rate', value: `${(backtestResult.winRate * 100).toFixed(0)}%`, color: backtestResult.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5' },
                { label: 'Profit factor', value: Number.isFinite(backtestResult.profitFactor) ? backtestResult.profitFactor.toFixed(2) : '∞' },
                { label: 'Max drawdown', value: `${(backtestResult.maxDrawdownPct * 100).toFixed(1)}%`, color: '#fca5a5' },
              ].map(t => (
                <div key={t.label} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.label}</div>
                  <div className="text-[15px] font-mono-data mt-0.5" style={{ color: t.color || '#F5F0E6' }}>{t.value}</div>
                </div>
              ))}
              {backtestResult.note && (
                <p className="col-span-4 text-[10px] leading-snug mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{backtestResult.note}</p>
              )}
            </div>
          )}
          {!backtestResult && (
            <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>No backtest run yet for this strategy/symbol.</p>
          )}
        </WidgetCard>
      </div>
    </div>
  );
}
