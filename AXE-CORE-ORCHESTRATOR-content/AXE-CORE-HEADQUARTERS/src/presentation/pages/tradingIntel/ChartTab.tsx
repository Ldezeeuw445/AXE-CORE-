/**
 * ChartTab — the trade desk. Strategy + watchlist rail on the left, chart
 * filling everything down to the bottom on the right. Research/backtest
 * detail live in their own tabs now, so this stays the "watch/trade it"
 * view instead of trying to be four screens at once.
 */
import { Loader2, Radar, Sparkles, Bot } from 'lucide-react';
import { CompanionChart } from '@/presentation/components/trading/companion/CompanionChart';
import { isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';
import { StrategyDot, FrameworkMark } from '@/presentation/components/trading/StrategyDot';
import { STRATEGIES, COMMON_PAIRS } from './useTradingDeskState';
import type { TradingDeskState } from './useTradingDeskState';

export function ChartTab({ desk }: { desk: TradingDeskState }) {
  const {
    watchlist, chartSymbol, setChartSymbol, activeStrategy, setActiveStrategy,
    symbol, setSymbol, running, deepRunning, agentRunning, lastTrace,
    runResearch, runDeepResearch, runAgent, setIndicatorSnap,
  } = desk;

  // Inside the Android shell the chart is the whole screen: the strategy rail
  // and the research row live behind the desk tabs instead of stealing height
  // from the candles on a 384px display.
  const inShell = isAndroidShellRuntime();

  return (
    <div className={`flex flex-col lg:flex-row gap-3 h-full min-h-0 lg:overflow-visible ${inShell ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      <div className={`w-full lg:w-[168px] shrink-0 lg:block gap-1.5 overflow-x-auto lg:overflow-visible lg:space-y-1.5 pb-1 lg:pb-0 ${inShell ? 'hidden' : 'flex'}`}>
        <p className="hidden lg:block text-[9px] uppercase tracking-wider px-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Strategies</p>
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStrategy(s.id)}
            className="w-40 lg:w-full shrink-0 text-left rounded-lg p-2"
            style={{
              background: activeStrategy === s.id ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${activeStrategy === s.id ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium" style={{ color: activeStrategy === s.id ? '#c4b5fd' : '#F5F0E6' }}>{s.label}</span>
              {/* One dot, in this strategy's colour, dimmed while the algo is
                  not running it. The card's border still shows what YOU picked
                  to backtest — two different questions, deliberately two
                  different signals. */}
              <span className="ml-auto flex items-center gap-1.5">
                <FrameworkMark strategy={s.id} size={7} />
                <StrategyDot strategy={s.id} size={8} />
              </span>
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.detail}</div>
          </button>
        ))}
        <div className="pt-2 mt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] uppercase tracking-wider px-1 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Watchlist</p>
          <div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
            {watchlist.map(w => (
              <button
                key={w.ticker}
                type="button"
                onClick={() => setChartSymbol(w.ticker.toUpperCase())}
                className="w-full flex items-center justify-between text-left rounded px-1.5 py-1"
                style={{ background: chartSymbol === w.ticker.toUpperCase() ? 'rgba(167,139,250,0.1)' : 'transparent' }}
              >
                <span className="text-[10px] font-mono-data" style={{ color: '#F5F0E6' }}>{w.ticker}</span>
                <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{w.assetClass}</span>
              </button>
            ))}
            {!watchlist.length && <p className="text-[9px] px-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Empty</p>}
          </div>
        </div>
        {lastTrace && (
          <div className="pt-2 mt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] uppercase tracking-wider px-1 mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Agent</p>
            <div className="px-1 flex items-center gap-1.5 text-[10px]" style={{ color: agentRunning ? '#6ee7b7' : 'rgba(255,255,255,0.45)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentRunning ? '#34d399' : 'rgba(255,255,255,0.25)' }} />
              {agentRunning ? 'Running…' : `${lastTrace.finalAction.toUpperCase()} · ${(lastTrace.confidence * 100).toFixed(0)}%`}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2">
        <div className={`items-center gap-2 flex-wrap shrink-0 ${inShell ? 'hidden' : 'flex'}`}>
          <input
            list="axe-pair-list"
            value={chartSymbol}
            onChange={e => setChartSymbol(e.target.value.toUpperCase())}
            className="w-28 rounded px-2 py-1 text-[12px] font-mono-data"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
            placeholder="Pair"
          />
          <datalist id="axe-pair-list">
            {COMMON_PAIRS.map(p => <option key={p} value={p} />)}
          </datalist>
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            className="w-28 rounded px-2 py-1 text-[12px] font-mono-data"
            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
            placeholder="Research symbol"
          />
          <button
            type="button"
            disabled={running}
            onClick={() => void runResearch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
            Run research
          </button>
          <button
            type="button"
            disabled={deepRunning}
            onClick={() => void runDeepResearch()}
            title="Full institutional research cycle — director planning, multi-source data, specialist debate, backtest validation. Slower, much deeper."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
            style={{ background: 'rgba(244,182,64,0.12)', color: '#f4c26e', border: '1px solid rgba(244,182,64,0.3)' }}
          >
            {deepRunning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Deep research
          </button>
          <button
            type="button"
            disabled={agentRunning}
            onClick={() => void runAgent()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
            style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.28)' }}
          >
            {agentRunning ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
            Run agent
          </button>
        </div>

        {/* Chart fills every remaining pixel down to the bottom of the desk. */}
        <div className="flex-1 min-h-0 flex justify-center pb-1">
          <div className="w-full h-full rounded-xl overflow-hidden">
            <CompanionChart symbol={chartSymbol} timeframe="h1" onIndicators={setIndicatorSnap} />
          </div>
        </div>
      </div>
    </div>
  );
}
