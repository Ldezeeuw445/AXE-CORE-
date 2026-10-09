import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';

/**
 * Tekst op Home: een samenvatting van het gesprek, een vergelijking, een plan, een
 * zoekresultaat. Leesbaar (markdown, gewone letter) in plaats van 10px mono in een
 * cirkel -- dit is iets om te lezen, niet om naar te kijken.
 */
export function DocumentProjection({ payload }: { payload: ProjectionPayload }) {
  return (
    <div className="absolute inset-0 flex flex-col min-h-0 px-6 pt-5 pb-4">
      <div className="flex-shrink-0 mb-3 pr-10">
        <div className="text-[15px] font-semibold tracking-tight truncate" style={{ color: '#F5F0E6' }}>
          {payload.title}
        </div>
        {payload.subtitle && (
          <div className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(34,211,238,0.7)' }}>
            {payload.subtitle}
          </div>
        )}
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto pr-1 text-[13px] leading-relaxed"
        style={{ scrollbarWidth: 'thin', color: 'rgba(235,240,245,0.92)' }}
      >
        <MarkdownMessage text={payload.text || '—'} />
      </div>
    </div>
  );
}
