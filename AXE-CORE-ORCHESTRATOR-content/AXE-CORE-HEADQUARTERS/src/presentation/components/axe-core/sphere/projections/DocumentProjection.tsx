import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

export function DocumentProjection({ payload }: { payload: ProjectionPayload }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        <div className="text-[11px] font-semibold tracking-wide" style={{ color: '#F5F0E6' }}>
          {payload.title}
        </div>
        {payload.subtitle && (
          <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {payload.subtitle}
          </div>
        )}
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4"
        style={{ scrollbarWidth: 'thin' }}
      >
        <pre
          className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono"
          style={{ color: 'rgba(165,243,252,0.82)' }}
        >
          {payload.text || '—'}
        </pre>
      </div>
    </div>
  );
}
