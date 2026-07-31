import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

export function MapProjection({ payload }: { payload: ProjectionPayload }) {
  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');

  // Static OSM tile approx — presentation only; no map SDK ownership
  const zoom = 11;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  const tileUrl = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <div className="text-[11px] font-semibold" style={{ color: '#F5F0E6' }}>{payload.title}</div>
        <div className="text-[9px] mt-0.5" style={{ color: 'rgba(167,139,250,0.7)' }}>
          {label} · {lat.toFixed(4)}, {lng.toFixed(4)}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative mx-3 mb-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(167,139,250,0.25)' }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 45%, rgba(139,92,246,0.2), transparent 55%), #050508',
          }}
        />
        <img
          src={tileUrl}
          alt={label}
          className="absolute inset-0 w-full h-full object-cover opacity-70"
          style={{ filter: 'saturate(0.7) brightness(0.85)' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* Crosshair pin */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: '#a78bfa',
                boxShadow: '0 0 16px rgba(167,139,250,0.8)',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border"
              style={{ borderColor: 'rgba(167,139,250,0.45)' }}
            />
          </div>
        </div>
        <div
          className="absolute bottom-2 left-2 right-2 text-[9px] font-mono px-2 py-1 rounded"
          style={{ background: 'rgba(0,0,0,0.65)', color: 'rgba(196,181,253,0.85)' }}
        >
          {lat.toFixed(5)}° N · {lng.toFixed(5)}° E
        </div>
      </div>
    </div>
  );
}
