import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { APIProvider, Map as GoogleMap, AdvancedMarker } from '@vis.gl/react-google-maps';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { BASEMAP_ATTRIBUTION, BASEMAP_DARK_LABELS, BASEMAP_DARK_TILES, BASEMAP_MAX_ZOOM } from '@/domain/maps/basemap';
import { PlacesPanel, plaatsenUitData, type PlaatsKaart } from './PlacesPanel';

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

  const plaatsen = plaatsenUitData(payload.data);

  // Met gezochte plaatsen altijd MapLibre: daar staan de genummerde pins en de kaarten onder hoeven niet
  // te wachten op een Google-kaart-ID.
  if (hasGoogleJs && plaatsen.length === 0) {
    return <GoogleFlatMap key={`${lat},${lng}`} lat={lat} lng={lng} title={title} label={label} />;
  }
  return <MapLibreFlatMap key={`${lat},${lng},${plaatsen.length}`} lat={lat} lng={lng} title={title} label={label} plaatsen={plaatsen} />;
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
  lat, lng, title, label, plaatsen = [],
}: { lat: number; lng: number; title: string; label: string; plaatsen?: PlaatsKaart[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);

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
          basemap: { type: 'raster', tiles: BASEMAP_DARK_TILES, tileSize: 256, maxzoom: BASEMAP_MAX_ZOOM, attribution: BASEMAP_ATTRIBUTION },
          namen: { type: 'raster', tiles: BASEMAP_DARK_LABELS, tileSize: 256, maxzoom: BASEMAP_MAX_ZOOM },
        },
        layers: [
          { id: 'basemap-layer', type: 'raster', source: 'basemap', minzoom: 0 },
          { id: 'namen-layer', type: 'raster', source: 'namen', minzoom: 0 },
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

    // Onderin staan de kaarten van de gevonden plaatsen; de knoppen gaan dan naar boven.
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false, showCompass: true }),
      plaatsen.length ? 'top-right' : 'bottom-right',
    );
    if (!plaatsen.length) map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    const markerEl = document.createElement('div');
    markerEl.innerHTML =
      '<div style="width:16px;height:16px;border-radius:50%;background:#a78bfa;box-shadow:0 0 16px rgba(167,139,250,1);border:2px solid #fff;"></div>';
    new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map);

    // De gevonden plaatsen: genummerd zoals de kaarten eronder, een tik kiest de kaart.
    plaatsen.forEach((p, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', `${i + 1}. ${p.naam}`);
      el.textContent = String(i + 1);
      el.dataset.plaats = p.id;
      el.style.cssText = 'width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:#0b0d12;color:#fff;font:600 12px ui-monospace,monospace;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.6);';
      el.addEventListener('click', ev => { ev.stopPropagation(); setGekozen(p.id); });
      new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
    });
    if (plaatsen.length > 0) {
      const grens = new maplibregl.LngLatBounds([lng, lat], [lng, lat]);
      plaatsen.forEach(p => grens.extend([p.lng, p.lat]));
      map.fitBounds(grens, { padding: { top: 70, bottom: 190, left: 40, right: 40 }, maxZoom: 16, duration: 0 });
    }

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
  }, [lat, lng, plaatsen]);

  // Een gekozen kaart zet de kaart op die plek; de pin van de gekozen plaats is wit gevuld.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    container.querySelectorAll<HTMLElement>('[data-plaats]').forEach(el => {
      const aan = el.dataset.plaats === gekozen;
      el.style.background = aan ? '#fff' : '#0b0d12';
      el.style.color = aan ? '#0b0d12' : '#fff';
      el.style.zIndex = aan ? '5' : '';
    });
    const p = plaatsen.find(x => x.id === gekozen);
    if (p) map.easeTo({ center: [p.lng, p.lat], duration: 350 });
  }, [gekozen, plaatsen]);

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
      {plaatsen.length > 0 && <PlacesPanel plaatsen={plaatsen} gekozen={gekozen} opKies={setGekozen} />}
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
      className="axe-kaartkop absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-3 py-2 pointer-events-none"
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
