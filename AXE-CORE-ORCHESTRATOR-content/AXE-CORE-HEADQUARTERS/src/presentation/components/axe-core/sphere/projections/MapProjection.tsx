import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

function tileXY(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, n };
}

export function MapProjection({ payload }: { payload: ProjectionPayload }) {
  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');
  const nearby = Array.isArray(payload.data?.nearby)
    ? (payload.data!.nearby as Array<{ name: string; lat: number; lng: number }>)
    : [];

  const zoom = 12;
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
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <div className="text-[11px] font-semibold" style={{ color: '#F5F0E6' }}>{payload.title}</div>
        <div className="text-[9px] mt-0.5" style={{ color: 'rgba(167,139,250,0.7)' }}>
          {label} · {lat.toFixed(4)}, {lng.toFixed(4)}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative mx-3 mb-2 rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(167,139,250,0.25)' }}
      >
        <div
          className="absolute inset-0 grid grid-cols-3 grid-rows-3"
          style={{ filter: 'saturate(0.75) brightness(0.82) contrast(1.05)' }}
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
              'radial-gradient(ellipse at 50% 45%, rgba(139,92,246,0.12), transparent 55%), linear-gradient(to top, rgba(0,0,0,0.55), transparent 40%)',
          }}
        />

        {/* Crosshair pin */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div
              className="w-3 h-3 rounded-full animate-pulse"
              style={{
                background: '#a78bfa',
                boxShadow: '0 0 18px rgba(167,139,250,0.9)',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border"
              style={{ borderColor: 'rgba(167,139,250,0.4)' }}
            />
          </div>
        </div>

        <div
          className="absolute bottom-2 left-2 right-2 text-[9px] font-mono px-2 py-1 rounded"
          style={{ background: 'rgba(0,0,0,0.7)', color: 'rgba(196,181,253,0.9)' }}
        >
          {lat.toFixed(5)}° · {lng.toFixed(5)}° · z{zoom}
        </div>
      </div>

      {nearby.length > 0 && (
        <div className="flex-shrink-0 px-3 pb-3 flex flex-wrap gap-1">
          {nearby.slice(0, 6).map((p) => (
            <span
              key={p.name}
              className="text-[8px] px-1.5 py-0.5 rounded-full"
              style={{
                color: 'rgba(196,181,253,0.8)',
                border: '1px solid rgba(167,139,250,0.25)',
                background: 'rgba(167,139,250,0.08)',
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
