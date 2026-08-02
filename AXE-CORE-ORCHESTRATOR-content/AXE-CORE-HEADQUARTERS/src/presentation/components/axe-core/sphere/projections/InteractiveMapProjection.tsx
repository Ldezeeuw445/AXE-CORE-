import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

/**
 * A real, interactive map in the sphere portal — drag to pan, scroll/pinch
 * to zoom, same MapLibre GL + free CartoDB tiles pattern already used by
 * StreetMap.tsx (no API key needed, unlike the Google 3D path). Replaces
 * the old static 3x3/5x5 raster-tile grid, which could only ever show one
 * fixed view with no way to actually look around.
 */
export function InteractiveMapProjection({ payload }: { payload: ProjectionPayload }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 22 }],
      },
      center: [lng, lat],
      zoom: 13,
      pitch: 45,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const el = document.createElement('div');
    el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:#a78bfa;box-shadow:0 0 18px rgba(167,139,250,1);border:2px solid white;"></div>`;
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);

    return () => { map.remove(); };
    // Re-centering an existing map instance on a new payload is a nicer
    // continuous pan than tearing down and rebuilding — but SphereStage
    // already keys the portal on payload.id, which remounts this whole
    // component per projection, so lat/lng are only ever read once here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full w-full relative overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent 25%)' }}
      />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center px-3 pointer-events-none">
        <div className="text-[15px] font-semibold tracking-wide" style={{ color: '#f5f0e6', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
          {payload.title}
        </div>
        <div className="text-[9px] mt-0.5 truncate max-w-[320px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {label}
        </div>
      </div>
    </div>
  );
}
