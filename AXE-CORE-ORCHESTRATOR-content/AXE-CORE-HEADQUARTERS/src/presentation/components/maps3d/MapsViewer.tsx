import React, { useEffect, useState, useRef } from "react";
import { APIProvider, Map, useMap, useMapsLibrary, AdvancedMarker } from "@vis.gl/react-google-maps";
import type { CityConfig, ChoicePoint } from "@/domain/maps3d/types";
import { SplashCard } from "./SplashCard";
import { D3HeatmapOverlay } from "./D3HeatmapOverlay";
import {
  RotateCw,
  Layers,
  Eye,
  Map as MapIcon,
  Compass,
  Navigation2,
  Sliders,
  Loader2,
  HelpCircle,
  Plus,
  Minus,
  User,
  Activity
} from "lucide-react";

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "your_api_key_here";

// Custom tactical dark map style for the "vector" mode
const TACTICAL_DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#050608" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }, { weight: 2 }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#74828f" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#00f0ff" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#00f0ff", opacity: 0.5 }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#091017" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#0a121c" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#122030" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#4f657a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#071c2e" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#00f0ff", weight: 1, opacity: 0.3 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#02070c" }] },
];

function TrafficOverlay({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!trafficLayerRef.current) trafficLayerRef.current = new google.maps.TrafficLayer();
    trafficLayerRef.current.setMap(enabled ? map : null);
    return () => { trafficLayerRef.current?.setMap(null); };
  }, [map, enabled]);

  return null;
}

function Maps3DInitializer() {
  useMapsLibrary("maps3d");
  return null;
}

interface CameraSynchronizerProps {
  zoom: number;
  heading: number;
  tilt: number;
  center: { lat: number; lng: number };
  setZoom: (z: number) => void;
  setHeading: (h: number) => void;
  setTilt: (t: number) => void;
  setCenter: (c: { lat: number; lng: number }) => void;
}

function CameraSynchronizer({ zoom, heading, tilt, center, setZoom, setHeading, setTilt, setCenter }: CameraSynchronizerProps) {
  const map = useMap();
  const zoomRef = useRef(zoom);
  const headingRef = useRef(heading);
  const tiltRef = useRef(tilt);
  const centerRef = useRef(center);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { headingRef.current = heading; }, [heading]);
  useEffect(() => { tiltRef.current = tilt; }, [tilt]);
  useEffect(() => { centerRef.current = center; }, [center]);

  useEffect(() => {
    if (!map) return;
    const headingListener = map.addListener("heading_changed", () => {
      const h = map.getHeading();
      if (h !== undefined && Math.round(h) !== Math.round(headingRef.current)) setHeading(h);
    });
    const tiltListener = map.addListener("tilt_changed", () => {
      const t = map.getTilt();
      if (t !== undefined && Math.round(t) !== Math.round(tiltRef.current)) setTilt(t);
    });
    const zoomListener = map.addListener("zoom_changed", () => {
      const z = map.getZoom();
      if (z !== undefined && z !== zoomRef.current) setZoom(z);
    });
    const centerListener = map.addListener("center_changed", () => {
      const c = map.getCenter();
      if (c) {
        const lat = c.lat(), lng = c.lng();
        if (Math.abs(lat - centerRef.current.lat) > 0.00001 || Math.abs(lng - centerRef.current.lng) > 0.00001) {
          setCenter({ lat, lng });
        }
      }
    });
    return () => {
      google.maps.event.removeListener(headingListener);
      google.maps.event.removeListener(tiltListener);
      google.maps.event.removeListener(zoomListener);
      google.maps.event.removeListener(centerListener);
    };
  }, [map, setZoom, setHeading, setTilt, setCenter]);

  useEffect(() => {
    if (!map) return;
    const currentZoom = map.getZoom();
    if (currentZoom !== undefined && currentZoom !== zoom) map.setZoom(zoom);
  }, [map, zoom]);

  useEffect(() => {
    if (!map) return;
    const currentHeading = map.getHeading();
    if (currentHeading !== undefined && Math.round(currentHeading) !== Math.round(heading)) map.setHeading(heading);
  }, [map, heading]);

  useEffect(() => {
    if (!map) return;
    const currentTilt = map.getTilt();
    if (currentTilt !== undefined && Math.round(currentTilt) !== Math.round(tilt)) map.setTilt(tilt);
  }, [map, tilt]);

  return null;
}

interface MapControllerProps {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  heading: number;
  setHeading: React.Dispatch<React.SetStateAction<number>>;
  tilt: number;
  setTilt: React.Dispatch<React.SetStateAction<number>>;
}

