/**
 * FrameworkEnginesPanel — de VPS-engines (vectorbt, Nautilus, Kronos,
 * TradingAgents) vanuit de lab, naast de AXE-run, met hun aannames ernaast.
 */
import { useState } from 'react';
import {
  FRAMEWORK_ENGINES, labResultToFramework, runFrameworkEngine,
  type EngineId, type FrameworkResult,
} from '@/application/tradingIntel/frameworkEngines';
import type { StrategyLabResult } from '@/application/tradingIntel/strategyLab';

const DIM = { color: 'rgba(255,255,255,0.4)' } as const;
type Remote = Exclude<EngineId, 'axe-lab'>;

export function FrameworkEnginesPanel({ symbol, timeframe, labResult }: { symbol: string; timeframe: string; labResult: StrategyLabResult | null }) {
  const [engine, setEngine] = useState<Remote>('nt');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FrameworkResult[]>([]);
  const desc = FRAMEWORK_ENGINES[engine];

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const res = await runFrameworkEngine({ engine, symbol, timeframe });
      if (res.ok) setResults(r => [...r.filter(x => x.engine !== engine || x.symbol !== res.results[0]?.symbol), ...res.results]);
      else setError(res.error);
    } finally {
      setRunning(false);
    }
  };

  const rows = [...(labResult ? [labResultToFramework(labResult)] : []), ...results.filter(r => r.symbol === symbol.toUpperCase())];

  return (
    <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Framework engines — same pair and timeframe, their own assumptions</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={engine} onChange={e => setEngine(e.target.value as Remote)} className="rounded px-2 py-1 text-[11px]"
          style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} aria-label="Engine">
          {Object.values(FRAMEWORK_ENGINES).map(e => <option key={e.id} value={e.id}>{e.label} ({e.kind})</option>)}
        </select>
        <button type="button" disabled={running} onClick={() => void run()} className="px-3 py-1.5 rounded text-[11px] disabled:opacity-40"
          style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}>
          {running ? `Running ${desc.label}…` : `Run ${desc.label} on ${symbol} ${timeframe}`}
        </button>
        {desc.timeframes && <span className="text-[10px]" style={DIM}>only {desc.timeframes.join('/')}</span>}
        {desc.slow && <span className="text-[10px]" style={{ color: '#fcd34d' }}>{desc.slow}</span>}
        {error && <span className="text-[11px]" style={{ color: '#fca5a5' }}>{error}</span>}
      </div>
      <p className="text-[10px]" style={DIM}>
        {desc.label}: fills {desc.assumptions.fills} · stops {desc.assumptions.stops} · costs {desc.assumptions.costs} · sizing {desc.assumptions.sizing} · returns {desc.assumptions.returns}
      </p>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px] font-mono-data">
            <thead>
              <tr style={DIM}>
                {['Engine', 'Strategy', 'Kind', 'TF', 'Trades', 'Return', 'Win', 'PF', 'Max DD', 'Live-eligible', 'Warnings'].map(hd => (
                  <th key={hd} className="text-left font-normal pb-1 pr-3 whitespace-nowrap">{hd}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.engine}:${r.strategy}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} title={`fills ${r.assumptions.fills}; stops ${r.assumptions.stops}; costs ${r.assumptions.costs}; sizing ${r.assumptions.sizing}`}>
                  <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{r.engineLabel}</td>
                  <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{r.strategy}</td>
                  <td className="py-1 pr-3" style={DIM}>{r.kind}</td>
                  <td className="py-1 pr-3" style={DIM}>{r.timeframe}</td>
                  <td className="py-1 pr-3" style={{ color: r.sampleSize < 30 ? '#fcd34d' : 'rgba(255,255,255,0.7)' }}>{r.sampleSize}</td>
                  <td className="py-1 pr-3" style={{ color: r.metrics.netReturnPct >= 0 ? '#6ee7b7' : '#fca5a5' }}>{(r.metrics.netReturnPct * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3" style={DIM}>{(r.metrics.winRate * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-3" style={DIM}>{Number.isFinite(r.metrics.profitFactor) ? r.metrics.profitFactor.toFixed(2) : '∞'}</td>
                  <td className="py-1 pr-3" style={DIM}>{r.metrics.maxDrawdownPct == null ? '—' : `${(r.metrics.maxDrawdownPct * 100).toFixed(1)}%`}</td>
                  <td className="py-1 pr-3" style={{ color: r.eligibility.eligible ? '#6ee7b7' : '#fca5a5' }} title={r.eligibility.reasons.join('; ')}>
                    {r.engine === 'axe-lab' ? '—' : r.eligibility.eligible ? 'yes' : r.eligibility.reasons[0]}
                  </td>
                  <td className="py-1 pr-3" style={{ color: 'rgba(252,211,77,0.8)' }}>{r.warnings.length ? `${r.warnings.length} ⚠` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
