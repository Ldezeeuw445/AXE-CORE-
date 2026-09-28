/**
 * StrategyMatrix — waar zit een edge werkelijk: strategie × paar × timeframe,
 * met de instellingen van de lab erboven. Een cel met te weinig trades wordt
 * gedimd en zo genoemd; de ranglijst telt alleen cellen met genoeg steekproef.
 */
import { useRef, useState } from 'react';
import { DISTINCT_STRATEGIES, type StrategyId } from '@/application/tradingIntel/strategySignals';
import {
  MATRIX_MIN_TRADES, runStrategyMatrix, type MatrixCell, type StrategyLabInput,
} from '@/application/tradingIntel/strategyLab';
import { COMMON_PAIRS } from '../useTradingDeskState';

const TFS = ['15m', '1h', '4h', '1d'];
const DIM = { color: 'rgba(255,255,255,0.4)' } as const;

function Chips<T extends string>({ all, selected, onToggle }: { all: readonly T[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {all.map(v => (
        <button key={v} type="button" onClick={() => onToggle(v)} aria-pressed={selected.includes(v)}
          className="px-2 py-0.5 rounded-full text-[10.5px]"
          style={{ border: `1px solid ${selected.includes(v) ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.1)'}`, color: selected.includes(v) ? '#c4b5fd' : 'rgba(255,255,255,0.5)' }}>
          {v}
        </button>
      ))}
    </div>
  );
}

export function StrategyMatrix({ base }: { base: () => Omit<StrategyLabInput, 'symbol' | 'timeframe' | 'strategy'> }) {
  const [strategies, setStrategies] = useState<StrategyId[]>(['volumetric-ob', 'trend-follow', 'ifvg']);
  const [symbols, setSymbols] = useState<string[]>(['XAUUSD', 'EURUSD']);
  const [timeframes, setTimeframes] = useState<string[]>(['1h', '4h']);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [cells, setCells] = useState<MatrixCell[]>([]);
  const stop = useRef(false);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const total = strategies.length * symbols.length * timeframes.length;

  const run = async () => {
    stop.current = false;
    setRunning(true); setCells([]);
    try {
      const out = await runStrategyMatrix({
        strategies, symbols, timeframes, base: base(),
        onProgress: (d, t, label) => setProgress(label ? `${d + 1}/${t} · ${label}` : `${d}/${t} done`),
        shouldStop: () => stop.current,
      });
      setCells(out);
    } finally {
      setRunning(false);
    }
  };

  const columns = symbols.flatMap(s => timeframes.map(tf => ({ s, tf })));
  const cellAt = (st: StrategyId, s: string, tf: string) => cells.find(c => c.strategy === st && c.symbol === s && c.timeframe === tf);
  const ranked = cells.filter(c => c.ok && !c.smallSample).sort((a, b) => b.avgR - a.avgR).slice(0, 8);

  return (
    <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Matrix — strategy × pair × timeframe (uses the settings above)</p>
      <Chips all={[...DISTINCT_STRATEGIES] as StrategyId[]} selected={strategies} onToggle={v => setStrategies(l => toggle(l, v))} />
      <Chips all={COMMON_PAIRS as readonly string[]} selected={symbols} onToggle={v => setSymbols(l => toggle(l, v))} />
      <Chips all={TFS} selected={timeframes} onToggle={v => setTimeframes(l => toggle(l, v))} />
      <div className="flex items-center gap-2">
        <button type="button" disabled={running || total === 0} onClick={() => void run()} className="px-3 py-1.5 rounded text-[11px] disabled:opacity-40"
          style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}>
          {running ? 'Running…' : `Run ${total} cell${total === 1 ? '' : 's'}`}
        </button>
        {running && <button type="button" onClick={() => { stop.current = true; }} className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Stop</button>}
        {progress && <span className="text-[10px] font-mono-data" style={DIM}>{progress}</span>}
      </div>

      {cells.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="text-[10.5px] font-mono-data">
              <thead>
                <tr style={DIM}>
                  <th className="text-left font-normal pr-3 pb-1">Strategy</th>
                  {columns.map(c => <th key={`${c.s}${c.tf}`} className="text-left font-normal pr-4 pb-1 whitespace-nowrap">{c.s} {c.tf}</th>)}
                </tr>
              </thead>
              <tbody>
                {strategies.map(st => (
                  <tr key={st} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="py-1 pr-3" style={{ color: '#F5F0E6' }}>{st}</td>
                    {columns.map(c => {
                      const cell = cellAt(st, c.s, c.tf);
                      if (!cell) return <td key={`${c.s}${c.tf}`} className="py-1 pr-4" style={DIM}>…</td>;
                      if (!cell.ok) return <td key={`${c.s}${c.tf}`} className="py-1 pr-4" style={{ color: '#fca5a5' }} title={cell.error}>error</td>;
                      const color = cell.netReturnPct >= 0 ? '#6ee7b7' : '#fca5a5';
                      return (
                        <td key={`${c.s}${c.tf}`} className="py-1 pr-4 whitespace-nowrap" style={{ opacity: cell.smallSample ? 0.45 : 1 }}
                          title={cell.smallSample ? `Only ${cell.trades} trades — below ${MATRIX_MIN_TRADES}, not evidence of an edge` : undefined}>
                          <span style={{ color }}>{(cell.netReturnPct * 100).toFixed(1)}%</span>
                          <span style={DIM}> · {cell.trades}t · R {cell.avgR.toFixed(2)} · DD {(cell.maxDrawdownPct * 100).toFixed(1)}%</span>
                          {cell.funded ? <span style={DIM}> · {cell.funded}</span> : null}
                          {cell.smallSample ? <span style={{ color: '#fcd34d' }}> ⚠</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px]" style={DIM}>
            Best cells by average R, only with ≥ {MATRIX_MIN_TRADES} trades:{' '}
            {ranked.length
              ? ranked.map(c => `${c.strategy} ${c.symbol} ${c.timeframe} (R ${c.avgR.toFixed(2)}, ${c.trades}t)`).join(' · ')
              : 'none — no cell has enough trades yet'}
          </p>
        </>
      )}
    </div>
  );
}
