import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

/**
 * Interactive map for the Home sphere portal.
 * MapLibre + free raster tiles (Carto dark, OSM fallback) — no Google key.
 * Drag to pan, scroll/pinch to zoom, nav controls bottom-right.
 */
export function InteractiveMapProjection({ payload }: { payload: ProjectionPayload }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');
  const title = String(payload.title ?? 'Map');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Destroy previous instance if HMR / remount
    if (mapRef.current) {
      try { mapRef.current.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'basemap': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap · © CARTO',
          },
        },
        layers: [
          { id: 'basemap-layer', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 },
        ],
      },
      center: [lng, lat],
      zoom: 12.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      // Full interaction — not "cooperative" (which blocks scroll until ctrl)
      cooperativeGestures: false,
      dragPan: true,
      dragRotate: true,
      scrollZoom: true,
      touchZoomRotate: true,
      doubleClickZoom: true,
      keyboard: true,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }),
      'bottom-right',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const markerEl = document.createElement('div');
    markerEl.innerHTML =
      `<div style="width:14px;height:14px;border-radius:50%;background:#a78bfa;box-shadow:0 0 16px rgba(167,139,250,1);border:2px solid #fff;"></div>`;
    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);

    const popup = new maplibregl.Popup({ offset: 16, closeButton: false })
      .setHTML(
        `<div style="font:12px/1.3 system-ui,sans-serif;color:#111;padding:2px 4px">` +
        `<strong>${escapeHtml(title)}</strong><br/>` +
        `<span style="opacity:.7">${escapeHtml(label)}</span></div>`,
      );
    marker.setPopup(popup);

    const resize = () => {
      try { map.resize(); } catch { /* ignore */ }
    };

    // MapLibre often paints black until resize when parent used flex/absolute
    map.on('load', () => {
      resize();
      requestAnimationFrame(resize);
      setTimeout(resize, 50);
      setTimeout(resize, 200);
    });

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
  }, [lat, lng, label, title]);

  return (
    <div className="h-full w-full relative overflow-hidden" style={{ minHeight: 200 }}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%', minHeight: 200 }}
      />
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
        }}
      >
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate" style={{ color: '#f5f0e6' }}>
            {title}
          </div>
          <div className="text-[9px] truncate" style={{ color: 'rgba(196,181,253,0.85)' }}>
            {label} · drag · scroll to zoom
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}
