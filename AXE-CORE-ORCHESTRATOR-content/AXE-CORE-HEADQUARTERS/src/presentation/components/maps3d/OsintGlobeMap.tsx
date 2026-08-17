/**
 * OsintGlobeMap — keyless replacement for the old Google-Maps-3D-key-gated
 * MapsViewer: MapLibre GL JS (open source, no key ever) with a dark/satellite
 * raster base, a real 3D globe projection, and real terrain elevation (AWS
 * terrain-RGB tiles) — all free, all keyless.
 *
 * Every marker layer here is sourced from a real feed (AXE Core's own VPS
 * /osint/all, Trading OS's shared intel-proxy edge function) or real static
 * reference data (nuclear sites, chokepoints, submarine cable landings).
 * A layer that fails to fetch or has nothing to show renders NOTHING —
 * never a placeholder point. Same contract as osint.ts's fetchUnifiedOsint().
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CityConfig, ChoicePoint } from '@/domain/maps3d/types';
import { fetchUnifiedOsint, type LiveOsintPoint } from '@/infrastructure/gateways/osint';
import {
  fetchConflictEvents, fetchWeatherAlerts, fetchHealthAlerts, fetchCorporateJets, fetchVessels,
  type MapPoint, type JetPoint, type VesselPoint,
} from '@/infrastructure/gateways/intelProxyGateway';
import { NUCLEAR_SITES } from '@/domain/maps/nuclearSites';
import { CHOKEPOINTS } from '@/domain/maps/chokepoints';
import { SUBMARINE_CABLES } from '@/domain/maps/submarineCables';
import { nightHemisphereRing } from '@/domain/maps/dayNightTerminator';
import {
  Layers, Globe2, Mountain, Sun, RotateCw, Compass, Satellite,
} from 'lucide-react';

const TILE_DARK = ['a', 'b', 'c', 'd'].map(s => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`);
const TILE_SAT = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
const TERRAIN_DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];

function buildStyle(basemap: 'dark' | 'satellite'): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: basemap === 'satellite' ? TILE_SAT : TILE_DARK,
        tileSize: 256,
        attribution: basemap === 'satellite'
          ? 'Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics'
          : '&copy; OpenStreetMap &copy; CARTO',
      },
      'terrain-dem': {
        type: 'raster-dem',
        tiles: TERRAIN_DEM_TILES,
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
      },
    },
    layers: [{ id: 'base-layer', type: 'raster', source: 'base', minzoom: 0, maxzoom: 22 }],
  };
}

type LayerKey =
  | 'quakes' | 'flights' | 'vesselsVps' | 'news' | 'disasters' | 'threats'
  | 'conflict' | 'weather' | 'health' | 'jets' | 'vesselsAis'
  | 'nuclear' | 'chokepoints' | 'cables' | 'terminator';

interface LayerDef { key: LayerKey; label: string; defaultOn: boolean; }

const LAYER_DEFS: LayerDef[] = [
  { key: 'quakes', label: 'Earthquakes (USGS)', defaultOn: true },
  { key: 'jets', label: 'Corporate jets (named owners)', defaultOn: true },
  { key: 'flights', label: 'Flights, generic (ADS-B)', defaultOn: false },
  { key: 'vesselsAis', label: 'Vessels (AIS)', defaultOn: false },
  { key: 'vesselsVps', label: 'Vessels, generic', defaultOn: false },
  { key: 'conflict', label: 'War zones / conflict (GDELT)', defaultOn: true },
  { key: 'threats', label: 'Threat intel', defaultOn: false },
  { key: 'disasters', label: 'Fires / thermal (VIIRS)', defaultOn: false },
  { key: 'weather', label: 'Severe weather (NOAA)', defaultOn: false },
  { key: 'health', label: 'Health outbreaks (WHO)', defaultOn: false },
  { key: 'news', label: 'News (GDELT)', defaultOn: false },
  { key: 'nuclear', label: 'Nuclear sites', defaultOn: true },
  { key: 'chokepoints', label: 'Maritime chokepoints', defaultOn: true },
  { key: 'cables', label: 'Submarine cables', defaultOn: false },
  { key: 'terminator', label: 'Day / night', defaultOn: true },
];

const KIND_STYLE: Record<string, { emoji: string; color: string }> = {
  quake: { emoji: '🔴', color: '#ef4444' },
  flight: { emoji: '✈️', color: '#f59e0b' },
  vessel: { emoji: '🚢', color: '#22d3ee' },
  news: { emoji: '📰', color: '#94a3b8' },
  disaster: { emoji: '🔥', color: '#f97316' },
  threat: { emoji: '⚠️', color: '#eab308' },
  conflict: { emoji: '💥', color: '#ef4444' },
  weather: { emoji: '⛈️', color: '#3b82f6' },
  health: { emoji: '🏥', color: '#ec4899' },
  jet: { emoji: '🛩️', color: '#fbbf24' },
  nuclear: { emoji: '☢️', color: '#6ee7b7' },
  chokepoint: { emoji: '⭑', color: '#fbbf24' },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function markerEl(kind: string, size = 26): HTMLDivElement {
  const s = KIND_STYLE[kind] ?? { emoji: '◆', color: '#8b5cf6' };
  const el = document.createElement('div');
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:rgba(3,4,6,0.85);border:1.5px solid ${s.color};box-shadow:0 0 8px ${s.color}88;display:flex;align-items:center;justify-content:center;font-size:${size * 0.55}px;line-height:1;cursor:pointer`;
  el.textContent = s.emoji;
  return el;
}

function popupHtml(title: string, rows: [string, string][]): string {
  const body = rows.map(([k, v]) => `<tr><td style="opacity:.5;font-size:9px;text-transform:uppercase;padding:2px 8px 2px 0">${escapeHtml(k)}</td><td style="font-size:11px;color:#e8edf5;padding:2px 0">${escapeHtml(v)}</td></tr>`).join('');
  return `<div style="min-width:180px;font-family:ui-monospace,Menlo,monospace"><div style="font-weight:600;font-size:12px;margin-bottom:6px;color:#f8fafc">${escapeHtml(title)}</div><table>${body}</table></div>`;
}

interface OsintGlobeMapProps {
  city: CityConfig;
  choicePoints: ChoicePoint[];
  onMapClick?: (coords: { lat: number; lng: number }) => void;
}

export function OsintGlobeMap({ city, choicePoints, onMapClick }: OsintGlobeMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<LayerKey, maplibregl.Marker[]>>(new Map());
  const choiceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState<'dark' | 'satellite'>('dark');
  const [globe, setGlobe] = useState(true);
  const [terrainOn, setTerrainOn] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(true);
  const [enabledLayers, setEnabledLayers] = useState<Set<LayerKey>>(
    () => new Set(LAYER_DEFS.filter(l => l.defaultOn).map(l => l.key)),
  );
  const [counts, setCounts] = useState<Partial<Record<LayerKey, number>>>({});
  const orbitRef = useRef<number | null>(null);

  const toggleLayer = useCallback((key: LayerKey) => {
    setEnabledLayers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Map init (once) ────────────────────────────────────────────────────
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const map = new maplibregl.Map({
      container: el,
      style: buildStyle('dark'),
      center: [city.lng, city.lat],
      zoom: 3,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', () => setReady(true));
    map.on('click', (e) => {
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest('.maplibregl-marker')) return;
      onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Basemap swap (skips the mount run — the map is already built with
  // the initial basemap, so re-calling setStyle then would race the
  // in-flight first load and throw "Style is not done loading.") ─────────
  const basemapMounted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!basemapMounted.current) { basemapMounted.current = true; return; }
    map.setStyle(buildStyle(basemap));
    map.once('style.load', () => {
      if (globe) map.setProjection({ type: 'globe' });
      if (terrainOn) map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, ready]);

  // ── Globe projection toggle ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.isStyleLoaded()) return;
    map.setProjection({ type: globe ? 'globe' : 'mercator' });
  }, [globe, ready]);

  // ── Terrain toggle ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.isStyleLoaded()) return;
    map.setTerrain(terrainOn ? { source: 'terrain-dem', exaggeration: 1.5 } : null);
  }, [terrainOn, ready]);

  // ── Fly to selected city ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.flyTo({ center: [city.lng, city.lat], zoom: 5, essential: true });
  }, [city, ready]);

  // ── Auto orbit ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (autoOrbit) {
      const spin = () => {
        map.setBearing((map.getBearing() + 0.15) % 360);
        orbitRef.current = requestAnimationFrame(spin);
      };
      orbitRef.current = requestAnimationFrame(spin);
    } else if (orbitRef.current) {
      cancelAnimationFrame(orbitRef.current);
    }
    return () => { if (orbitRef.current) cancelAnimationFrame(orbitRef.current); };
  }, [autoOrbit]);

  // ── Day/night terminator layer ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    const SRC = 'terminator-src', LYR = 'terminator-fill';
    const render = () => {
      const ring = nightHemisphereRing(new Date());
      const geojson: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) { src.setData(geojson); return; }
      map.addSource(SRC, { type: 'geojson', data: geojson });
      map.addLayer({ id: LYR, type: 'fill', source: SRC, paint: { 'fill-color': '#000010', 'fill-opacity': 0.35 } });
    };
    const setVisible = (on: boolean) => {
      if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', on ? 'visible' : 'none');
    };
    if (enabledLayers.has('terminator')) { render(); setVisible(true); } else { setVisible(false); }
    const t = setInterval(() => { if (enabledLayers.has('terminator')) render(); }, 60_000);
    return () => clearInterval(t);
  }, [ready, enabledLayers]);

  // ── Submarine cable line layer ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const SRC = 'cables-src', LYR = 'cables-line';
    const on = enabledLayers.has('cables');
    if (!map.getSource(SRC)) {
      const features: GeoJSON.Feature[] = SUBMARINE_CABLES.map(c => ({
        type: 'Feature',
        properties: { name: c.name, note: c.note },
        geometry: { type: 'LineString', coordinates: c.landings.map(([, lat, lon]) => [lon, lat]) },
      }));
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({ id: LYR, type: 'line', source: SRC, paint: { 'line-color': '#22d3ee', 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [2, 2] } });
      map.on('click', LYR, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(String(f.properties?.name ?? 'Cable'), [['Route', String(f.properties?.note ?? '—')], ['Precision', 'Approximate — straight line between real landing points']]))
          .addTo(map);
      });
    }
    if (map.getLayer(LYR)) map.setLayoutProperty(LYR, 'visibility', on ? 'visible' : 'none');
  }, [ready, enabledLayers]);

  // ── Static marker layers (nuclear, chokepoints) ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;

    const place = (key: LayerKey, lat: number, lon: number, kind: string, title: string, rows: [string, string][], size = 26) => {
      const el = markerEl(kind, size);
      const popup = new maplibregl.Popup({ closeButton: true }).setHTML(popupHtml(title, rows));
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lon, lat]).setPopup(popup).addTo(map);
      const arr = markersRef.current.get(key) ?? [];
      arr.push(marker);
      markersRef.current.set(key, arr);
    };

    const clear = (key: LayerKey) => {
      for (const m of markersRef.current.get(key) ?? []) m.remove();
      markersRef.current.set(key, []);
    };

    clear('nuclear');
    if (enabledLayers.has('nuclear')) {
      for (const s of NUCLEAR_SITES) place('nuclear', s.lat, s.lon, 'nuclear', s.name, [['Country', s.country], ['Type', s.type], ['Source', 'IAEA / public']]);
    }
    setCounts(c => ({ ...c, nuclear: NUCLEAR_SITES.length }));

    clear('chokepoints');
    if (enabledLayers.has('chokepoints')) {
      for (const c of CHOKEPOINTS) place('chokepoints', c.lat, c.lon, 'chokepoint', c.name, [['Region', c.region], ['Note', c.note]], 20);
    }
    setCounts(c => ({ ...c, chokepoints: CHOKEPOINTS.length }));

    return () => { clear('nuclear'); clear('chokepoints'); };
  }, [ready, enabledLayers]);

  // ── Choice points (tactical waypoints) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    for (const m of choiceMarkersRef.current) m.remove();
    choiceMarkersRef.current = [];
    for (const p of choicePoints) {
      const el = document.createElement('div');
      el.style.cssText = `width:22px;height:22px;border-radius:50%;border:2px dashed ${p.color};background:rgba(3,4,6,0.9);display:flex;align-items:center;justify-content:center`;
      const dot = document.createElement('div');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${p.color}`;
      el.appendChild(dot);
      const popup = new maplibregl.Popup({ closeButton: true }).setHTML(popupHtml(p.label, [['Type', p.type], ['Note', p.description ?? '—']]));
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).setPopup(popup).addTo(map);
      choiceMarkersRef.current.push(marker);
    }
    return () => { for (const m of choiceMarkersRef.current) m.remove(); };
  }, [ready, choicePoints]);

  // ── Live data layers: VPS unified OSINT + Trading OS intel-proxy ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    let cancelled = false;

    const clear = (key: LayerKey) => {
      for (const m of markersRef.current.get(key) ?? []) m.remove();
      markersRef.current.set(key, []);
    };

    const placePoint = (key: LayerKey, kind: string, lat: number, lon: number, title: string, rows: [string, string][], size?: number) => {
      const el = markerEl(kind, size);
      const popup = new maplibregl.Popup({ closeButton: true }).setHTML(popupHtml(title, rows));
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lon, lat]).setPopup(popup).addTo(map);
      const arr = markersRef.current.get(key) ?? [];
      arr.push(marker);
      markersRef.current.set(key, arr);
    };

    const wantVps = enabledLayers.has('quakes') || enabledLayers.has('flights') || enabledLayers.has('vesselsVps')
      || enabledLayers.has('news') || enabledLayers.has('disasters') || enabledLayers.has('threats');
    const vpsKindToLayer: Record<string, LayerKey> = {
      quake: 'quakes', flight: 'flights', news: 'news', disaster: 'disasters', threat: 'threats', intel: 'threats',
    };

    const load = async () => {
      if (wantVps) {
        const r = await fetchUnifiedOsint();
        if (cancelled) return;
        for (const key of ['quakes', 'flights', 'vesselsVps', 'news', 'disasters', 'threats'] as LayerKey[]) clear(key);
        const byLayer: Partial<Record<LayerKey, number>> = {};
        for (const p of r.points as LiveOsintPoint[]) {
          const layerKey = p.kind === 'intel' && typeof p.magnitude !== 'number' ? 'threats' : (vpsKindToLayer[p.kind] ?? 'vesselsVps');
          if (!enabledLayers.has(layerKey)) continue;
          byLayer[layerKey] = (byLayer[layerKey] ?? 0) + 1;
          const size = p.kind === 'quake' && p.magnitude ? Math.max(16, Math.min(38, 10 + p.magnitude * 4)) : 24;
          placePoint(layerKey, p.kind, p.lat, p.lon, p.title, [
            ['Source', p.source],
            ...(p.magnitude != null ? [['Magnitude', String(p.magnitude)] as [string, string]] : []),
            ...(p.detail ? [['Detail', p.detail] as [string, string]] : []),
          ], size);
        }
        if (!cancelled) setCounts(c => ({ ...c, ...byLayer }));
      }

      const jobs: Array<Promise<void>> = [];
      if (enabledLayers.has('conflict')) jobs.push(fetchConflictEvents().then(pts => { if (cancelled) return; clear('conflict'); for (const p of pts) placePoint('conflict', 'conflict', p.lat, p.lon, p.label, [['Source', p.source], ...(p.detail ? [['Region', p.detail] as [string, string]] : [])]); setCounts(c => ({ ...c, conflict: pts.length })); }));
      if (enabledLayers.has('weather')) jobs.push(fetchWeatherAlerts().then(pts => { if (cancelled) return; clear('weather'); for (const p of pts) placePoint('weather', 'weather', p.lat, p.lon, p.label, [['Source', p.source], ...(p.detail ? [['Area', p.detail] as [string, string]] : [])]); setCounts(c => ({ ...c, weather: pts.length })); }));
      if (enabledLayers.has('health')) jobs.push(fetchHealthAlerts().then(pts => { if (cancelled) return; clear('health'); for (const p of pts) placePoint('health', 'health', p.lat, p.lon, p.label, [['Source', p.source], ...(p.detail ? [['Country', p.detail] as [string, string]] : [])]); setCounts(c => ({ ...c, health: pts.length })); }));
      if (enabledLayers.has('jets')) jobs.push(fetchCorporateJets().then((pts: JetPoint[]) => { if (cancelled) return; clear('jets'); for (const p of pts.slice(0, 80)) placePoint('jets', 'jet', p.lat, p.lon, p.operator, [['Aircraft', p.detail ?? '—'], ['Altitude', `${p.altitude} ft`], ['Speed', `${p.speed} kt`]]); setCounts(c => ({ ...c, jets: pts.length })); }));
      if (enabledLayers.has('vesselsAis')) jobs.push(fetchVessels().then((pts: VesselPoint[]) => { if (cancelled) return; clear('vesselsAis'); for (const p of pts.slice(0, 100)) placePoint('vesselsAis', 'vessel', p.lat, p.lon, p.label, [['MMSI', p.mmsi || '—'], ...(p.detail ? [['Type', p.detail] as [string, string]] : [])], 20); setCounts(c => ({ ...c, vesselsAis: pts.length })); }));

      for (const key of (['conflict', 'weather', 'health', 'jets', 'vesselsAis'] as LayerKey[])) {
        if (!enabledLayers.has(key)) clear(key);
      }

      await Promise.allSettled(jobs);
    };

    void load();
    const t = setInterval(load, 90_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [ready, enabledLayers]);

  return (
    <div className="w-full h-full relative bg-[#050608] rounded-xl overflow-hidden border border-cyan-950/80 shadow-2xl">
      <div ref={hostRef} className="w-full h-full" />

      <div className="absolute top-4 left-4 z-10 flex flex-col md:flex-row items-start gap-2.5 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-[#050608]/95 border border-cyan-950 p-1 rounded-lg shadow-lg pointer-events-auto backdrop-blur-md">
          <button onClick={() => setBasemap('dark')} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${basemap === 'dark' ? 'bg-cyan-500 text-black shadow-md' : 'text-slate-400 hover:text-white'}`}>
            <Compass className="w-3.5 h-3.5" /> Dark
          </button>
          <button onClick={() => setBasemap('satellite')} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${basemap === 'satellite' ? 'bg-cyan-500 text-black shadow-md' : 'text-slate-400 hover:text-white'}`}>
            <Satellite className="w-3.5 h-3.5" /> Satellite
          </button>
          <button onClick={() => setGlobe(g => !g)} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${globe ? 'bg-cyan-500 text-black shadow-md' : 'text-slate-400 hover:text-white'}`} title="Real 3D globe projection (MapLibre, keyless)">
            <Globe2 className="w-3.5 h-3.5" /> Globe
          </button>
          <button onClick={() => setTerrainOn(t => !t)} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${terrainOn ? 'bg-cyan-500 text-black shadow-md' : 'text-slate-400 hover:text-white'}`} title="Real elevation terrain (AWS terrain-RGB, keyless) — tilt the camera to see it">
            <Mountain className="w-3.5 h-3.5" /> Terrain
          </button>
          <button onClick={() => setAutoOrbit(o => !o)} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${autoOrbit ? 'bg-cyan-500 text-black shadow-md' : 'text-slate-400 hover:text-white'}`}>
            <RotateCw className={`w-3.5 h-3.5 ${autoOrbit ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 pointer-events-auto">
        <button onClick={() => setShowLayerPanel(v => !v)} className="mb-2 ml-auto flex px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-[#050608]/95 border border-cyan-950 text-cyan-400 rounded-lg shadow-lg items-center gap-1.5 cursor-pointer">
          <Layers className="w-3.5 h-3.5" /> Layers
        </button>
        {showLayerPanel && (
          <div className="bg-[#050608]/95 border border-cyan-950 rounded-lg shadow-lg p-2 w-64 max-h-[60vh] overflow-y-auto backdrop-blur-md">
            {LAYER_DEFS.map(l => (
              <label key={l.key} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-cyan-950/20 cursor-pointer text-[10px] font-mono">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={enabledLayers.has(l.key)} onChange={() => toggleLayer(l.key)} className="accent-cyan-400" />
                  <span className="text-slate-300">{l.label}</span>
                </span>
                <span className="text-slate-500">{counts[l.key] != null ? counts[l.key] : ''}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 bg-[#050608]/90 border border-cyan-950/60 px-2.5 py-1 rounded text-[9px] font-mono text-slate-500 pointer-events-none">
        <Sun className="w-3 h-3 text-amber-400" /> Zero fabricated data — every marker is a real feed or real static reference
      </div>
    </div>
  );
}

export default OsintGlobeMap;
