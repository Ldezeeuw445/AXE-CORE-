import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Mobile detection hook ───
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}
import { CityConfig, OSINTEvent, OverlayType, SectorType, FleetAsset } from "@/domain/maps3d/types";
import { FEATURED_CITIES } from "@/domain/maps3d/constants";
import { getIntelligenceForCity } from "@/infrastructure/gateways/maps3d/intelApi";
import { useGoogleMaps3D } from "@/presentation/maps3d/useGoogleMaps3D";
import { playHoverSound, playSelectSound, playPingSound, playAlertSound } from "@/presentation/maps3d/audio";
import { ALL_FLEET_ASSETS, getSectorCount, SECTOR_LABELS } from "@/domain/maps3d/fleetData";
import SectorToggleBar from "@/presentation/components/maps3d/SectorToggleBar";
import { queryOllama, isOllamaAvailable } from "@/infrastructure/gateways/maps3d/ollamaApi";
import { fetchUnifiedOsint, type LiveOsintPoint } from "@/infrastructure/gateways/osint";

import {
  Globe, Crosshair, Eye, Layers, BarChart3, Cpu, Activity,
  RefreshCw, Satellite, Camera, Volume2, VolumeX, Keyboard,
  Radio, Zap, Target, Shield, AlertTriangle, MapPin, X, Sparkles,
  Ship, Plane, Flame, Radiation, Server, TreePine, Lock, Navigation,
  ChevronUp, ChevronDown, Clock, Database, Wifi, Bug
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

const WAYPOINT_FILTER_COLORS: Record<string, string> = {
  observation: "#22d3ee",
  extraction: "#f59e0b",
  rendezvous: "#fb7185",
  other: "#a78bfa",
};

export default function OSINTPanel() {
  const [selectedCity, setSelectedCity] = useState<CityConfig>(FEATURED_CITIES[0]);
  const [events, setEvents] = useState<OSINTEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayType>>(new Set());
  const [showSplash, setShowSplash] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<OSINTEvent | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<FleetAsset | null>(null);
  const [analystQuery, setAnalystQuery] = useState("");
  const [analystResponse, setAnalystResponse] = useState("");
  const [analystLoading, setAnalystLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(false);
  const [activeSectors, setActiveSectors] = useState<Set<SectorType>>(new Set(ALL_FLEET_ASSETS.map(a => a.sector)));
  const [fleetAssets, setFleetAssets] = useState<FleetAsset[]>(ALL_FLEET_ASSETS);

  // Real-time OSINT data from live APIs
  const [livePoints, setLivePoints] = useState<LiveOsintPoint[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [liveErrors, setLiveErrors] = useState<Partial<Record<string, string>>>({});
  const [selectedLivePoint, setSelectedLivePoint] = useState<LiveOsintPoint | null>(null);
  const liveMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  // New surveillance feed state
  const [mapType, setMapType] = useState<"satellite" | "vector" | "photorealistic">("satellite");
  const [rightPanelTab, setRightPanelTab] = useState<"intel" | "tactical" | "sensors" | "target">("intel");
  const [cameraTilt, setCameraTilt] = useState(47.5);
  const [cameraHeading, setCameraHeading] = useState(25);
  const [utcTime, setUtcTime] = useState("");
  const [cpuUsage, setCpuUsage] = useState(34);
  const [latency, setLatency] = useState(12);
  const [ollamaVersion, setOllamaVersion] = useState("v3.2");
  const [dbShards, setDbShards] = useState(8);
  const [showDebug, setShowDebug] = useState(false);

  // Waypoint filters
  const [waypointFilters, setWaypointFilters] = useState({
    observation: true,
    extraction: true,
    rendezvous: true,
    other: true,
  });

  // Mobile panel toggles
  const [showMobileLeft, setShowMobileLeft] = useState(false);
  const [showMobileRight, setShowMobileRight] = useState(false);

  // Mobile detection
  const isMobile = useIsMobile();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const leafletMapRef = useRef<any>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const fleetMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const { isLoaded, error: mapError, is3DAvailable, debugLog, addLog } = useGoogleMaps3D();

  // UTC clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().replace("T", " ").slice(0, 19) + " UTC");
    };
    updateTime();
    const id = setInterval(updateTime, 1000);
    return () => clearInterval(id);
  }, []);

  // Simulate status metrics
  useEffect(() => {
    const id = setInterval(() => {
      setCpuUsage(Math.floor(20 + Math.random() * 40));
      setLatency(Math.floor(8 + Math.random() * 20));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Check Ollama status
  useEffect(() => {
    isOllamaAvailable().then(setOllamaStatus);
    const id = setInterval(() => isOllamaAvailable().then(setOllamaStatus), 30000);
    return () => clearInterval(id);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapRef.current) return;

    addLog(`Initializing map for ${selectedCity.name}...`);
    addLog(`3D API available: ${is3DAvailable}`);
    addLog(`Map container dimensions: ${mapContainerRef.current.offsetWidth}x${mapContainerRef.current.offsetHeight}`);

    // Determine map type based on selection and 3D availability
    let actualMapTypeId: string;
    if (mapType === "satellite") {
      actualMapTypeId = "satellite";
    } else if (mapType === "vector") {
      actualMapTypeId = "roadmap";
    } else {
      // photorealistic - if 3D not available, fall back to satellite (hybrid can also fail without mapId)
      actualMapTypeId = is3DAvailable ? "hybrid" : "satellite";
    }
    addLog(`Map type: ${mapType} -> ${actualMapTypeId}`);

    const mapOptions: google.maps.MapOptions = {
      center: { lat: selectedCity.lat, lng: selectedCity.lng },
      zoom: selectedCity.zoom ?? 12,
      heading: cameraHeading,
      tilt: cameraTilt,
      mapTypeId: actualMapTypeId as google.maps.MapTypeId,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      keyboardShortcuts: false,
      styles: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
    };

    // Only add mapId if 3D is available and we're in photorealistic mode
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
    if (is3DAvailable && mapType === "photorealistic" && mapId) {
      (mapOptions as any).mapId = mapId;
      addLog(`Added mapId: ${mapId}`);
    } else {
      addLog(`No mapId: 3D=${is3DAvailable}, mapType=${mapType}, envMapId=${mapId ? 'set' : 'missing'}`);
    }

    try {
      const map = new google.maps.Map(mapContainerRef.current, mapOptions);
      mapRef.current = map;
      addLog("Map instance created successfully");

      // Force resize to ensure tiles render correctly (container may be 0x0 at init)
      [100, 500, 1000].forEach((delay) => {
        setTimeout(() => {
          if (mapRef.current) {
            google.maps.event.trigger(mapRef.current, 'resize');
            addLog(`Forced map resize (${delay}ms)`);
          }
        }, delay);
      });

      // Tile load detection - if tiles don't load within 10s, fallback to Leaflet
      let tilesLoaded = false;
      map.addListener("tilesloaded", () => {
        tilesLoaded = true;
        addLog("Map tiles loaded successfully");
      });
      setTimeout(() => {
        if (!tilesLoaded && mapRef.current && !usingFallback) {
          addLog("WARNING: Google Maps tiles not loaded after 10s — switching to OpenStreetMap fallback");
          // Destroy Google Maps instance
          mapRef.current = null;
          if (mapContainerRef.current) {
            mapContainerRef.current.innerHTML = '';
          }
          // Initialize Leaflet fallback
          initLeafletFallback();
        }
      }, 10000);
    } catch (err) {
      addLog(`ERROR creating map: ${err instanceof Error ? err.message : String(err)}`);
      // Try Leaflet immediately on error
      initLeafletFallback();
    }
  }, [isLoaded]);

  // Leaflet fallback initialization
  const initLeafletFallback = useCallback(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;
    const L = (window as any).L;
    if (!L) {
      addLog("ERROR: Leaflet not loaded (CDN failed)");
      return;
    }
    addLog("Initializing OpenStreetMap fallback...");
    try {
      const container = mapContainerRef.current;
      container.innerHTML = '';
      const map = L.map(container, {
        center: [selectedCity.lat, selectedCity.lng],
        zoom: selectedCity.zoom ?? 12,
        zoomControl: false,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);
      leafletMapRef.current = map;
      setUsingFallback(true);
      addLog("OpenStreetMap fallback loaded successfully");
    } catch (err) {
      addLog(`ERROR initializing Leaflet: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [selectedCity]);

  // Update camera on map when tilt/heading changes
  useEffect(() => {
    if (!mapRef.current) return;
    try {
      mapRef.current.setTilt(cameraTilt);
      mapRef.current.setHeading(cameraHeading);
    } catch (err) {
      addLog(`ERROR setting camera: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [cameraTilt, cameraHeading]);

  // City change handler
  useEffect(() => {
    if (mapRef.current) {
      addLog(`Changing city to ${selectedCity.name} (Google Maps)`);
      mapRef.current.setCenter({ lat: selectedCity.lat, lng: selectedCity.lng });
      mapRef.current.setZoom(selectedCity.zoom ?? 12);
    }
    if (leafletMapRef.current) {
      addLog(`Changing city to ${selectedCity.name} (Leaflet)`);
      leafletMapRef.current.setView([selectedCity.lat, selectedCity.lng], selectedCity.zoom ?? 12);
    }
    setCameraTilt(selectedCity.tilt);
    setCameraHeading(selectedCity.heading);
  }, [selectedCity]);

  // ResizeObserver — force map resize when container dimensions change
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        google.maps.event.trigger(mapRef.current, 'resize');
        addLog("ResizeObserver triggered Google Maps resize");
      }
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
        addLog("ResizeObserver triggered Leaflet invalidateSize");
      }
    });
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, [isLoaded]);

  // Map type change
  useEffect(() => {
    if (!mapRef.current) return;

    addLog(`Map type changed to: ${mapType}`);

    if (mapType === "satellite") {
      mapRef.current.setMapTypeId(google.maps.MapTypeId.SATELLITE);
      addLog("Set mapTypeId: SATELLITE");
    } else if (mapType === "vector") {
      mapRef.current.setMapTypeId(google.maps.MapTypeId.ROADMAP);
      addLog("Set mapTypeId: ROADMAP");
    } else if (mapType === "photorealistic") {
      if (is3DAvailable) {
        mapRef.current.setMapTypeId(google.maps.MapTypeId.HYBRID);
        addLog("Set mapTypeId: HYBRID (3D mode)");
        // Try to maximize tilt for 3D effect
        mapRef.current.setTilt(67);
        setCameraTilt(67);
      } else {
        mapRef.current.setMapTypeId(google.maps.MapTypeId.HYBRID);
        addLog("Set mapTypeId: HYBRID (fallback - 3D not available)");
        mapRef.current.setTilt(cameraTilt);
      }
    }
  }, [mapType, is3DAvailable]);

  // Fetch events (mock city data + real OSINT)
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

  // Fetch LIVE OSINT data from real APIs
  const fetchLiveData = useCallback(async () => {
    setLiveLoading(true);
    try {
      const result = await fetchUnifiedOsint(selectedCity.name);
      const jittered = result.points.map(p => {
        if (p.lat === 0 && p.lon === 0 && (p.kind === 'news' || p.kind === 'intel')) {
          return {
            ...p,
            lat: selectedCity.lat + (Math.random() - 0.5) * 0.08,
            lon: selectedCity.lng + (Math.random() - 0.5) * 0.08,
          };
        }
        return p;
      });
      setLivePoints(jittered);
      setLastUpdated(result.lastUpdated);
      setLiveErrors(result.errors);
    } catch (e) {
      console.error('[LiveOSINT] fetch failed:', e);
    } finally {
      setLiveLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Live data: fetch on mount and every 30 seconds
  useEffect(() => {
    fetchLiveData();
    const id = setInterval(fetchLiveData, 30000);
    return () => clearInterval(id);
  }, [fetchLiveData]);

  // NOTE: fleetAssets (vessels/aircraft/etc.) is static reference data, not a
  // live feed — see domain/maps3d/fleetData.ts. This panel used to fake
  // motion on it every 5s (simulateAssetsMovement) purely so it *looked*
  // live on the map. Real tracking needs actual AIS/ADS-B integration (the
  // adapters already exist, unused, in this repo's other backend —
  // backend/adapters/{air,vessel}.py) — until that's wired in, faking motion
  // on frozen positions is worse than showing them still: it's a deliberate
  // false signal, not a missing feature. Removed rather than left running.

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

  // Render live OSINT markers (real API data)
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    liveMarkersRef.current.forEach((m) => (m.map = null));
    liveMarkersRef.current = [];

    if (!google.maps.marker?.AdvancedMarkerElement) return;

    livePoints.forEach((pt) => {
      const el = document.createElement("div");
      el.style.position = "relative";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";

      const color =
        pt.severity === "critical"
          ? "#fb7185"
          : pt.severity === "warning"
          ? "#f59e0b"
          : "#22d3ee";

      if (pt.kind === "flight") {
        const heading = (pt.metadata?.true_track as number) ?? (pt.metadata?.heading as number) ?? 0;
        el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${color}" style="transform: rotate(${heading}deg); filter: drop-shadow(0 0 3px ${color}80);">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>`;
      } else if (pt.kind === "disaster") {
        el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" style="filter: drop-shadow(0 0 4px ${color}80);">
          <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>
        </svg>`;
      } else if (pt.kind === "threat") {
        el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" style="filter: drop-shadow(0 0 4px ${color}80);">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        </svg>`;
      } else {
        el.className = `w-2.5 h-2.5 rounded-full animate-pulse`;
        el.style.backgroundColor = color;
        el.style.boxShadow = `0 0 6px ${color}80`;
      }

      const badge = document.createElement("div");
      badge.className = "absolute -bottom-3 left-1/2 -translate-x-1/2 px-1 py-0 text-[6px] font-mono font-bold uppercase tracking-wider whitespace-nowrap rounded border";
      badge.style.backgroundColor = "rgba(3,4,6,0.9)";
      badge.style.color = color;
      badge.style.borderColor = `${color}40`;
      badge.textContent = pt.source;
      if (pt.stale) {
        badge.textContent += " · STALE";
        badge.style.opacity = "0.6";
      }
      el.appendChild(badge);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: pt.lat, lng: pt.lon },
        map: mapRef.current,
        content: el,
        title: `${pt.title} [${pt.source.toUpperCase()}]`,
      });

      marker.addEventListener("gmp-click", () => {
        setSelectedLivePoint(pt);
        if (isSoundEnabled) playSelectSound();
      });

      liveMarkersRef.current.push(marker);
    });
  }, [livePoints, isLoaded, isSoundEnabled]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      const num = parseInt(key, 10);
      if (!isNaN(num) && num >= 1 && num <= 8) {
        const sectors: SectorType[] = ["maritime", "aviation", "seismic", "chokepoints", "nuclear", "data_centers", "war_zones", "environment"];
        const sector = sectors[num - 1];
        if (sector) toggleSector(sector);
        return;
      }

      switch (key) {
        case "h":
        case "H":
          toggleOverlay("heatmap");
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
          break;
        case "d":
        case "D":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowDebug((prev) => !prev);
          }
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
      setShowExportModal(true);
      setTimeout(() => setShowExportModal(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRecording(false);
    }
  };

  const activeFleetCount = fleetAssets.filter((a) => activeSectors.has(a.sector)).length;
  const totalFleetCount = ALL_FLEET_ASSETS.length;

  const flightCount = livePoints.filter(p => p.kind === 'flight').length;
  const disasterCount = livePoints.filter(p => p.kind === 'disaster').length;
  const threatCount = livePoints.filter(p => p.kind === 'threat').length;
  const newsCount = livePoints.filter(p => p.kind === 'news').length;

  const tabCounts = {
    intel: events.filter(e => e.severity === "critical" || e.severity === "warning").length + newsCount,
    tactical: activeFleetCount + flightCount + threatCount,
    sensors: events.filter(e => e.category === "signal" || e.category === "thermal").length + disasterCount,
    target: events.filter(e => e.severity === "critical").length + threatCount,
  };

  const toggleWaypointFilter = (key: keyof typeof waypointFilters) => {
    setWaypointFilters(prev => ({ ...prev, [key]: !prev[key] }));
    if (isSoundEnabled) playHoverSound();
  };

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
            <span className="text-cyan-400">AXE</span> <span className="text-slate-300">GLOBAL</span>
          </h1>
          <p className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">
            Surveillance Feed — Initializing Secure Link
          </p>
        </div>
        <div className="space-y-1 text-center">
          <p className="text-xs text-slate-400 animate-pulse font-mono">Establishing Satellite Uplink...</p>
          <p className="text-[9px] text-slate-600 font-mono">Click anywhere to engage</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
      {/* Full-screen Map with explicit dimensions */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-[1]"
        style={{ width: "100%", height: "100%", minWidth: "100px", minHeight: "100px" }}
      />

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
          </div>
        </div>
      )}

      {/* 3D Not Available Warning */}
      {isLoaded && !is3DAvailable && mapType === "photorealistic" && (
        <div className="absolute top-[80px] right-3 z-30 bg-amber-950/80 border border-amber-500/30 rounded-lg px-3 py-2 max-w-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-[10px] font-mono text-amber-400 font-bold uppercase">3D Not Available</div>
              <div className="text-[9px] font-mono text-slate-400 leading-relaxed">
                Photorealistic 3D requires:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Map ID in Google Cloud Console</li>
                  <li>Map Tiles API enabled</li>
                  <li>Billing enabled</li>
                </ul>
                <span className="text-slate-500">Falling back to hybrid satellite view.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {showDebug && (
        <div className="absolute top-[120px] left-3 z-30 w-96 bg-[#030406]/95 border border-cyan-950/60 rounded-lg overflow-hidden max-h-[300px]">
          <div className="px-3 py-2 border-b border-cyan-950/40 flex items-center justify-between">
            <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Bug className="w-3 h-3" />
              Debug Console
            </div>
            <button
              onClick={() => setShowDebug(false)}
              className="text-slate-500 hover:text-white cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-2 overflow-y-auto custom-scrollbar space-y-0.5">
            <div className="text-[8px] font-mono text-slate-500 mb-1">
              3D Available: <span className={is3DAvailable ? "text-emerald-400" : "text-rose-400"}>{is3DAvailable ? "YES" : "NO"}</span>
              {" | "}Map Type: <span className="text-cyan-400">{mapType}</span>
              {" | "}Loaded: <span className="text-emerald-400">{isLoaded ? "YES" : "NO"}</span>
            </div>
            {debugLog.map((log, i) => (
              <div key={i} className="text-[8px] font-mono text-slate-400 leading-tight">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ====== HEADER BAR ====== */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2 md:px-4 py-1.5 md:py-2 bg-[#030406]/90 backdrop-blur border-b border-cyan-950/60">
        <div className="flex items-center gap-2 md:gap-3">
          <Satellite className="w-3.5 h-3.5 md:w-4 md:h-4 text-cyan-400 animate-spin" style={{ animationDuration: "20s" }} />
          <div>
            <h1 className="text-[10px] md:text-xs font-bold text-white uppercase tracking-widest">
              AXE <span className="text-cyan-400">GLOBAL</span> <span className="hidden md:inline">SURVEILLANCE FEED</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1 text-[8px] md:text-[9px] font-mono text-emerald-400 bg-emerald-950/30 px-1.5 md:px-2 py-0.5 rounded border border-emerald-900/50">
            <Lock className="w-2 h-2 md:w-2.5 md:h-2.5" />
            <span className="hidden md:inline">{usingFallback ? 'FALLBACK OSM' : 'SECURE LINK'}</span>
            <span className="md:hidden">{usingFallback ? 'OSM' : 'SECURE'}</span>
          </div>
          <div className="text-[8px] md:text-[9px] font-mono text-cyan-400 bg-cyan-950/20 px-1.5 md:px-2 py-0.5 rounded border border-cyan-900/50">
            {utcTime}
          </div>
          {/* Mobile panel toggles */}
          <button
            onClick={() => { setShowMobileLeft(v => !v); setShowMobileRight(false); }}
            className={`md:hidden p-1 rounded border transition-all cursor-pointer ${showMobileLeft ? 'text-cyan-400 bg-cyan-950/30 border-cyan-500/30' : 'text-slate-500 border-slate-700'}`}
            title="Toggle Filters"
          >
            <Navigation className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setShowMobileRight(v => !v); setShowMobileLeft(false); }}
            className={`md:hidden p-1 rounded border transition-all cursor-pointer ${showMobileRight ? 'text-cyan-400 bg-cyan-950/30 border-cyan-500/30' : 'text-slate-500 border-slate-700'}`}
            title="Toggle Intel"
          >
            <Database className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowDebug((prev) => !prev)}
            className={`hidden md:inline-flex text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition-all cursor-pointer ${
              showDebug ? "text-cyan-400 bg-cyan-950/30 border-cyan-500/30" : "text-slate-600 border-slate-800 hover:text-slate-400"
            }`}
            title="Toggle Debug (Ctrl+D)"
          >
            <Bug className="w-2.5 h-2.5 inline mr-1" />
            Debug
          </button>
        </div>
      </div>

      {/* ====== CITY TABS ====== */}
      <div className="absolute top-[36px] md:top-[41px] left-0 right-0 z-20 flex items-center gap-0 px-2 md:px-4 py-1 md:py-1.5 bg-[#030406]/80 backdrop-blur border-b border-cyan-950/40 overflow-x-auto custom-scrollbar">
        {FEATURED_CITIES.map((city) => {
          const isActive = selectedCity.name === city.name;
          return (
            <button
              key={city.name}
              onClick={() => {
                setSelectedCity(city);
                if (isSoundEnabled) playSelectSound();
              }}
              className={`px-2 md:px-3 py-0.5 md:py-1 text-[8px] md:text-[9px] font-mono font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? "text-cyan-400 border-cyan-400 bg-cyan-950/20"
                  : "text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-700"
              }`}
            >
              {city.name.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* ====== MAP TYPE TOGGLE (top-right of map) ====== */}
      <div className="absolute top-[68px] md:top-[80px] right-2 md:right-3 z-20 flex items-center gap-0.5 bg-[#030406]/80 backdrop-blur border border-cyan-950/40 rounded overflow-hidden">
        {(["satellite", "vector", "photorealistic"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setMapType(type)}
            className={`px-2 md:px-2.5 py-1 text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
              mapType === type
                ? "text-cyan-400 bg-cyan-950/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {type === "photorealistic" ? "3D" : type}
          </button>
        ))}
      </div>

      {/* ====== LEFT PANEL — WAYPOINT FILTERS ====== */}
      {(!isMobile || showMobileLeft) && (
      <div className="absolute top-[68px] md:top-[80px] left-2 md:left-3 z-30 w-40 md:w-44 bg-[#030406]/95 md:bg-[#030406]/85 backdrop-blur border border-cyan-950/40 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-cyan-950/40">
          <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Navigation className="w-3 h-3" />
            WAYPOINT FILTERS
          </div>
        </div>
        <div className="p-2 space-y-1">
          {([
            { key: "observation", label: "OBSERVATION" },
            { key: "extraction", label: "EXTRACTION" },
            { key: "rendezvous", label: "RENDEZVOUS" },
            { key: "other", label: "OTHER POINTS" },
          ] as const).map((filter) => (
            <button
              key={filter.key}
              onClick={() => toggleWaypointFilter(filter.key)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 transition-all cursor-pointer text-left"
            >
              <div className={`w-3 h-3 rounded-sm border flex items-center justify-center transition-all ${
                waypointFilters[filter.key as keyof typeof waypointFilters]
                  ? "border-cyan-500/50 bg-cyan-950/30"
                  : "border-slate-700"
              }`}>
                {waypointFilters[filter.key as keyof typeof waypointFilters] && (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: WAYPOINT_FILTER_COLORS[filter.key] }} />
                )}
              </div>
              <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                waypointFilters[filter.key as keyof typeof waypointFilters] ? "text-slate-200" : "text-slate-600"
              }`}>
                {filter.label}
              </span>
              <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: WAYPOINT_FILTER_COLORS[filter.key] }} />
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ====== RIGHT PANEL — TABBED INTERFACE ====== */}
      {(!isMobile || showMobileRight) && (
      <div className="absolute top-[96px] md:top-[110px] right-2 md:right-3 z-30 w-56 md:w-64 bg-[#030406]/95 md:bg-[#030406]/85 backdrop-blur border border-cyan-950/40 rounded-lg overflow-hidden">
        {/* Tabs */}
        <div className="grid grid-cols-4 border-b border-cyan-950/40">
          {[
            { key: "intel" as const, label: "INTEL", count: tabCounts.intel },
            { key: "tactical" as const, label: "TACTICAL", count: tabCounts.tactical },
            { key: "sensors" as const, label: "SENSORS", count: tabCounts.sensors },
            { key: "target" as const, label: "TARGET", count: tabCounts.target },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRightPanelTab(tab.key)}
              className={`py-1.5 px-1 text-[8px] font-mono font-bold uppercase tracking-wider flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                rightPanelTab === tab.key
                  ? "text-cyan-400 bg-cyan-950/10 border-b-2 border-b-cyan-500"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[7px] text-slate-600">[{tab.count}]</span>
            </button>
          ))}
        </div>

        {/* Panel Content */}
        <div className="p-2 max-h-[280px] overflow-y-auto custom-scrollbar">
          {rightPanelTab === "intel" && (
            <div className="space-y-1.5">
              {livePoints.filter(p => p.kind === 'news').length > 0 && (
                <>
                  <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                    <Wifi className="w-2.5 h-2.5" /> Live News Feed
                  </div>
                  {livePoints.filter(p => p.kind === 'news').slice(0, 6).map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => setSelectedLivePoint(pt)}
                      className="w-full flex items-start gap-2 px-2 py-1.5 rounded bg-emerald-950/10 border border-emerald-900/30 hover:border-emerald-900/60 hover:bg-emerald-950/20 transition-all text-left cursor-pointer"
                    >
                      <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${pt.severity === 'critical' ? 'bg-rose-500' : pt.severity === 'warning' ? 'bg-amber-500' : 'bg-emerald-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-mono text-slate-200 truncate">{pt.title}</div>
                        <div className="flex items-center gap-1 text-[7px] font-mono text-slate-500">
                          <span className="text-emerald-500 uppercase">{pt.source}</span>
                          {pt.stale && <span className="text-amber-500">· STALE</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1 mt-2">Local Intelligence</div>
              {events.slice(0, 8).map((evt) => (
                <button
                  key={evt.id || evt.title}
                  onClick={() => setSelectedEvent(evt)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded bg-black/30 border border-cyan-950/30 hover:border-cyan-950/60 hover:bg-black/50 transition-all text-left cursor-pointer"
                >
                  <div className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${
                    evt.severity === "critical" ? "bg-rose-500" : evt.severity === "warning" ? "bg-amber-500" : "bg-cyan-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-mono text-slate-200 truncate">{evt.title}</div>
                    <div className="text-[8px] font-mono text-slate-500 truncate">{evt.category} — {evt.severity}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {rightPanelTab === "tactical" && (
            <div className="space-y-1.5">
              {livePoints.filter(p => p.kind === 'flight').length > 0 && (
                <>
                  <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-sky-400 mb-1 flex items-center gap-1">
                    <Plane className="w-2.5 h-2.5" /> Live Aircraft
                  </div>
                  {livePoints.filter(p => p.kind === 'flight').slice(0, 8).map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => setSelectedLivePoint(pt)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-sky-950/10 border border-sky-900/30 hover:border-sky-900/60 hover:bg-sky-950/20 transition-all text-left cursor-pointer"
                    >
                      <Plane className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-mono text-slate-200 truncate">{pt.title}</div>
                        <div className="text-[8px] font-mono text-slate-500 truncate">{pt.detail}</div>
                        <div className="flex items-center gap-1 text-[7px] font-mono text-slate-500">
                          <span className="text-sky-500 uppercase">{pt.source}</span>
                          {pt.stale && <span className="text-amber-500">· STALE</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {livePoints.filter(p => p.kind === 'threat').length > 0 && (
                <>
                  <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-rose-400 mb-1 mt-2 flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" /> Cyber Threats
                  </div>
                  {livePoints.filter(p => p.kind === 'threat').slice(0, 6).map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => setSelectedLivePoint(pt)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-rose-950/10 border border-rose-900/30 hover:border-rose-900/60 hover:bg-rose-950/20 transition-all text-left cursor-pointer"
                    >
                      <Shield className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-mono text-rose-300 truncate">{pt.title}</div>
                        <div className="text-[8px] font-mono text-rose-500/60 truncate">{pt.detail}</div>
                        <div className="flex items-center gap-1 text-[7px] font-mono text-slate-500">
                          <span className="text-rose-500 uppercase">{pt.source}</span>
                          {pt.stale && <span className="text-amber-500">· STALE</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              <div className="flex items-center gap-1.5 mb-1 mt-2">
                <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500">Fleet Assets</span>
                <span className="text-[7px] font-mono uppercase text-amber-500/70" title="Reference positions, not a live tracking feed — real AIS/ADS-B integration isn't wired in yet.">· STATIC REFERENCE DATA</span>
              </div>
              {fleetAssets.filter(a => activeSectors.has(a.sector)).slice(0, 10).map((asset) => {
                const Icon = SECTOR_ICON_MAP[asset.sector];
                const color = SECTOR_COLORS[asset.sector];
                return (
                  <button
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-black/30 border border-cyan-950/30 hover:border-cyan-950/60 hover:bg-black/50 transition-all text-left cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <Icon className="w-2.5 h-2.5 shrink-0" style={{ color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-mono text-slate-200 truncate">{asset.name}</div>
                      <div className="text-[8px] font-mono text-slate-500">{asset.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {rightPanelTab === "sensors" && (
            <div className="space-y-1.5">
              {livePoints.filter(p => p.kind === 'disaster').length > 0 && (
                <>
                  <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5" /> Live Disasters (NASA EONET)
                  </div>
                  {livePoints.filter(p => p.kind === 'disaster').slice(0, 8).map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => setSelectedLivePoint(pt)}
                      className="w-full flex items-start gap-2 px-2 py-1.5 rounded bg-amber-950/10 border border-amber-900/30 hover:border-amber-900/60 hover:bg-amber-950/20 transition-all text-left cursor-pointer"
                    >
                      <Flame className="w-2.5 h-2.5 text-amber-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-mono text-slate-200 truncate">{pt.title}</div>
                        <div className="text-[8px] font-mono text-slate-500 truncate">{pt.detail}</div>
                        <div className="flex items-center gap-1 text-[7px] font-mono text-slate-500">
                          <span className="text-amber-500 uppercase">{pt.source}</span>
                          {pt.stale && <span className="text-amber-500">· STALE</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1 mt-2">Sensor Readings</div>
              {events.filter(e => e.category === "signal" || e.category === "thermal" || e.category === "air").slice(0, 8).map((evt) => (
                <button
                  key={evt.id || evt.title}
                  onClick={() => setSelectedEvent(evt)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded bg-black/30 border border-cyan-950/30 hover:border-cyan-950/60 hover:bg-black/50 transition-all text-left cursor-pointer"
                >
                  <Radio className="w-2.5 h-2.5 text-cyan-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-mono text-slate-200 truncate">{evt.title}</div>
                    <div className="text-[8px] font-mono text-slate-500">{evt.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {rightPanelTab === "target" && (
            <div className="space-y-1.5">
              {livePoints.filter(p => p.severity === 'critical').length > 0 && (
                <>
                  <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-rose-400 mb-1 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> Live Critical Alerts
                  </div>
                  {livePoints.filter(p => p.severity === 'critical').slice(0, 6).map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => setSelectedLivePoint(pt)}
                      className="w-full flex items-start gap-2 px-2 py-1.5 rounded bg-rose-950/10 border border-rose-900/30 hover:border-rose-900/60 hover:bg-rose-950/20 transition-all text-left cursor-pointer"
                    >
                      <Target className="w-2.5 h-2.5 text-rose-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-mono text-rose-300 truncate">{pt.title}</div>
                        <div className="text-[8px] font-mono text-rose-500/60 truncate">{pt.detail}</div>
                        <div className="flex items-center gap-1 text-[7px] font-mono text-slate-500">
                          <span className="text-rose-500 uppercase">{pt.source}</span>
                          {pt.stale && <span className="text-amber-500">· STALE</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1 mt-2">Critical Targets</div>
              {events.filter(e => e.severity === "critical").slice(0, 8).map((evt) => (
                <button
                  key={evt.id || evt.title}
                  onClick={() => setSelectedEvent(evt)}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded bg-rose-950/10 border border-rose-900/30 hover:border-rose-900/60 hover:bg-rose-950/20 transition-all text-left cursor-pointer"
                >
                  <Target className="w-2.5 h-2.5 text-rose-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-mono text-rose-300 truncate">{evt.title}</div>
                    <div className="text-[8px] font-mono text-rose-500/60">{evt.category} — {evt.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ====== CAMERA ORIENTATION CONTROL (bottom-left) ====== */}
      <div className="hidden md:block absolute bottom-[60px] left-3 z-[35] w-48 bg-[#030406]/85 backdrop-blur border border-cyan-950/40 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-cyan-950/40">
          <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Camera className="w-3 h-3" />
            Camera Orientation Control
          </div>
        </div>
        <div className="p-3 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono text-slate-400 uppercase">TILT</span>
              <span className="text-[8px] font-mono text-cyan-400">{cameraTilt.toFixed(0)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              value={cameraTilt}
              onChange={(e) => setCameraTilt(Number(e.target.value))}
              className="w-full h-1 bg-cyan-950/50 rounded-full appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono text-slate-400 uppercase">HEADING</span>
              <span className="text-[8px] font-mono text-cyan-400">{cameraHeading.toFixed(0)}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={cameraHeading}
              onChange={(e) => setCameraHeading(Number(e.target.value))}
              className="w-full h-1 bg-cyan-950/50 rounded-full appearance-none cursor-pointer accent-cyan-400"
            />
          </div>
        </div>
      </div>

      {/* ====== SECTOR TOGGLE BAR (above bottom status) ====== */}
      <div className="absolute bottom-[36px] md:bottom-[41px] left-0 right-0 z-20">
        <SectorToggleBar activeSectors={activeSectors} onToggle={toggleSector} />
      </div>

      {/* ====== BOTTOM STATUS BAR ====== */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-2 md:px-4 py-1.5 md:py-2 bg-[#030406]/90 backdrop-blur border-t border-cyan-950/60">
        <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
          <div className="flex items-center gap-1 md:gap-1.5 text-[8px] md:text-[9px] font-mono text-emerald-400 shrink-0">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden md:inline">AXE CORE ACTIVE</span>
            <span className="md:hidden">ACTIVE</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            {[
              { key: 'opensky', label: 'OPENSKY', color: 'text-sky-400' },
              { key: 'nasa', label: 'NASA', color: 'text-amber-400' },
              { key: 'greynoise', label: 'GREYNOISE', color: 'text-rose-400' },
              { key: 'exa', label: 'EXA', color: 'text-emerald-400' },
            ].map(src => {
              const hasData = livePoints.some(p => p.source === src.key);
              const hasError = liveErrors[src.key];
              return (
                <span
                  key={src.key}
                  className={`text-[8px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    hasError
                      ? 'text-slate-600 border-slate-800 line-through'
                      : hasData
                      ? `${src.color} border-current/30 bg-current/5`
                      : 'text-slate-700 border-slate-800'
                  }`}
                  title={hasError ? `Error: ${liveErrors[src.key]}` : hasData ? 'Live data active' : 'No data'}
                >
                  {src.label}
                </span>
              );
            })}
          </div>
          <div className="text-[8px] md:text-[9px] font-mono text-slate-500 hidden md:block">
            Ollama <span className={ollamaStatus ? "text-emerald-400" : "text-rose-400"}>{ollamaVersion}</span>
          </div>
          <div className="text-[8px] md:text-[9px] font-mono text-slate-500 shrink-0">
            CPU: <span className="text-cyan-400">{cpuUsage}%</span>
          </div>
          <div className="text-[8px] md:text-[9px] font-mono text-slate-500 shrink-0">
            <span className="hidden md:inline">LATENCY: </span><span className="text-cyan-400">{latency}ms</span>
          </div>
          {lastUpdated && (
            <div className="hidden md:block text-[8px] font-mono text-slate-600">
              UPDATED: {new Date(lastUpdated).toLocaleTimeString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <button
            onClick={() => setIsSoundEnabled((prev) => !prev)}
            className="p-1 rounded hover:bg-black/40 text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
            title="Toggle Audio"
          >
            {isSoundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="hidden md:block p-1 rounded hover:bg-black/40 text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="w-3 h-3" />
          </button>
          <button
            onClick={() => { fetchEvents(); fetchLiveData(); }}
            className="flex items-center gap-1 px-2 py-0.5 bg-cyan-950/20 hover:bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 rounded text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${loading || liveLoading ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">Scan</span>
          </button>
          <button
            onClick={handleScreenshot}
            className="hidden md:flex items-center gap-1 px-2 py-0.5 bg-black/40 hover:bg-slate-900/60 border border-cyan-950/50 text-slate-300 rounded text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <Camera className="w-2.5 h-2.5" />
            Capture
          </button>
        </div>
      </div>

      {/* ====== LIVE POINT DETAIL MODAL ====== */}
      {selectedLivePoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedLivePoint(null)}>
          <div className="bg-[#030406] border border-cyan-950/80 rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-cyan-950/60 flex items-center justify-between">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5" /> Live Intel
              </h3>
              <button onClick={() => setSelectedLivePoint(null)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Title</span>
                <p className="text-sm text-white font-semibold">{selectedLivePoint.title}</p>
              </div>
              {selectedLivePoint.detail && (
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Detail</span>
                  <p className="text-xs text-slate-300 leading-relaxed">{selectedLivePoint.detail}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Kind</span>
                  <span className="text-cyan-400 font-bold uppercase">{selectedLivePoint.kind}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Source</span>
                  <span className="text-emerald-400 font-bold uppercase">{selectedLivePoint.source}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Severity</span>
                  <span className={`font-bold ${
                    selectedLivePoint.severity === "critical" ? "text-rose-400" :
                    selectedLivePoint.severity === "warning" ? "text-amber-400" : "text-cyan-400"
                  }`}>{selectedLivePoint.severity.toUpperCase()}</span>
                </div>
                <div className="bg-black/40 border border-cyan-950/40 rounded p-2">
                  <span className="text-slate-500 block">Time</span>
                  <span className="text-slate-200">{selectedLivePoint.timestamp}</span>
                </div>
              </div>
              {Object.keys(selectedLivePoint.metadata ?? {}).length > 0 && (
                <div className="text-[9px] font-mono text-slate-500 pt-2 border-t border-cyan-950/40 space-y-0.5">
                  {Object.entries(selectedLivePoint.metadata!).map(([k, v]) => (
                    <div key={k}><span className="text-slate-600">{k}:</span> <span className="text-slate-400">{String(v)}</span></div>
                  ))}
                </div>
              )}
              <div className="text-[9px] font-mono text-slate-500 pt-2 border-t border-cyan-950/40">
                COORDINATES: {selectedLivePoint.lat.toFixed(4)}, {selectedLivePoint.lon.toFixed(4)}
                {selectedLivePoint.stale && <span className="text-amber-500 ml-2">· STALE DATA</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== EVENT DETAIL MODAL ====== */}
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

      {/* ====== ASSET DETAIL MODAL ====== */}
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
                { key: "Ctrl+D", desc: "Toggle debug console" },
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
