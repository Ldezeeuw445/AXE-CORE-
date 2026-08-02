import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

function tileXY(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Map fills the circular hologram portal on Home — never leaves the sphere. */
export function MapProjection({ payload }: { payload: ProjectionPayload }) {
  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');

  const zoom = 13;
  const { x: cx, y: cy } = tileXY(lat, lng, zoom);
  const tiles: Array<{ url: string }> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      tiles.push({
        url: `https://tile.openstreetmap.org/${zoom}/${cx + dx}/${cy + dy}.png`,
      });
    }
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      <div
        className="absolute inset-0 grid grid-cols-3 grid-rows-3"
        style={{ filter: 'saturate(0.92) brightness(0.82) contrast(1.08)' }}
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
            'radial-gradient(circle at 50% 45%, rgba(139,92,246,0.12), transparent 55%), linear-gradient(to top, rgba(0,0,0,0.55), transparent 40%)',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div
            className="w-2.5 h-2.5 rounded-full animate-pulse"
            style={{
              background: '#a78bfa',
              boxShadow: '0 0 18px rgba(167,139,250,1)',
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border"
            style={{ borderColor: 'rgba(167,139,250,0.45)' }}
          />
        </div>
      </div>

      <div
        className="absolute bottom-[18%] left-1/2 -translate-x-1/2 text-center px-3 pointer-events-none"
      >
        <div
          className="text-[11px] font-semibold tracking-wide"
          style={{ color: '#f5f0e6', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}
        >
          {payload.title}
        </div>
        <div
          className="text-[8px] mt-0.5 font-mono"
          style={{ color: 'rgba(196,181,253,0.9)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}
        >
          {lat.toFixed(3)}° · {lng.toFixed(3)}°
        </div>
        <div
          className="text-[7px] mt-0.5 truncate max-w-[160px]"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