function MapController({ zoom, setZoom, heading, setHeading, tilt, setTilt }: MapControllerProps) {
  const map = useMap();

  const toggleStreetView = () => {
    if (!map) return;
    const sv = map.getStreetView();
    if (sv) {
      const isVisible = sv.getVisible();
      const center = map.getCenter();
      if (!isVisible && center) sv.setPosition(center);
      sv.setVisible(!isVisible);
    }
  };

  return (
    <div className="absolute right-4 bottom-16 z-10 flex flex-col gap-2 pointer-events-auto">
      <button onClick={() => setZoom((p) => Math.min(p + 1, 21))} className="w-10 h-10 bg-[#050608]/95 border border-cyan-500/40 hover:border-cyan-400 text-cyan-400 hover:text-white rounded-lg shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-95" title="Zoom In">
        <Plus className="w-5 h-5" />
      </button>
      <button onClick={() => setZoom((p) => Math.max(p - 1, 1))} className="w-10 h-10 bg-[#050608]/95 border border-cyan-500/40 hover:border-cyan-400 text-cyan-400 hover:text-white rounded-lg shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-95" title="Zoom Out">
        <Minus className="w-5 h-5" />
      </button>
      <button onClick={() => { setHeading(0); setTilt(45); }} className="w-10 h-10 bg-[#050608]/95 border border-cyan-500/40 hover:border-cyan-400 text-cyan-400 hover:text-white rounded-lg shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-95" title="Align Camera North">
        <Navigation2 className="w-5 h-5 transition-transform duration-200" style={{ transform: `rotate(${-heading}deg)` }} />
      </button>
      <button onClick={toggleStreetView} className="w-10 h-10 bg-[#050608]/95 border border-cyan-500/40 hover:border-cyan-400 text-cyan-400 hover:text-white rounded-lg shadow-lg flex items-center justify-center cursor-pointer transition-all active:scale-95" title="Toggle Street View">
        <User className="w-5 h-5" />
      </button>
    </div>
  );
}

interface MapsViewerProps {
  city: CityConfig;
  choicePoints: ChoicePoint[];
  onMapClick?: (coords: { lat: number; lng: number }) => void;
}

