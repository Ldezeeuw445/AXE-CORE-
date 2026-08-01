import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

export function CodeProjection({ payload }: { payload: ProjectionPayload }) {
  const lines = (payload.text || '').split('\n');
  return (
    <div className="h-full flex flex-col min-h-0 pt-8 pb-10 px-5">
      <div className="flex-shrink-0 text-center mb-1.5">
        <div className="text-[11px] font-semibold" style={{ color: '#F5F0E6' }}>{payload.title}</div>
        {payload.subtitle && (
          <div className="text-[8px] mt-0.5" style={{ color: 'rgba(34,211,238,0.5)' }}>{payload.subtitle}</div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
        <pre
          className="text-[9px] leading-relaxed font-mono px-1"
          style={{ color: 'rgba(165,243,252,0.88)' }}
        >
          {lines.slice(0, 40).map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="select-none w-4 text-right flex-shrink-0" style={{ color: 'rgba(255,255,255,0.18)' }}>
                {i + 1}
              </span>
              <span className="whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          ))}
          {lines.length > 40 && (
            <div className="text-center mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>…</div>
          )}
        </pre>
      </div>
    </div>
  );
}
