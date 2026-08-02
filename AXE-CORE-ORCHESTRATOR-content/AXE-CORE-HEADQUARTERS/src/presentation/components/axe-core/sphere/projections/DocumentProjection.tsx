import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

/** File / text content inside the sphere hologram portal. */
export function DocumentProjection({ payload }: { payload: ProjectionPayload }) {
  return (
    <div className="h-full flex flex-col min-h-0 pt-8 pb-10 px-6">
      <div className="flex-shrink-0 text-center mb-2">
        <div
          className="text-[11px] font-semibold tracking-wide truncate"
          style={{ color: '#F5F0E6' }}
        >
          {payload.title}
        </div>
        {payload.subtitle && (
          <div className="text-[8px] mt-0.5 truncate" style={{ color: 'rgba(34,211,238,0.55)' }}>
            {payload.subtitle}
          </div>
        )}
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto px-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        <pre
          className="text-[10px] leading-relaxed whitespace-pre-wrap break-words font-mono text-center"
          style={{ color: 'rgba(165,243,252,0.85)' }}
        >
          {payload.text || '—'}
        </pre>
      </div>
    </div>
  );
}
