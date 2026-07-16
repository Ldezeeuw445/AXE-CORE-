import React, { useState, useEffect, useCallback, useRef } from "react";
import { CityConfig, OSINTEvent, OverlayType, SectorType, FleetAsset } from "@/lib/maps3d/types";
import { FEATURED_CITIES } from "@/lib/maps3d/constants";
import { getIntelligenceForCity } from "@/lib/maps3d/intelApi";
import { useGoogleMaps3D } from "@/lib/maps3d/useGoogleMaps3D";
import { playHoverSound, playSelectSound, playPingSound, playAlertSound } from "@/lib/maps3d/audio";
import { ALL_FLEET_ASSETS, simulateAssetsMovement, getSectorCount, SECTOR_LABELS } from "@/lib/maps3d/fleetData";
import SectorToggleBar from "./SectorToggleBar";

import { CitySelector } from "./CitySelector";
import { ChoicePointsPanel } from "./ChoicePointsPanel";
import { QDENTPanel } from "./QDENTPanel";
import { SeismicPanel } from "./SeismicPanel";
import { WeatherWidget } from "./WeatherWidget";
import { EventFeed } from "./EventFeed";
import { D3HeatmapOverlay } from "./D3HeatmapOverlay";
import { D3PatrolRouteOverlay } from "./D3PatrolRouteOverlay";
import { D3RiskHeatmapOverlay } from "./D3RiskHeatmapOverlay";
import { D3TimelineChart } from "./D3TimelineChart";
import { exportMapToCanvas } from "@/lib/maps3d/exportMap";
import { queryOllama, isOllamaAvailable } from "@/lib/maps3d/ollamaApi";

import {
  Globe, Crosshair, Zap, Eye, Layers, BarChart3, Cpu, Activity,
  CloudRain, Route, Siren, RefreshCw, Satellite, ChevronLeft, ChevronRight,
  Camera, Volume2, VolumeX, Keyboard, HelpCircle, Radio, Thermometer,
  AlertTriangle, MapPin, X, Sparkles, Ship, Plane, Flame, Radiation, Server, Shield, TreePine,
  Filter, Navigation, Anchor, Wind, Target, Database, Building2, Map,
} from "lucide-react";

const SECTOR_COLORS: Record<SectorType, string> = {
  maritime: "#22d3ee",
  aviation: "#38bdf8",
  seismic: "#f59e0b",
  chokepoints: "#fb923c",
  nuclear: "#34d399",
  data_centers: "#a78bfa",
  war_zones: "#fb7185",
  environment: "#2dd4bf",
};

const SECTOR_ICON_MAP: Record<SectorType, React.ElementType> = {
  maritime: Ship,
  aviation: Plane,
  seismic: Flame,
  chokepoints: AlertTriangle,
  nuclear: Radiation,
  data_centers: Server,
  war_zones: Shield,
  environment: TreePine,
};

