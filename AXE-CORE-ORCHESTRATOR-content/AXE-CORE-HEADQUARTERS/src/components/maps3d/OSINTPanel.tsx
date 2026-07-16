import React, { useState, useEffect, useCallback, useRef } from "react";
import { CityConfig, OSINTEvent, OverlayType } from "@/lib/maps3d/types";
import { FEATURED_CITIES } from "@/lib/maps3d/constants";
import { getIntelligenceForCity } from "@/lib/maps3d/intelApi";
import { useGoogleMaps3D } from "@/lib/maps3d/useGoogleMaps3D";
import { playHoverSound, playSelectSound, playPingSound, playAlertSound } from "@/lib/maps3d/audio";

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

import {
  Globe,
  Crosshair,
  Zap,
  Eye,
  Layers,
  BarChart3,
  Cpu,
  Activity,
  CloudRain,
  Route,
  Siren,
  RefreshCw,
  Satellite,
  ChevronLeft,
  ChevronRight,
  Camera,
  Volume2,
  VolumeX,
  Keyboard,
  HelpCircle,
  Radio,
  Thermometer,
  AlertTriangle,
  MapPin,
  X,
  Sparkles,
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"live" | "analytics" | "terminal">("live");
  const [selectedEvent, setSelectedEvent] = useState<OSINTEvent | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const overlaysContainerRef = useRef<HTMLDivElement>(null);

  const { isLoaded } = useGoogleMaps3D();

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapRef.current) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: { lat: selectedCity.lat, lng: selectedCity.lng },
      zoom: selectedCity.zoom,
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
    mapRef.current.setZoom(selectedCity.zoom);
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

  // Render markers
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];

    if (!google.maps.marker?.AdvancedMarkerElement) return;

    events.forEach(evt => {
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "h":
        case "H":
          setActiveOverlays(prev => {
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
          setIsSoundEnabled(prev => !prev);
          break;
        case "?":
          setShowShortcuts(prev => !prev);
          break;
        case "Escape":
          setShowShortcuts(false);
          setSelectedEvent(null);
          setShowExportModal(false);
          break;
        case "e":
        case "E":
          if (!e.ctrlKey && !e.metaKey) {
            setActivePanel(prev => (prev === "qdent" ? null : "qdent"));
          }
          break;
        case "w":
        case "W":
          setActivePanel(prev => (prev === "weather" ? null : "weather"));
          break;
        case "s":
        case "S":
          setActivePanel(prev => (prev === "seismic" ? null : "seismic"));
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fetchEvents]);

  const toggleOverlay = (type: OverlayType) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    if (isSoundEnabled) playHoverSound();
  };

  const togglePanel = (panel: typeof activePanel) => {
    setActivePanel(prev => (prev === panel ? null : panel));
    if (isSoundEnabled) playSelectSound();
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
    <div className="flex-1 flex flex-col relative overflow-hidden bg-black">
      {/* Map container */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* D3 Overlays */}
      <div ref={overlaysContainerRef} className="absolute inset-0 pointer-events-none">
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
        {/* Patrol route overlay would go here with choice points */}
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
        </div>
      </div>

      {/* Main content area with side panels */}
      <div className="relative z-10 flex-1 flex items-start justify-between p-3 pointer-events-none">
        {/* Left Panel - Controls */}
        <div className="pointer-events-auto w-72 space-y-3">
          {/* City selector */}
          <CitySelector selectedCity={selectedCity} onSelectCity={(city) => {
            setSelectedCity(city);
            if (isSoundEnabled) playSelectSound();
          }} />

          {/* Action Buttons */}
          <div className="bg-[#050608]/95 border border-cyan-950/80 rounded-xl overflow-hidden shadow-xl">
            <div className="p-2 border-b border-cyan-950/60">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400">Map Controls</span>
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
            <div className="grid grid-cols-3 border-b border-cyan-950/60">
              {[
                { key: "live" as const, label: "Live Feed", icon: Radio },
                { key: "analytics" as const, label: "Analytics", icon: BarChart3 },
                { key: "terminal" as const, label: "Terminal", icon: Cpu },
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
              {activeTab === "analytics" && (
                <div className="space-y-2">
                  <D3TimelineChart events={events} cityName={selectedCity.name} />
                  <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono">
                    <div className="bg-black/40 border border-cyan-950/40 rounded p-1.5 text-center">
                      <div className="text-cyan-400 font-bold text-sm">{events.length}</div>
                      <div className="text-slate-500">Total Events</div>
                    </div>
                    <div className="bg-black/40 border border-cyan-950/40 rounded p-1.5 text-center">
                      <div className="text-rose-400 font-bold text-sm">{events.filter(e => e.severity === "critical").length}</div>
                      <div className="text-slate-500">Critical</div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "terminal" && (
                <div className="bg-black border border-cyan-950/60 rounded p-2 h-32 overflow-y-auto custom-scrollbar font-mono text-[9px] text-cyan-500/80 space-y-1">
                  <div>[SYS] AXE-OSINT Terminal v3.2.1 initialized</div>
                  <div>[SYS] Connected to satellite grid: {selectedCity.name}</div>
                  <div>[SYS] {events.length} intelligence events loaded</div>
                  {consoleLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Side panels that can be toggled */}
          {activePanel === "waypoints" && <ChoicePointsPanel />}
          {activePanel === "seismic" && <SeismicPanel cityName={selectedCity.name} lat={selectedCity.lat} lng={selectedCity.lng} />}
          {activePanel === "qdent" && <QDENTPanel cityName={selectedCity.name} lat={selectedCity.lat} lng={selectedCity.lng} />}
          {activePanel === "weather" && <WeatherWidget lat={selectedCity.lat} lng={selectedCity.lng} cityName={selectedCity.name} />}
        </div>

        {/* Right Panel - Data modules */}
        <div className="pointer-events-auto w-64 space-y-3">
          {/* Module buttons */}
          <div className="flex flex-col gap-1.5">
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
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive ? mod.color : "border-cyan-950/40 text-slate-400 hover:text-slate-300 bg-black/40"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {mod.label}
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
                </button>
              );
            })}
          </div>

          {/* Audio toggle */}
          <button
            onClick={() => setIsSoundEnabled(prev => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-cyan-950/40 rounded-lg text-[9px] font-mono text-slate-400 hover:text-slate-200 transition-all cursor-pointer w-full"
          >
            {isSoundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            Audio {isSoundEnabled ? "ON" : "OFF"}
          </button>

          {/* Keyboard shortcuts */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-cyan-950/40 rounded-lg text-[9px] font-mono text-slate-400 hover:text-slate-200 transition-all cursor-pointer w-full"
          >
            <Keyboard className="w-3 h-3" /> Shortcuts (?)
          </button>
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}>
          <div className="bg-[#030406] border border-cyan-950/80 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
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

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-950/90 border border-emerald-500/30 rounded-lg px-4 py-2 text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider animate-pulse">
          Screenshot captured
        </div>
      )}

      {/* Shortcuts Help */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[#030406] border border-cyan-950/80 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
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