export function MapsViewer({ city, choicePoints, onMapClick }: MapsViewerProps) {
  const [mapMode, setMapMode] = useState<"satellite" | "vector" | "photorealistic">("satellite");
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [zoom, setZoom] = useState(15);
  const [tilt, setTilt] = useState(city.tilt);
  const [heading, setHeading] = useState(city.heading);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: city.lat, lng: city.lng });
  const [rotationActive, setRotationActive] = useState(false);
  const [customElementsReady, setCustomElementsReady] = useState(false);

  const rotationRef = useRef<number | null>(null);
  const map3DRef = useRef<any>(null);

  useEffect(() => {
    setTilt(city.tilt);
    setHeading(city.heading);
    setZoom(15);
    setMapCenter({ lat: city.lat, lng: city.lng });
  }, [city]);

  const handleMapClick = (e: any) => {
    let lat: number | null = null;
    let lng: number | null = null;
    if (e.detail?.latLng) {
      lat = typeof e.detail.latLng.lat === "function" ? e.detail.latLng.lat() : e.detail.latLng.lat;
      lng = typeof e.detail.latLng.lng === "function" ? e.detail.latLng.lng() : e.detail.latLng.lng;
    } else if (e.latLng) {
      lat = typeof e.latLng.lat === "function" ? e.latLng.lat() : e.latLng.lat;
      lng = typeof e.latLng.lng === "function" ? e.latLng.lng() : e.latLng.lng;
    }
    if (lat !== null && lng !== null) onMapClick?.({ lat, lng });
  };

  useEffect(() => {
    if (rotationActive) {
      const rotate = () => {
        setHeading((prev) => (prev + 0.3) % 360);
        rotationRef.current = requestAnimationFrame(rotate);
      };
      rotationRef.current = requestAnimationFrame(rotate);
    } else if (rotationRef.current) {
      cancelAnimationFrame(rotationRef.current);
    }
    return () => { if (rotationRef.current) cancelAnimationFrame(rotationRef.current); };
  }, [rotationActive]);

  useEffect(() => {
    if (!hasValidKey) return undefined;
    customElements.whenDefined("gmp-map-3d").then(() => setCustomElementsReady(true)).catch((err) => {
      console.warn("Could not load gmp-map-3d defined event:", err);
    });
    const timer = setTimeout(() => setCustomElementsReady(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = map3DRef.current;
    if (!el) return;
    try {
      el.setAttribute("center", `${city.lat},${city.lng},${city.altitude ?? 0}`);
      el.setAttribute("range", String(city.range ?? 1500));
      el.center = { lat: city.lat, lng: city.lng, altitude: city.altitude ?? 0 };
      el.range = city.range ?? 1500;
    } catch (e) {
      console.warn("Failed to update gmp-map-3d center/range:", e);
    }
  }, [city, customElementsReady]);

  useEffect(() => {
    const el = map3DRef.current;
    if (!el) return;
    try {
      el.heading = heading;
      el.tilt = tilt;
    } catch (e) {
      console.warn("Failed to update gmp-map-3d orientation:", e);
    }
  }, [heading, tilt]);

  if (!hasValidKey) return <SplashCard />;

  return (
    <APIProvider apiKey={API_KEY} version="weekly" libraries={["maps3d"]}>
      <div className="w-full h-full relative bg-[#050608] rounded-xl overflow-hidden border border-cyan-950/80 shadow-2xl flex flex-col font-sans">
        <Maps3DInitializer />

        <div className="absolute top-4 left-4 right-4 z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-[#050608]/95 border border-cyan-950 p-1 rounded-lg shadow-lg pointer-events-auto backdrop-blur-md">
            <button onClick={() => setMapMode("satellite")} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${mapMode === "satellite" ? "bg-cyan-500 text-black shadow-md" : "text-slate-400 hover:text-white"}`} title="Standard satellite hybrid (free-tier safe)">
              <Compass className="w-3.5 h-3.5" /> Satellite
            </button>
            <button onClick={() => setMapMode("vector")} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${mapMode === "vector" ? "bg-cyan-500 text-black shadow-md" : "text-slate-400 hover:text-white"}`} title="Tactical vector grid">
              <MapIcon className="w-3.5 h-3.5" /> Vector
            </button>
            <button onClick={() => setMapMode("photorealistic")} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-1 cursor-pointer ${mapMode === "photorealistic" ? "bg-cyan-500 text-black shadow-md" : "text-slate-400 hover:text-white"}`} title="High-fidelity photorealistic 3D globe (requires billed key + Map ID)">
              <Eye className="w-3.5 h-3.5" /> 3D Globe
            </button>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {mapMode !== "photorealistic" && (
              <button onClick={() => setHeatmapEnabled(!heatmapEnabled)} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border rounded-lg shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer ${heatmapEnabled ? "bg-cyan-950/40 border-emerald-500 text-emerald-400" : "bg-black/90 border-cyan-950/60 text-slate-400 hover:text-white"}`} title="Toggle D3.js activity density heatmap layer">
                <Activity className={`w-3.5 h-3.5 ${heatmapEnabled ? "animate-pulse" : ""}`} /> Heatmap: {heatmapEnabled ? "ON" : "OFF"}
              </button>
            )}
            {mapMode !== "photorealistic" && (
              <button onClick={() => setTrafficEnabled(!trafficEnabled)} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border rounded-lg shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer ${trafficEnabled ? "bg-cyan-950/40 border-cyan-500 text-cyan-400" : "bg-black/90 border-cyan-950/60 text-slate-400 hover:text-white"}`}>
                <Layers className={`w-3.5 h-3.5 ${trafficEnabled ? "animate-pulse" : ""}`} /> Traffic: {trafficEnabled ? "ON" : "OFF"}
              </button>
            )}
            <button onClick={() => setRotationActive(!rotationActive)} className={`px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border rounded-lg shadow-lg backdrop-blur-md flex items-center gap-1.5 transition-all cursor-pointer ${rotationActive ? "bg-cyan-950/40 border-cyan-500 text-cyan-400" : "bg-black/90 border-cyan-950/60 text-slate-400 hover:text-white"}`}>
              <RotateCw className={`w-3.5 h-3.5 ${rotationActive ? "animate-spin" : ""}`} /> Auto Orbit
            </button>
          </div>
        </div>

        <div className="flex-1 w-full h-full relative">
          {mapMode === "satellite" || mapMode === "vector" ? (
            <Map
              center={mapCenter}
              zoom={zoom}
              heading={heading}
              tilt={tilt}
              mapId={MAP_ID || undefined}
              mapTypeId={mapMode === "satellite" ? "hybrid" : undefined}
              styles={mapMode === "vector" ? TACTICAL_DARK_MAP_STYLE : undefined}
              gestureHandling="cooperative"
              disableDefaultUI={true}
              style={{ width: "100%", height: "100%" }}
              onClick={handleMapClick}
            >
              <TrafficOverlay enabled={trafficEnabled} />
              <D3HeatmapOverlay points={choicePoints} enabled={heatmapEnabled} />
              <CameraSynchronizer zoom={zoom} heading={heading} tilt={tilt} center={mapCenter} setZoom={setZoom} setHeading={setHeading} setTilt={setTilt} setCenter={setMapCenter} />
              <MapController zoom={zoom} setZoom={setZoom} heading={heading} setHeading={setHeading} tilt={tilt} setTilt={setTilt} />

              {choicePoints.map((point) => (
                <AdvancedMarker key={point.id} position={{ lat: point.lat, lng: point.lng }} title={point.label}>
                  <div className="relative flex items-center justify-center cursor-pointer group" style={{ width: "36px", height: "36px" }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: point.color }} />
                    <div className="w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center bg-[#050608]/90 transition-all duration-300 group-hover:scale-110 shadow-lg shadow-black/50" style={{ borderColor: point.color }}>
                      <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: point.color }} />
                    </div>
                    <div className="absolute -top-8 bg-[#030406]/95 border border-cyan-950/80 rounded px-2 py-0.5 text-[9px] font-mono font-bold text-white uppercase tracking-wider scale-0 group-hover:scale-100 transition-all origin-bottom whitespace-nowrap shadow-xl z-20 pointer-events-none">
                      {point.label}
                    </div>
                  </div>
                </AdvancedMarker>
              ))}
            </Map>
          ) : (
            <div className="w-full h-full relative bg-black flex items-center justify-center">
              <div className="absolute top-24 left-4 right-4 z-10 max-w-md bg-[#050608]/95 border border-amber-500/30 p-3.5 rounded-lg shadow-xl text-xs font-sans text-slate-300 pointer-events-auto backdrop-blur-md space-y-2">
                <div className="flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-400">Photorealistic 3D Globe</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed font-sans">
                      If the screen stays black, your Google Cloud project likely lacks a Map ID
                      (VITE_GOOGLE_MAPS_MAP_ID) or active billing — Photorealistic 3D Tiles require both.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1 justify-end">
                  <button onClick={() => setMapMode("satellite")} className="px-2.5 py-1 text-[10px] font-mono bg-cyan-950/40 hover:bg-cyan-900/40 text-cyan-400 rounded cursor-pointer transition-all border border-cyan-800">
                    Switch to Free Satellite Mode
                  </button>
                </div>
              </div>

              {customElementsReady ? (
                MAP_ID ? (
                  <gmp-map-3d
                    ref={map3DRef}
                    center={`${city.lat},${city.lng},${city.altitude}`}
                    heading={heading}
                    tilt={tilt}
                    range={city.range}
                    mode="HYBRID"
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center space-y-3 px-4">
                    <HelpCircle className="w-8 h-8 text-amber-500" />
                    <p className="text-xs font-mono text-slate-400">No VITE_GOOGLE_MAPS_MAP_ID configured — the 3D globe can't render without one.</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                  <p className="text-xs font-mono text-slate-400">Booting Photorealistic 3D Globe engine...</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#030406] border-t border-cyan-950/80 p-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400 uppercase tracking-wider font-bold">Camera Orientation Control</span>
          </div>
          <div className="flex items-center gap-6 flex-1 max-w-lg justify-end">
            <div className="flex items-center gap-2.5 flex-1 max-w-[200px]">
              <span className="text-slate-500 text-[10px]">TILT</span>
              <input type="range" min="0" max="75" value={tilt} onChange={(e) => setTilt(parseInt(e.target.value))} className="flex-1 accent-cyan-400 bg-cyan-950/40 h-1 rounded cursor-pointer" />
              <span className="text-cyan-400 w-8 text-right text-[11px] font-bold">{tilt}°</span>
            </div>
            <div className="flex items-center gap-2.5 flex-1 max-w-[200px]">
              <span className="text-slate-500 text-[10px]">HEADING</span>
              <input type="range" min="0" max="359" value={Math.round(heading)} onChange={(e) => setHeading(parseInt(e.target.value))} className="flex-1 accent-cyan-400 bg-cyan-950/40 h-1 rounded cursor-pointer" />
              <span className="text-cyan-400 w-8 text-right text-[11px] font-bold">{Math.round(heading)}°</span>
            </div>
          </div>
        </div>
      </div>
    </APIProvider>
  );
}
export default MapsViewer;
