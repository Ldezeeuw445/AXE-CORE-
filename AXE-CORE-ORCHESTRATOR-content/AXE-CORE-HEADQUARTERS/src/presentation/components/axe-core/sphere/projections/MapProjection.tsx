import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { Map } from 'lucide-react';

function tileXY(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/**
 * Map projection lives entirely on Home inside SphereStage.
 * Never navigates to another route — sphere morph + glass layer is the UI.
 */
export function MapProjection({ payload }: { payload: ProjectionPayload }) {
  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');
  const nearby = Array.isArray(payload.data?.nearby)
    ? (payload.data!.nearby as Array<{ name: string; lat: number; lng: number }>)
    : [];

  const zoom = 13;
  const { x: cx, y: cy } = tileXY(lat, lng, zoom);
  const tiles: Array<{ dx: number; dy: number; url: string }> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push({
        dx,
        dy,
        url: `https://tile.openstreetmap.org/${zoom}/${cx + dx}/${cy + dy}.png`,
      });
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-3 pt-2 pb-1 flex items-center gap-2 min-w-0">
        <Map size={12} style={{ color: '#c4b5fd', flexShrink: 0 }} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wide truncate" style={{ color: '#F5F0E6' }}>
            {payload.title}
          </div>
          <div className="text-[8px] truncate" style={{ color: 'rgba(167,139,250,0.7)' }}>
            {label} · {lat.toFixed(3)}, {lng.toFixed(3)}
          </div>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative mx-2.5 mb-1.5 rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(167,139,250,0.28)' }}
      >
        <div
          className="absolute inset-0 grid grid-cols-3 grid-rows-3"
          style={{ filter: 'saturate(0.9) brightness(0.8) contrast(1.06)' }}
        >
          {tiles.map((t, i) => (
            <img
              key={i}
              src={t.url}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = '0';
              }}
            />
          ))}
        </div>

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 42%, rgba(139,92,246,0.16), transparent 58%), linear-gradient(to top, rgba(0,0,0,0.55), transparent 50%)',
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{
                background: '#a78bfa',
                boxShadow: '0 0 16px rgba(167,139,250,1)',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border"
              style={{ borderColor: 'rgba(167,139,250,0.4)' }}
            />
          </div>
        </div>

        <div
          className="absolute bottom-1.5 left-1.5 right-1.5 text-[8px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(196,181,253,0.85)' }}
        >
          {lat.toFixed(4)}° · {lng.toFixed(4)}°
        </div>
      </div>

      {nearby.length > 0 && (
        <div className="flex-shrink-0 px-2.5 pb-2 flex flex-wrap gap-1">
          {nearby.slice(0, 5).map((p) => (
            <span
              key={p.name}
              className="text-[7px] px-1.5 py-0.5 rounded-full"
              style={{
                color: 'rgba(196,181,253,0.8)',
                border: '1px solid rgba(167,139,250,0.22)',
                background: 'rgba(167,139,250,0.07)',
              }}
            >
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
