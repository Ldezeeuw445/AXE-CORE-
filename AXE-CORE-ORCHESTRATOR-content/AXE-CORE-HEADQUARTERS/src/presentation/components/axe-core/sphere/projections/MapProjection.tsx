import { useNavigate } from 'react-router';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { Map, Maximize2, Glasses } from 'lucide-react';

function tileXY(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export function MapProjection({ payload }: { payload: ProjectionPayload }) {
  const navigate = useNavigate();
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

  const openFull3D = () => {
    // App route is /maps-3d (HashRouter → #/maps-3d?...)
    navigate(`/maps-3d?lat=${lat}&lng=${lng}&label=${encodeURIComponent(label)}`);
  };

  const enterXR = () => {
    window.dispatchEvent(
      new CustomEvent('axe-enter-xr', {
        detail: { mode: 'map', lat, lng, label, title: payload.title },
      }),
    );
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tracking-wide" style={{ color: '#F5F0E6' }}>
            {payload.title}
          </div>
          <div className="text-[9px] mt-0.5 truncate" style={{ color: 'rgba(167,139,250,0.75)' }}>
            {label} · {lat.toFixed(4)}, {lng.toFixed(4)}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={enterXR}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-medium"
            style={{
              background: 'rgba(167,139,250,0.18)',
              border: '1px solid rgba(167,139,250,0.45)',
              color: '#c4b5fd',
            }}
            title="Enter WebXR / VR"
          >
            <Glasses size={11} />
            XR
          </button>
          <button
            type="button"
            onClick={openFull3D}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-medium"
            style={{
              background: 'rgba(34,211,238,0.15)',
              border: '1px solid rgba(34,211,238,0.4)',
              color: '#a5f3fc',
            }}
            title="Open full 3D Maps"
          >
            <Maximize2 size={11} />
            3D
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 relative mx-3 mb-2 rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(167,139,250,0.3)' }}
      >
        <div
          className="absolute inset-0 grid grid-cols-3 grid-rows-3"
          style={{ filter: 'saturate(0.85) brightness(0.78) contrast(1.08)' }}
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
              'radial-gradient(ellipse at 50% 42%, rgba(139,92,246,0.18), transparent 58%), linear-gradient(to top, rgba(0,0,0,0.65), transparent 45%)',
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div
              className="w-3.5 h-3.5 rounded-full animate-pulse"
              style={{
                background: '#a78bfa',
                boxShadow: '0 0 22px rgba(167,139,250,1)',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border"
              style={{ borderColor: 'rgba(167,139,250,0.45)' }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border"
              style={{ borderColor: 'rgba(167,139,250,0.18)' }}
            />
          </div>
        </div>

        <div
          className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium"
          style={{
            background: 'rgba(0,0,0,0.72)',
            border: '1px solid rgba(167,139,250,0.35)',
            color: '#e9d5ff',
          }}
        >
          <Map size={11} />
          {payload.title}
        </div>

        <div
          className="absolute bottom-2 left-2 right-2 text-[9px] font-mono px-2 py-1 rounded"
          style={{ background: 'rgba(0,0,0,0.75)', color: 'rgba(196,181,253,0.9)' }}
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
                color: 'rgba(196,181,253,0.85)',
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
