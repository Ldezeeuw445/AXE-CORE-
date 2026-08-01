import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

type Point = { label: string; value: number };

function readSeries(payload: ProjectionPayload): Point[] {
  const raw = payload.data?.series;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((p, i) => {
      const row = p as Record<string, unknown>;
      return {
        label: String(row.label ?? row.x ?? i),
        value: Number(row.value ?? row.y ?? 0),
      };
    });
  }
  return [
    { label: 'Mon', value: 42 },
    { label: 'Tue', value: 55 },
    { label: 'Wed', value: 48 },
    { label: 'Thu', value: 70 },
    { label: 'Fri', value: 63 },
    { label: 'Sat', value: 80 },
    { label: 'Sun', value: 74 },
  ];
}

export function ChartProjection({ payload }: { payload: ProjectionPayload }) {
  const series = readSeries(payload);
  const max = Math.max(...series.map(s => s.value), 1);
  const total = series.reduce((a, s) => a + s.value, 0);
  const peak = series.reduce((best, s) => (s.value > best.value ? s : best), series[0]);
  const source = String(payload.data?.source ?? 'resolved');
  const currency = payload.data?.currency != null ? String(payload.data.currency) : '';

  const w = 360;
  const h = 168;
  const padL = 28;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = series.length;
  const gap = 6;
  const barW = Math.max(8, (innerW - gap * Math.max(n - 1, 0)) / Math.max(n, 1));

  const linePts = series
    .map((s, i) => {
      const x = padL + i * (barW + gap) + barW / 2;
      const y = padT + innerH - (s.value / max) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold truncate" style={{ color: '#F5F0E6' }}>{payload.title}</div>
          {payload.subtitle && (
            <div className="text-[9px] mt-0.5 truncate" style={{ color: 'rgba(212,252,52,0.55)' }}>{payload.subtitle}</div>
          )}
        </div>
        <div
          className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            color: source === 'income_ledger' ? '#d4fc34' : 'rgba(255,255,255,0.35)',
            border: `1px solid ${source === 'income_ledger' ? 'rgba(212,252,52,0.35)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {source === 'income_ledger' ? 'live ledger' : source === 'sample' ? 'sample' : source}
        </div>
      </div>

      <div className="flex-shrink-0 px-4 flex gap-3 mb-1">
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          total <span style={{ color: '#d4fc34' }}>{currency}{total.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        </div>
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          peak <span style={{ color: '#a5f3fc' }}>{peak.label} · {peak.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        </div>
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          n <span style={{ color: 'rgba(255,255,255,0.7)' }}>{series.length}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="max-w-lg">
          <defs>
            <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(212,252,52,0.75)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0.25)" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map(t => (
            <line
              key={t}
              x1={padL}
              x2={padL + innerW}
              y1={padT + innerH * (1 - t)}
              y2={padT + innerH * (1 - t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}
          {series.map((s, i) => {
            const x = padL + i * (barW + gap);
            const bh = (s.value / max) * innerH;
            const y = padT + innerH - bh;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(bh, 1)}
                  rx={3}
                  fill="url(#barFill)"
                  opacity={0.85}
                />
                <text
                  x={x + barW / 2}
                  y={h - 8}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.35)"
                  fontSize={9}
                >
                  {s.label.length > 6 ? `${s.label.slice(0, 5)}…` : s.label}
                </text>
              </g>
            );
          })}
          <polyline
            points={linePts}
            fill="none"
            stroke="rgba(165,243,252,0.85)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {series.map((s, i) => {
            const x = padL + i * (barW + gap) + barW / 2;
            const y = padT + innerH - (s.value / max) * innerH;
            return <circle key={`c${i}`} cx={x} cy={y} r={2.5} fill="#0a0a0a" stroke="#a5f3fc" strokeWidth={1.2} />;
          })}
        </svg>
      </div>
      {payload.text && (
        <div className="px-4 pb-3 text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {payload.text}
        </div>
      )}
    </div>
  );
}