export default function OSINTPanel() {
  const [selectedCity, setSelectedCity] = useState<CityConfig>(FEATURED_CITIES[0]);
  const [events, setEvents] = useState<OSINTEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<"waypoints" | "seismic" | "qdent" | "weather" | null>(null);
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayType>>(new Set());
  const [showSplash, setShowSplash] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"live" | "fleet" | "analytics" | "terminal">("live");
  const [selectedEvent, setSelectedEvent] = useState<OSINTEvent | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<FleetAsset | null>(null);
  const [analystQuery, setAnalystQuery] = useState("");
  const [analystResponse, setAnalystResponse] = useState("");
  const [analystLoading, setAnalystLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [activeSectors, setActiveSectors] = useState<Set<SectorType>>(new Set(ALL_FLEET_ASSETS.map(a => a.sector)));
  const [fleetAssets, setFleetAssets] = useState<FleetAsset[]>(ALL_FLEET_ASSETS);
  const [fleetFilter, setFleetFilter] = useState<SectorType | "all">("all");

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const fleetMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const overlaysContainerRef = useRef<HTMLDivElement>(null);

  const { isLoaded, error: mapError } = useGoogleMaps3D();

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapRef.current) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: selectedCity.lat, lng: selectedCity.lng },
      zoom: selectedCity.zoom ?? 12,
      mapId: "osint-3d-map",
      heading: 25,
      tilt: 47.5,
      mapTypeId: "hybrid" as any,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      keyboardShortcuts: false,
      styles: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
    });

    mapRef.current = map;
  }, [isLoaded]);

  // City change handler
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter({ lat: selectedCity.lat, lng: selectedCity.lng });
    mapRef.current.setZoom(selectedCity.zoom ?? 12);
  }, [selectedCity]);

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setEvents([]);
    try {
      const newEvents = await getIntelligenceForCity(selectedCity);
      setEvents(newEvents);
      if (isSoundEnabled) playPingSound();
    } catch (e) {
      console.error(e);
      if (isSoundEnabled) playAlertSound();
    } finally {
      setLoading(false);
    }
  }, [selectedCity, isSoundEnabled]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Simulate fleet movement
  useEffect(() => {
    const interval = setInterval(() => {
      setFleetAssets((prev) => simulateAssetsMovement(prev));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Render event markers
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    if (!google.maps.marker?.AdvancedMarkerElement) return;

    events.forEach((evt) => {
      const el = document.createElement("div");
      el.className = `w-3 h-3 rounded-full shadow-lg animate-pulse ${
        evt.severity === "critical"
          ? "bg-rose-500"
          : evt.severity === "warning"
          ? "bg-amber-500"
          : "bg-cyan-400"
      }`;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: evt.coordinates.lat, lng: evt.coordinates.lng },
        map: mapRef.current,
        content: el,
        title: evt.title,
      });

      marker.addEventListener("gmp-click", () => {
        setSelectedEvent(evt);
        if (isSoundEnabled) playSelectSound();
      });

      markersRef.current.push(marker);
    });
  }, [events, isLoaded, isSoundEnabled]);

  // Render fleet markers
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    fleetMarkersRef.current.forEach((m) => (m.map = null));
    fleetMarkersRef.current = [];

    if (!google.maps.marker?.AdvancedMarkerElement) return;

    const visibleAssets = fleetAssets.filter((a) => activeSectors.has(a.sector));

    visibleAssets.forEach((asset) => {
      const el = document.createElement("div");
      const color = SECTOR_COLORS[asset.sector];
      const isMoving = asset.type === "jet" || asset.type === "vessel";
      const pulseClass = isMoving && asset.speed !== undefined && asset.speed > 0 ? "animate-pulse" : "";
      const shape = isMoving ? "rounded-full" : "rounded-sm";

      el.className = `w-2.5 h-2.5 ${shape} shadow-lg border border-white/30 ${pulseClass}`;
      el.style.backgroundColor = color;
      el.style.boxShadow = `0 0 6px ${color}80`;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: asset.lat, lng: asset.lng },
        map: mapRef.current,
        content: el,
        title: `${asset.name} (${asset.label})`,
      });

      marker.addEventListener("gmp-click", () => {
        setSelectedAsset(asset);
        if (isSoundEnabled) playSelectSound();
      });

      fleetMarkersRef.current.push(marker);
    });
  }, [fleetAssets, activeSectors, isLoaded, isSoundEnabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      const num = parseInt(key, 10);
      if (!isNaN(num) && num >= 1 && num <= 8) {
        const sectors: SectorType[] = ["maritime", "aviation", "seismic", "chokepoints", "nuclear", "data_centers", "war_zones", "environment"];
        const sector = sectors[num - 1];
        if (sector) {
          toggleSector(sector);
        }
        return;
      }

      switch (key) {
        case "h":
        case "H":
          setActiveOverlays((prev) => {
            const next = new Set(prev);
            if (next.has("heatmap")) next.delete("heatmap");
            else next.add("heatmap");
            return next;
          });
          break;
        case "r":
        case "R":
          fetchEvents();
          break;
        case "m":
        case "M":
          setIsSoundEnabled((prev) => !prev);
          break;
        case "?":
          setShowShortcuts((prev) => !prev);
          break;
        case "Escape":
          setShowShortcuts(false);
          setSelectedEvent(null);
          setSelectedAsset(null);
          setShowExportModal(false);
          break;
        case "e":
        case "E":
          if (!e.ctrlKey && !e.metaKey) {
            setActivePanel((prev) => (prev === "qdent" ? null : "qdent"));
          }
          break;
        case "w":
        case "W":
          setActivePanel((prev) => (prev === "weather" ? null : "weather"));
          break;
        case "s":
        case "S":
          setActivePanel((prev) => (prev === "seismic" ? null : "seismic"));
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fetchEvents]);

  const toggleOverlay = (type: OverlayType) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    if (isSoundEnabled) playHoverSound();
  };

  const toggleSector = (sector: SectorType) => {
    setActiveSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
    if (isSoundEnabled) playHoverSound();
  };

  const togglePanel = (panel: typeof activePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
    if (isSoundEnabled) playSelectSound();
  };

  const handleAnalystQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analystQuery.trim() || analystLoading) return;
    setAnalystLoading(true);
    setAnalystResponse("");
    const prompt = `Analyze the following OSINT query for ${selectedCity.name}: ${analystQuery}\n\nProvide a concise intelligence assessment with key findings and threat level.`;
    try {
      const response = await queryOllama(prompt, "llama3.2");
      setAnalystResponse(response);
      if (isSoundEnabled) playPingSound();
    } catch (err) {
      setAnalystResponse(`[ERROR] Ollama connection failed: ${err instanceof Error ? err.message : String(err)}`);
      if (isSoundEnabled) playAlertSound();
    } finally {
      setAnalystLoading(false);
      setAnalystQuery("");
    }
  };

  const handleScreenshot = async () => {
    if (!mapContainerRef.current) return;
    setIsRecording(true);
    if (isSoundEnabled) playPingSound();
    try {
      await exportMapToCanvas(mapContainerRef.current);
      setShowExportModal(true);
      setTimeout(() => setShowExportModal(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecording(false);
    }
  };

  const overlayContainerSize = overlaysContainerRef.current
    ? { width: overlaysContainerRef.current.clientWidth, height: overlaysContainerRef.current.clientHeight }
    : { width: 0, height: 0 };

  const filteredFleetAssets = fleetFilter === "all"
    ? fleetAssets
    : fleetAssets.filter((a) => a.sector === fleetFilter);

  const totalFleetCount = ALL_FLEET_ASSETS.length;
  const activeFleetCount = fleetAssets.filter((a) => activeSectors.has(a.sector)).length;

  if (showSplash) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center space-y-8"
        onClick={() => setShowSplash(false)}
      >
        <div className="relative">
          <Sparkles className="w-16 h-16 text-cyan-400 animate-spin" style={{ animationDuration: "8s" }} />
          <div className="absolute inset-0 bg-cyan-400/20 blur-2xl rounded-full animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black tracking-[0.4em] text-white uppercase">
            <span className="text-cyan-400">AXE</span> <span className="text-slate-300">OSINT</span>
          </h1>
          <p className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">
            Advanced Global Intelligence Surveillance Grid
          </p>
        </div>
        <div className="space-y-1 text-center">
          <p className="text-xs text-slate-400 animate-pulse font-mono">Initializing Satellite Uplink...</p>
          <p className="text-[9px] text-slate-600 font-mono">Click anywhere to engage</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-black min-h-[600px]">
      {/* Map container - explicitly behind everything */}
      <div ref={mapContainerRef} className="absolute inset-0 z-[1] min-h-[500px]" />

      {/* Map loading / error states */}
      {!isLoaded && !mapError && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black">
          <div className="text-center space-y-3">
            <Satellite className="w-10 h-10 text-cyan-400 animate-spin mx-auto" style={{ animationDuration: "2s" }} />
            <div className="text-sm font-mono text-cyan-400 uppercase tracking-wider">Initializing Satellite Grid...</div>
            <div className="text-[10px] font-mono text-slate-600">Loading Google Maps 3D API</div>
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black">
          <div className="text-center space-y-3 max-w-sm mx-4">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
            <div className="text-sm font-mono text-amber-400 uppercase tracking-wider">Map Unavailable</div>
            <div className="text-[10px] font-mono text-slate-400">{mapError}</div>
            <div className="text-[9px] font-mono text-slate-600">Check VITE_GOOGLE_MAPS_API_KEY in Vercel env vars</div>
          </div>
        </div>
      )}

      {/* D3 Overlays - above map, below UI */}
      <div ref={overlaysContainerRef} className="absolute inset-0 z-[5] pointer-events-none">
        {activeOverlays.has("heatmap") && events.length > 0 && (
          <D3HeatmapOverlay
            events={events}
            width={overlayContainerSize.width}
            height={overlayContainerSize.height}
          />
        )}
        {activeOverlays.has("risk-heatmap") && events.length > 0 && (
          <D3RiskHeatmapOverlay
            events={events}
            width={overlayContainerSize.width}
            height={overlayContainerSize.height}
          />
        )}
      </div>

      {/* Top HUD bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 bg-[#030406]/90 backdrop-blur border-b border-cyan-950/60">
        <div className="flex items-center gap-3">
          <Satellite className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: "20s" }} />
          <div>
            <h1 className="text-xs font-bold text-white uppercase tracking-widest">
              AXE <span className="text-cyan-400">OSINT</span> GRID
            </h1>
            <p className="text-[8px] text-slate-500 font-mono tracking-wider uppercase">
              {selectedCity.name.toUpperCase()} — Lat: {selectedCity.lat.toFixed(3)} Lng: {selectedCity.lng.toFixed(3)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/50">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            UPLINK ACTIVE
          </div>
          <div className="text-[9px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-cyan-950/50">
            EVENTS: {events.length}
          </div>
          <div className="text-[9px] font-mono text-cyan-400 bg-cyan-950/20 px-2 py-0.5 rounded border border-cyan-900/50">
            ASSETS: {activeFleetCount}/{totalFleetCount}
          </div>
        </div>
      </div>

      {/* Sector Toggle Bar */}
      <div className="relative z-10">
        <SectorToggleBar activeSectors={activeSectors} onToggle={toggleSector} />
      </div>

      {/* Main content area — ALL data on RIGHT, map in center */}
      <div className="relative z-10 flex-1 flex items-start justify-end p-3 pointer-events-none">
        {/* Right Panel — ALL controls and data */}
        <div className="pointer-events-auto w-80 space-y-3 overflow-y-auto max-h-[calc(100vh-180px)] pr-1">
          {/* City selector */}
          <CitySelector selectedCity={selectedCity} onSelectCity={(city) => {
            setSelectedCity(city);
            if (isSoundEnabled) playSelectSound();
          }} />

          {/* Module buttons — horizontal row */}
          <div className="flex gap-1.5">
            {[
              { key: "waypoints" as const, label: "Waypoints", icon: MapPin, color: "text-cyan-400 border-cyan-500/30 bg-cyan-950/20" },
              { key: "qdent" as const, label: "SIGINT", icon: Radio, color: "text-violet-400 border-violet-500/30 bg-violet-950/20" },
              { key: "seismic" as const, label: "Seismic", icon: Activity, color: "text-emerald-400 border-emerald-500/30 bg-emerald-950/20" },
              { key: "weather" as const, label: "Atmospheric", icon: CloudRain, color: "text-sky-400 border-sky-500/30 bg-sky-950/20" },
            ].map((mod) => {
              const Icon = mod.icon;
              const isActive = activePanel === mod.key;
              return (
                <button
                  key={mod.key}
                  onClick={() => togglePanel(mod.key)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive ? mod.color : "border-cyan-950/40 text-slate-400 hover:text-slate-300 bg-black/40"
                  }`}
                >
                  <Icon className="w-3 h-3" /> {mod.label}
                </button>
              );
            })}
          </div>

          {/* Side panels that can be toggled */}
          {activePanel === "waypoints" && <ChoicePointsPanel />}
          {activePanel === "seismic" && <SeismicPanel cityName={selectedCity.name} lat={selectedCity.lat} lng={selectedCity.lng} />}
          {activePanel === "qdent" && <QDENTPanel cityName={selectedCity.name} lat={selectedCity.lat} lng={selectedCity.lng} />}
          {activePanel === "weather" && <WeatherWidget lat={selectedCity.lat} lng={selectedCity.lng} cityName={selectedCity.name} />}

          {/* Map Controls */}
          <div className="bg-[#050608]/95 border border-cyan-950/80 rounded-xl overflow-hidden shadow-xl">
            <div className="p-2 border-b border-cyan-950/60 flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400">Map Controls</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setIsSoundEnabled((prev) => !prev)}
                  className="p-1 rounded hover:bg-black/40 text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
                  title="Toggle Audio"
                >
                  {isSoundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setShowShortcuts(true)}
                  className="p-1 rounded hover:bg-black/40 text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
                  title="Keyboard Shortcuts"
                >
                  <Keyboard className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="p-2 grid grid-cols-2 gap-1.5">
              {[
                { key: "heatmap", label: "Heatmap", icon: BarChart3, color: "text-rose-400 border-rose-500/20" },
                { key: "risk-heatmap", label: "Risk Zones", icon: AlertTriangle, color: "text-amber-400 border-amber-500/20" },
                { key: "patrol", label: "Patrol", icon: Route, color: "text-blue-400 border-blue-500/20" },
                { key: "traffic", label: "Traffic", icon: Siren, color: "text-emerald-400 border-emerald-500/20" },
              ].map((btn) => {
                const Icon = btn.icon;
                const isActive = activeOverlays.has(btn.key as OverlayType);
                return (
                  <button
                    key={btn.key}
                    onClick={() => toggleOverlay(btn.key as OverlayType)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-[9px] font-mono font-bold uppercase tracking-wide transition-all cursor-pointer ${
                      isActive
                        ? `${btn.color} bg-opacity-10`
                        : "border-cyan-950/40 text-slate-400 hover:text-slate-300 bg-black/40"
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {btn.label}
                  </button>
                );
              })}
            </div>
            <div className="p-2 border-t border-cyan-950/60 flex gap-1.5">
              <button
                onClick={fetchEvents}
                className="flex-1 flex items-center justify-center gap-1 bg-cyan-950/20 hover:bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 rounded py-1.5 text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Scan Grid
              </button>
              <button
                onClick={handleScreenshot}
                className="flex items-center justify-center gap-1 bg-black/40 hover:bg-slate-900/60 border border-cyan-950/50 text-slate-300 rounded py-1.5 px-2 text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Analytics Tabs */}
          <div className="bg-[#050608]/95 border border-cyan-950/80 rounded-xl overflow-hidden shadow-xl">
            <div className="grid grid-cols-4 border-b border-cyan-950/60">
              {[
                { key: "live" as const, label: "Live", icon: Radio },
                { key: "fleet" as const, label: "Fleet", icon: Ship },
                { key: "analytics" as const, label: "Stats", icon: BarChart3 },
                { key: "terminal" as const, label: "AI", icon: Cpu },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`py-1.5 px-1 text-[8px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      activeTab === tab.key
                        ? "text-cyan-400 bg-cyan-950/10 border-b-2 border-b-cyan-500"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="p-2 min-h-[120px]">
              {activeTab === "live" && <EventFeed events={events} />}

              {activeTab === "fleet" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
                    <button
                      onClick={() => setFleetFilter("all")}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
                        fleetFilter === "all"
                          ? "text-cyan-400 border-cyan-500/40 bg-cyan-950/30"
                          : "text-slate-500 border-cyan-950/30 hover:text-slate-300"
                      }`}
                    >
                      All
                    </button>
                    {(["maritime", "aviation", "seismic", "chokepoints", "nuclear", "data_centers", "war_zones", "environment"] as SectorType[]).map((s) => {
                      const count = getSectorCount(s);
                      const Icon = SECTOR_ICON_MAP[s];
                      return (
                        <button
                          key={s}
                          onClick={() => setFleetFilter(fleetFilter === s ? "all" : s)}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer shrink-0 ${
                            fleetFilter === s
                              ? "text-cyan-400 border-cyan-500/40 bg-cyan-950/30"
                              : "text-slate-500 border-cyan-950/30 hover:text-slate-300"
                          }`}
                        >
                          <Icon className="w-2.5 h-2.5" />
                          {SECTOR_LABELS[s]}
                          <span className="text-[7px] text-slate-600">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                    {filteredFleetAssets.slice(0, 15).map((asset) => {
                      const Icon = SECTOR_ICON_MAP[asset.sector];
                      const color = SECTOR_COLORS[asset.sector];
                      return (
                        <button
                          key={asset.id}
                          onClick={() => setSelectedAsset(asset)}
                          className="w-full flex items-center gap-2 px-2 py-1 rounded bg-black/30 border border-cyan-950/30 hover:border-cyan-950/60 hover:bg-black/50 transition-all text-left cursor-pointer"
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <Icon className="w-2.5 h-2.5 shrink-0" style={{ color }} />
                              <span className="text-[9px] font-mono text-slate-200 truncate">{asset.name}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === "analytics" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono">
                    <div className="bg-black/40 border border-cyan-950/40 rounded p-1.5 text-center">
                      <div className="text-cyan-400 font-bold text-sm">{events.length}</div>
                      <div className="text-slate-500">Total Events</div>
                    </div>
                    <div className="bg-black/40 border border-cyan-950/40 rounded p-1.5 text-center">
                      <div className="text-rose-400 font-bold text-sm">{events.filter((e) => e.severity === "critical").length}</div>
                      <div className="text-slate-500">Critical</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "terminal" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">AI Analyst</span>
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${ollamaStatus ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20" : "bg-rose-950/30 text-rose-400 border border-rose-500/20"}`}>
                      {ollamaStatus ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <form onSubmit={handleAnalystQuery} className="flex gap-1.5">
                    <input
                      type="text"
                      value={analystQuery}
                      onChange={(e) => setAnalystQuery(e.target.value)}
                      placeholder="Ask the AI Analyst..."
                      className="flex-1 bg-black/60 border border-cyan-950/50 rounded px-2 py-1.5 text-[9px] font-mono text-cyan-400 placeholder:text-cyan-950/50 focus:outline-none focus:border-cyan-500/40"
                      disabled={analystLoading || !ollamaStatus}
                    />
                    <button
                      type="submit"
                      disabled={analystLoading || !ollamaStatus || !analystQuery.trim()}
                      className="px-2 py-1.5 bg-cyan-950/20 border border-cyan-500/20 text-cyan-400 rounded text-[9px] font-mono font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyan-950/40 transition-all cursor-pointer"
                    >
                      {analystLoading ? "..." : "ASK"}
                    </button>
                  </form>
                  {analystResponse && (
                    <div className="bg-black/60 border border-cyan-950/40 rounded p-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                      <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-cyan-500/60 mb-1">INTEL ASSESSMENT</div>
                      <div className="text-[9px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">{analystResponse}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sector Status */}
          <div className="bg-[#050608]/80 border border-cyan-950/60 rounded-xl p-2.5">
            <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">Sector Status</div>
            <div className="space-y-1">
              {(["maritime", "aviation", "seismic", "chokepoints", "nuclear", "data_centers", "war_zones", "environment"] as SectorType[]).map((s) => {
                const count = getSectorCount(s);
                const isActive = activeSectors.has(s);
                const Icon = SECTOR_ICON_MAP[s];
                return (
                  <div key={s} className="flex items-center justify-between text-[8px] font-mono">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-2.5 h-2.5" style={{ color: isActive ? SECTOR_COLORS[s] : "#475569" }} />
                      <span className={isActive ? "text-slate-300" : "text-slate-600"}>{SECTOR_LABELS[s]}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-slate-700"}`} />
                      <span className={isActive ? "text-slate-400" : "text-slate-700"}>{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}>
          <div className="bg-[#030406] border border-cyan-950/80 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-cyan-950/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5" /> Event Detail
              </h3>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Title</span>
                <p className="text-sm text-white font-semibold">{selectedEvent.title}</p>
              </div>
              <div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Description</span>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedEvent.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Severity</span>
                  <span className={`font-bold ${
                    selectedEvent.severity === "critical" ? "text-rose-400" :
                    selectedEvent.severity === "warning" ? "text-amber-400" : "text-cyan-400"
                  }`}>{selectedEvent.severity.toUpperCase()}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Type</span>
                  <span className="text-slate-200 font-bold">{selectedEvent.type}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Category</span>
                  <span className="text-slate-200 font-bold">{selectedEvent.category}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Time</span>
                  <span className="text-slate-200">{selectedEvent.timestamp}</span>
                </div>
              </div>
              <div className="text-[9px] font-mono text-slate-500 pt-2 border-t border-cyan-950/40">
                COORDINATES: {selectedEvent.coordinates.lat.toFixed(4)}, {selectedEvent.coordinates.lng.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAsset(null)}>
          <div className="bg-[#030406] border border-cyan-950/80 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-cyan-950/60 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: SECTOR_COLORS[selectedAsset.sector] }}
              >
                {(() => {
                  const Icon = SECTOR_ICON_MAP[selectedAsset.sector];
                  return <Icon className="w-3.5 h-3.5" />;
                })()}
                {SECTOR_LABELS[selectedAsset.sector]} Asset
              </h3>
              <button onClick={() => setSelectedAsset(null)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Name</span>
                <p className="text-sm text-white font-semibold">{selectedAsset.name}</p>
              </div>
              <div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Description</span>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedAsset.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Label</span>
                  <span className="text-slate-200 font-bold">{selectedAsset.label}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Status</span>
                  <span className={`font-bold ${
                    selectedAsset.status === "active" || selectedAsset.status === "en-route" || selectedAsset.status === "transit" || selectedAsset.status === "cruising"
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}>{selectedAsset.status.toUpperCase()}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Sector</span>
                  <span className="text-slate-200 font-bold">{SECTOR_LABELS[selectedAsset.sector]}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Category</span>
                  <span className="text-slate-200 font-bold">{selectedAsset.category || "N/A"}</span>
                </div>
                {selectedAsset.speed !== undefined && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Speed</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.speed.toFixed(1)} kts</span>
                  </div>
                )}
                {selectedAsset.altitude !== undefined && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Altitude</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.altitude.toLocaleString()} ft</span>
                  </div>
                )}
                {selectedAsset.heading !== undefined && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Heading</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.heading.toFixed(0)}°</span>
                  </div>
                )}
                {selectedAsset.owner && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Owner</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.owner}</span>
                  </div>
                )}
                {selectedAsset.capacity && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Capacity</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.capacity}</span>
                  </div>
                )}
                {selectedAsset.tailNumber && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Tail Number</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.tailNumber}</span>
                  </div>
                )}
                {selectedAsset.magnitude !== undefined && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Magnitude</span>
                    <span className="text-rose-400 font-bold">M{selectedAsset.magnitude}</span>
                  </div>
                )}
                {selectedAsset.depth !== undefined && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Depth</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.depth} km</span>
                  </div>
                )}
                {selectedAsset.yearBuilt && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Year Built</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.yearBuilt}</span>
                  </div>
                )}
                {selectedAsset.flag && (
                  <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                    <span className="text-slate-500 block">Flag</span>
                    <span className="text-slate-200 font-bold">{selectedAsset.flag}</span>
                  </div>
                )}
              </div>
              <div className="text-[9px] font-mono text-slate-500 pt-2 border-t border-cyan-950/40">
                COORDINATES: {selectedAsset.lat.toFixed(4)}, {selectedAsset.lng.toFixed(4)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-950/90 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider animate-pulse">
          Screenshot captured
        </div>
      )}

      {/* Shortcuts Help */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[#030406] border border-cyan-950/80 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-cyan-950/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Keyboard className="w-3.5 h-3.5" /> Keyboard Shortcuts
              </h3>
              <button onClick={() => setShowShortcuts(false)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 text-[11px] font-mono">
              {[
                { key: "1-8", desc: "Toggle sectors (Maritime→Environment)" },
                { key: "H", desc: "Toggle heatmap overlay" },
                { key: "R", desc: "Refresh intelligence feed" },
                { key: "M", desc: "Toggle audio feedback" },
                { key: "E", desc: "Toggle SIGINT panel" },
                { key: "W", desc: "Toggle weather panel" },
                { key: "S", desc: "Toggle seismic panel" },
                { key: "?", desc: "Show this help dialog" },
                { key: "ESC", desc: "Close dialogs / panels" },
              ].map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between py-1 border-b border-cyan-950/30 last:border-0">
                  <span className="bg-cyan-950/40 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-900/40 font-bold">{shortcut.key}</span>
                  <span className="text-slate-400">{shortcut.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
