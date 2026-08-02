import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { APIProvider, Map as GoogleMap, AdvancedMarker } from '@vis.gl/react-google-maps';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';
const GOOGLE_MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() ?? '';
const hasGoogleJs = Boolean(GOOGLE_KEY) && GOOGLE_KEY !== 'your_api_key_here';

/**
 * Interactive map for the Home sphere portal.
 * Google Maps JS 2D when key is present (greedy scroll zoom).
 * Else MapLibre + Carto (no key).
 *
 * Photorealistic 3D (gmp-map-3d / Map Tiles API) is a *different* product:
 * needs Map Tiles API + billing, and is restricted / unavailable for many
 * EEA billing accounts since July 2025 — that is why key + Map ID alone
 * do not make the 3D globe work.
 */
export function InteractiveMapProjection({ payload }: { payload: ProjectionPayload }) {
  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');
  const title = String(payload.title ?? 'Map');

  if (hasGoogleJs) {
    return <GoogleFlatMap key={`${lat},${lng}`} lat={lat} lng={lng} title={title} label={label} />;
  }
  return <MapLibreFlatMap key={`${lat},${lng}`} lat={lat} lng={lng} title={title} label={label} />;
}

function GoogleFlatMap({
  lat, lng, title, label,
}: { lat: number; lng: number; title: string; label: string }) {
  return (
    <div
      className="h-full w-full relative overflow-hidden"
      style={{ minHeight: 320, height: '100%', touchAction: 'none' }}
      onWheel={(e) => e.stopPropagation()}
    >
      <APIProvider apiKey={GOOGLE_KEY}>
        <GoogleMap
          style={{ width: '100%', height: '100%' }}
          defaultCenter={{ lat, lng }}
          defaultZoom={13}
          // Do NOT pass controlled `center`/`zoom` — that fights user pan/zoom
          mapId={GOOGLE_MAP_ID || undefined}
          gestureHandling="greedy"
          disableDefaultUI={false}
          zoomControl
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          keyboardShortcuts
        >
          {GOOGLE_MAP_ID ? (
            <AdvancedMarker position={{ lat, lng }} title={title} />
          ) : null}
        </GoogleMap>
      </APIProvider>

      <MapChrome title={title} label={label} engine="Google Maps" />
    </div>
  );
}

function MapLibreFlatMap({
  lat, lng, title, label,
}: { lat: number; lng: number; title: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (mapRef.current) {
      try { mapRef.current.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          basemap: {
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
      zoom: 13,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      cooperativeGestures: false,
      dragPan: true,
      dragRotate: false,
      scrollZoom: true,
      boxZoom: true,
      doubleClickZoom: true,
      touchZoomRotate: true,
      keyboard: true,
    });
    mapRef.current = map;

    try {
      // Snappier wheel zoom around cursor
      map.scrollZoom.setWheelZoomRate(1 / 60);
      map.scrollZoom.setZoomRate(1 / 60);
    } catch { /* ignore */ }

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false, showCompass: true }),
      'bottom-right',
    );
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const markerEl = document.createElement('div');
    markerEl.innerHTML =
      '<div style="width:16px;height:16px;border-radius:50%;background:#a78bfa;box-shadow:0 0 16px rgba(167,139,250,1);border:2px solid #fff;"></div>';
    new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);

    const resize = () => {
      try { map.resize(); } catch { /* ignore */ }
    };

    map.on('load', () => {
      resize();
      requestAnimationFrame(resize);
      setTimeout(resize, 80);
      setTimeout(resize, 250);
    });

    const stopWheel = (e: WheelEvent) => e.stopPropagation();
    const stopTouch = (e: TouchEvent) => e.stopPropagation();
    container.addEventListener('wheel', stopWheel, { passive: true });
    container.addEventListener('touchmove', stopTouch, { passive: true });

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    return () => {
      container.removeEventListener('wheel', stopWheel);
      container.removeEventListener('touchmove', stopTouch);
      ro.disconnect();
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
    };
  }, [lat, lng]);

  return (
    <div
      className="h-full w-full relative overflow-hidden"
      style={{ minHeight: 320, height: '100%', touchAction: 'none' }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%', minHeight: 320, cursor: 'grab' }}
      />
      <MapChrome title={title} label={label} engine="MapLibre" />
    </div>
  );
}

function MapChrome({
  title,
  label,
  engine,
}: { title: string; label: string; engine: string }) {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-3 py-2 pointer-events-none"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.82), transparent)' }}
    >
      <div className="min-w-0">
        <div className="text-[14px] font-semibold truncate" style={{ color: '#f5f0e6' }}>
          {title}
        </div>
        <div className="text-[10px] truncate" style={{ color: 'rgba(196,181,253,0.9)' }}>
          {label} · sleep · scroll zoom · {engine}
        </div>
      </div>
    </div>
  );
}
