import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

export function CodeProjection({ payload }: { payload: ProjectionPayload }) {
  const lines = (payload.text || '').split('\n');
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#F5F0E6' }}>{payload.title}</div>
          {payload.subtitle && (
            <div className="text-[9px] mt-0.5" style={{ color: 'rgba(34,211,238,0.5)' }}>{payload.subtitle}</div>
          )}
        </div>
        <span className="text-[8px] tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>
          code
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-3" style={{ scrollbarWidth: 'thin' }}>
        <pre
          className="text-[11px] leading-relaxed font-mono rounded-lg p-3"
          style={{
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(34,211,238,0.12)',
            color: 'rgba(165,243,252,0.88)',
          }}
        >
          {lines.map((line, i) => (
            <div key={i} className="flex gap-3">
              <span className="select-none w-6 text-right flex-shrink-0" style={{ color: 'rgba(255,255,255,0.18)' }}>
                {i + 1}
              </span>
              <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
