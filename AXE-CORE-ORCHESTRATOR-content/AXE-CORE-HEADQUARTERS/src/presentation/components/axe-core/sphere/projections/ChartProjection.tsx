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
    { label: 'A', value: 30 },
    { label: 'B', value: 55 },
    { label: 'C', value: 42 },
    { label: 'D', value: 70 },
  ];
}

export function ChartProjection({ payload }: { payload: ProjectionPayload }) {
  const series = readSeries(payload);
  const max = Math.max(...series.map(s => s.value), 1);
  const w = 320;
  const h = 160;
  const pad = 28;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = series.length > 1 ? innerW / (series.length - 1) : innerW;

  const points = series
    .map((s, i) => {
      const x = pad + i * step;
      const y = pad + innerH - (s.value / max) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  const area = `${pad},${pad + innerH} ${points} ${pad + innerW},${pad + innerH}`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <div className="text-[11px] font-semibold" style={{ color: '#F5F0E6' }}>{payload.title}</div>
        {payload.subtitle && (
          <div className="text-[9px] mt-0.5" style={{ color: 'rgba(212,252,52,0.55)' }}>{payload.subtitle}</div>
        )}
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-3">
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="max-w-md">
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(212,252,52,0.35)" />
              <stop offset="100%" stopColor="rgba(212,252,52,0)" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map(t => (
            <line
              key={t}
              x1={pad}
              x2={pad + innerW}
              y1={pad + innerH * (1 - t)}
              y2={pad + innerH * (1 - t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          ))}
          <polygon points={area} fill="url(#chartFill)" />
          <polyline
            points={points}
            fill="none"
            stroke="#d4fc34"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {series.map((s, i) => {
            const x = pad + i * step;
            const y = pad + innerH - (s.value / max) * innerH;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={3.5} fill="#0a0a0a" stroke="#d4fc34" strokeWidth={1.5} />
                <text x={x} y={h - 8} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={9}>
                  {s.label}
                </text>
              </g>
            );
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
