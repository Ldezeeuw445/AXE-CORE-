/**
 * Wat er in een projectie staat, per soort: document, code, beeld, grafiek of kaart. Eén plek, voor de
 * bol op de desktop-Home (SphereStage) en voor de telefoon-Home (MobileProjection), zodat een nieuwe
 * soort er niet in de ene wel en in de andere niet in komt (de telefoon rendeerde tot 9 okt helemaal
 * geen projecties: "laat het op Home zien" deed daar niets).
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { DocumentProjection } from '@/presentation/components/axe-core/sphere/projections/DocumentProjection';
import { ImageProjection } from '@/presentation/components/axe-core/sphere/projections/ImageProjection';
import { ChartProjection } from '@/presentation/components/axe-core/sphere/projections/ChartProjection';
import { InteractiveMapProjection } from '@/presentation/components/axe-core/sphere/projections/InteractiveMapProjection';
import { CodeProjection } from '@/presentation/components/axe-core/sphere/projections/CodeProjection';

export function ProjectionBody({ payload }: { payload: ProjectionPayload }) {
  switch (payload.mode) {
    case 'document': return <DocumentProjection payload={payload} />;
    case 'code': return <CodeProjection payload={payload} />;
    case 'image':
    case 'media': return <ImageProjection payload={payload} />;
    case 'chart': return <ChartProjection payload={payload} />;
    case 'map': return <InteractiveMapProjection payload={payload} />;
    default:
      return (
        <div className="h-full flex items-center justify-center text-[12px]" style={{ color: '#a5f3fc' }}>
          {payload.title}
        </div>
      );
  }
}
