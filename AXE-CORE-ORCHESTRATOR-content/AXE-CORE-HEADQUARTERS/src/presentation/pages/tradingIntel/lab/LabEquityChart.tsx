/**
 * LabEquityChart — equity van een lab-run, met het slechtste punt per bar en de
 * momenten waarop een regel brak of het doel gehaald werd. Alleen lijnen en
 * letters; geen vlakken (UI-MAATSTAF).
 */
import type { LabEquityPoint, LabEvent } from '@/domain/tradingIntel/strategyLab/simulate';

export function LabEquityChart({ points, events, startingBalance, height = 150 }: {
  points: LabEquityPoint[];
  events?: LabEvent[];
  startingBalance: number;
  height?: number;
}) {
  if (points.length < 2) return <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Not enough bars for a curve.</p>;
  const w = 720;
  const h = height;
  const values = points.flatMap(p => [p.equity, p.worstEquity, startingBalance]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (k: number) => (k / (points.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / range) * (h - 8) - 4;
  const line = (get: (p: LabEquityPoint) => number) => points.map((p, k) => `${x(k).toFixed(1)},${y(get(p)).toFixed(1)}`).join(' ');
  const indexToX = new Map(points.map((p, k) => [p.index, x(k)]));
  const marks = (events ?? []).filter(e => e.kind === 'breach' || e.kind === 'pass');
  const end = points[points.length - 1].equity;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img"
        aria-label={`Equity from ${startingBalance.toFixed(0)} to ${end.toFixed(0)}`}>
        <line x1={0} y1={y(startingBalance)} x2={w} y2={y(startingBalance)} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        <polyline points={line(p => p.worstEquity)} fill="none" stroke="rgba(248,113,113,0.35)" strokeWidth={1} />
        <polyline points={line(p => p.equity)} fill="none" stroke={end >= startingBalance ? '#34d399' : '#f87171'} strokeWidth={1.5} />
        {marks.map((e, k) => {
          const mx = indexToX.get(e.index);
          if (mx == null) return null;
          return <line key={k} x1={mx} y1={0} x2={mx} y2={h} stroke={e.kind === 'pass' ? '#34d399' : '#f87171'} strokeWidth={1} />;
        })}
      </svg>
      <div className="flex justify-between text-[9px] font-mono-data mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
        <span>{points[0].time.slice(0, 16).replace('T', ' ')}</span>
        <span>equity · <span style={{ color: 'rgba(248,113,113,0.7)' }}>worst intrabar</span> · dashed = start</span>
        <span>{points[points.length - 1].time.slice(0, 16).replace('T', ' ')}</span>
      </div>
    </div>
  );
}
