/**
 * StrategiesBacktestTab — the strategy shelf gets its own room instead of a
 * 168px sidebar. Pick a strategy, replay it, see what actually works before
 * the agent leans on it live.
 */
import { useState } from 'react';
import { StrategyDot, FrameworkDot } from '@/presentation/components/trading/StrategyDot';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { COMMON_PAIRS, STRATEGIES } from './useTradingDeskState';
import type { TradingDeskState } from './useTradingDeskState';

export function StrategiesBacktestTab({ desk }: { desk: TradingDeskState }) {
  const {
    activeStrategy, setActiveStrategy, chartSymbol, backtestRunning, backtestResult, runBacktestNow,
    backtestTimeframe, setBacktestTimeframe, backtestLimit, setBacktestLimit,
    allPairsRunning, allPairsResults, runBacktestAllPairsNow,
    savedStrategies, saveCurrentBacktest, deleteSavedStrategy,
    comboStrategies, toggleComboStrategy, comboMinAgree, setComboMinAgree, comboRunning, comboResult, runComboBacktestNow,
    setups, saveSetup, loadSetup, deleteSetup,
  } = desk;
  const [saveNote, setSaveNote] = useState('');
  const [comboSaveNote, setComboSaveNote] = useState('');
  const [setupName, setSetupName] = useState('');
  const busy = backtestRunning || allPairsRunning || comboRunning;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">
      <div className="w-full lg:w-[260px] shrink-0 space-y-1.5 overflow-y-auto">
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
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium" style={{ color: activeStrategy === s.id ? '#c4b5fd' : '#F5F0E6' }}>{s.label}</span>
              {/* Top-right: this strategy's own colour, ringed when the algo is
                  running it right now. Selection (the card's border) and use
                  (this dot) are deliberately different signals — clicking a
                  card no longer decides anything the algo does. */}
              <span className="ml-auto flex items-center gap-1">
                <FrameworkDot strategy={s.id} size={7} />
                <StrategyDot strategy={s.id} size={8} />
              </span>
              {!s.backtestable && (
                <span
                  className="text-[8px] px-1 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ background: 'rgba(244,182,64,0.12)', color: '#f4c26e' }}
                  title="No dedicated backtest logic yet — shares a generic proxy with every other unbacktested strategy"
                >
                  proxy
                </span>
              )}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.detail}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto space-y-3">
        <WidgetCard title="Timeframe & period">
          <div className="flex flex-wrap items-end gap-4">
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Timeframe</span>
              <select
                value={backtestTimeframe}
                onChange={e => setBacktestTimeframe(e.target.value)}
                disabled={busy}
                className="rounded px-2 py-1.5 text-[12px]"
                style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
              >
                {['5m', '15m', '30m', '1h', '4h', '1d'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)' }}>Period (candles)</span>
              <select
                value={backtestLimit}
                onChange={e => setBacktestLimit(parseInt(e.target.value, 10))}
                disabled={busy}
                className="rounded px-2 py-1.5 text-[12px]"
                style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
              >
                {[500, 1000, 2000, 5000, 10000, 20000].map(n => (
                  <option key={n} value={n}>{n.toLocaleString()} bars{n > 1000 ? ' (paged)' : ''}</option>
                ))}
              </select>
            </label>
            <span className="text-[10px] pb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Applies to every backtest below. Longer periods page MetaAPI history in batches — slower, but a real edge should survive a longer window.
            </span>
          </div>
        </WidgetCard>

        <WidgetCard title={`Backtest — ${STRATEGIES.find(s => s.id === activeStrategy)?.label ?? activeStrategy} on ${chartSymbol}`}>
          <div className="flex items-center gap-2">
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
            <button
              type="button"
              disabled={allPairsRunning || activeStrategy === 'crew-hybrid'}
              onClick={() => void runBacktestAllPairsNow()}
              title={activeStrategy === 'crew-hybrid' ? 'Crew Hybrid needs live intel — not backtestable yet' : `Replay this strategy across all ${COMMON_PAIRS.length} pairs`}
              className="px-4 py-2 rounded-lg text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: '#F5F0E6' }}
            >
              {allPairsRunning ? 'Running all pairs…' : `Run across all ${COMMON_PAIRS.length} pairs`}
            </button>
          </div>

          {backtestResult && (
            <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
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
              <div className="col-span-4 flex items-center gap-2 mt-1">
                <input
                  value={saveNote}
                  onChange={e => setSaveNote(e.target.value)}
                  placeholder="Optional note (e.g. 'H1, trending pairs only')"
                  className="flex-1 rounded px-2 py-1.5 text-[11px]"
                  style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                />
                <button
                  type="button"
                  onClick={() => { void saveCurrentBacktest(saveNote || undefined); setSaveNote(''); }}
                  className="px-3 py-1.5 rounded text-[11px] shrink-0"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}
                >
                  Save this run
                </button>
              </div>
            </div>
          )}
          {!backtestResult && (
            <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.35)' }}>No backtest run yet for this strategy/symbol.</p>
          )}
        </WidgetCard>

        {allPairsResults && (
          <WidgetCard title={`All pairs — ${STRATEGIES.find(s => s.id === activeStrategy)?.label ?? activeStrategy}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <th className="text-left font-normal pb-1.5">Symbol</th>
                    <th className="text-right font-normal pb-1.5">Net return</th>
                    <th className="text-right font-normal pb-1.5">Win rate</th>
                    <th className="text-right font-normal pb-1.5">Trades</th>
                    <th className="text-right font-normal pb-1.5">Profit factor</th>
                    <th className="text-right font-normal pb-1.5">Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allPairsResults]
                    .sort((a, b) => (b.result?.netReturnPct ?? -Infinity) - (a.result?.netReturnPct ?? -Infinity))
                    .map(row => (
                      <tr key={row.symbol} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <td className="py-1.5 font-mono-data" style={{ color: '#F5F0E6' }}>{row.symbol}</td>
                        {row.result ? (
                          <>
                            <td className="py-1.5 text-right font-mono-data" style={{ color: row.result.netReturnPct >= 0 ? '#6ee7b7' : '#fca5a5' }}>{(row.result.netReturnPct * 100).toFixed(1)}%</td>
                            <td className="py-1.5 text-right font-mono-data" style={{ color: 'rgba(255,255,255,0.7)' }}>{(row.result.winRate * 100).toFixed(0)}%</td>
                            <td className="py-1.5 text-right font-mono-data" style={{ color: 'rgba(255,255,255,0.7)' }}>{row.result.totalTrades}</td>
                            <td className="py-1.5 text-right font-mono-data" style={{ color: 'rgba(255,255,255,0.7)' }}>{Number.isFinite(row.result.profitFactor) ? row.result.profitFactor.toFixed(2) : '∞'}</td>
                            <td className="py-1.5 text-right font-mono-data" style={{ color: '#fca5a5' }}>{(row.result.maxDrawdownPct * 100).toFixed(1)}%</td>
                          </>
                        ) : (
                          <td colSpan={5} className="py-1.5 text-right text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{row.error}</td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </WidgetCard>
        )}

        <WidgetCard title={`Combo backtest — confluence on ${chartSymbol}`}>
          <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Only trades when at least N of the selected strategies agree on direction at the same bar — fewer signals, meant to be higher-precision than any one alone.
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {STRATEGIES.filter(s => s.backtestable).map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleComboStrategy(s.id)}
                className="px-2.5 py-1 rounded-full text-[11px]"
                style={{
                  background: comboStrategies.includes(s.id) ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${comboStrategies.includes(s.id) ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: comboStrategies.includes(s.id) ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Minimum agree:</label>
            <input
              type="number"
              min={1}
              max={Math.max(1, comboStrategies.length)}
              value={comboMinAgree}
              onChange={e => setComboMinAgree(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 rounded px-2 py-1 text-[11px]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
            />
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>of {comboStrategies.length} selected</span>
            <button
              type="button"
              disabled={comboRunning || comboStrategies.length < 2}
              onClick={() => void runComboBacktestNow()}
              className="ml-auto px-4 py-2 rounded-lg text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}
            >
              {comboRunning ? 'Running…' : 'Run combo backtest'}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              value={setupName}
              onChange={e => setSetupName(e.target.value)}
              placeholder="Name this setup (e.g. SMC+OB+iFVG H1)"
              className="flex-1 rounded px-2 py-1.5 text-[11px]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
            />
            <button
              type="button"
              disabled={!setupName.trim() || comboStrategies.length < 2}
              onClick={() => { void saveSetup(setupName); setSetupName(''); }}
              className="px-3 py-1.5 rounded text-[11px] shrink-0 disabled:opacity-40"
              style={{ background: 'rgba(96,165,250,0.15)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.3)' }}
            >
              Save setup
            </button>
          </div>

          {comboResult && (
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {[
                { label: 'Net return', value: `${(comboResult.netReturnPct * 100).toFixed(1)}%`, color: comboResult.netReturnPct >= 0 ? '#6ee7b7' : '#fca5a5' },
                { label: 'Trades', value: String(comboResult.totalTrades) },
                { label: 'Win rate', value: `${(comboResult.winRate * 100).toFixed(0)}%`, color: comboResult.winRate >= 0.5 ? '#6ee7b7' : '#fca5a5' },
                { label: 'Profit factor', value: Number.isFinite(comboResult.profitFactor) ? comboResult.profitFactor.toFixed(2) : '∞' },
                { label: 'Max drawdown', value: `${(comboResult.maxDrawdownPct * 100).toFixed(1)}%`, color: '#fca5a5' },
              ].map(t => (
                <div key={t.label} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{t.label}</div>
                  <div className="text-[15px] font-mono-data mt-0.5" style={{ color: t.color || '#F5F0E6' }}>{t.value}</div>
                </div>
              ))}
              {comboResult.note && (
                <p className="col-span-4 text-[10px] leading-snug mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{comboResult.note}</p>
              )}
              <div className="col-span-4 flex items-center gap-2 mt-1">
                <input
                  value={comboSaveNote}
                  onChange={e => setComboSaveNote(e.target.value)}
                  placeholder="Optional note"
                  className="flex-1 rounded px-2 py-1.5 text-[11px]"
                  style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                />
                <button
                  type="button"
                  onClick={() => { void saveCurrentBacktest(comboSaveNote || undefined, comboResult); setComboSaveNote(''); }}
                  className="px-3 py-1.5 rounded text-[11px] shrink-0"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}
                >
                  Save this run
                </button>
              </div>
            </div>
          )}
        </WidgetCard>

        {setups.length > 0 && (
          <WidgetCard title="My setups">
            <div className="space-y-1.5">
              {setups.map(su => (
                <div key={su.id} className="flex items-center gap-2 rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate" style={{ color: '#F5F0E6' }}>{su.name}</div>
                    <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {su.minAgree}/{su.strategies.length} agree · {su.timeframe} · {su.limit.toLocaleString()} bars · {su.strategies.map(s => STRATEGIES.find(x => x.id === s)?.label ?? s).join(' + ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadSetup(su)}
                    className="px-2.5 py-1 rounded text-[11px] shrink-0"
                    style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSetup(su.id)}
                    className="px-2 py-1 rounded text-[11px] shrink-0"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </WidgetCard>
        )}

        {savedStrategies.length > 0 && (
          <WidgetCard title="Saved strategies">
            <div className="space-y-1.5">
              {savedStrategies.map(s => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]" style={{ color: '#F5F0E6' }}>
                      {STRATEGIES.find(st => st.id === s.strategy)?.label ?? s.strategy} · {s.symbol}
                      {s.note ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> — {s.note}</span> : null}
                    </div>
                    <div className="text-[10px] font-mono-data mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {(s.netReturnPct * 100).toFixed(1)}% return · {(s.winRate * 100).toFixed(0)}% win · {s.totalTrades} trades · PF {Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'} · {s.savedAt.slice(0, 10)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteSavedStrategy(s.id)}
                    className="text-[10px] shrink-0"
                    style={{ color: 'var(--error)' }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </WidgetCard>
        )}
      </div>
    </div>
  );
}
