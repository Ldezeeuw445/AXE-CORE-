import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FEATURED_CITIES } from "@/domain/maps3d/constants";
import type { CityConfig, ChoicePoint, ToastItem } from "@/domain/maps3d/types";
import { CitySelector } from "@/presentation/components/maps3d/CitySelector";
import { WeatherWidget } from "@/presentation/components/maps3d/WeatherWidget";
import { OSINTPanel } from "@/presentation/components/maps3d/OSINTPanel";
import { MapsViewer } from "@/presentation/components/maps3d/MapsViewer";
import { TacticalMatrixPanel } from "@/presentation/components/maps3d/TacticalMatrixPanel";
import { Shield, Activity, Radio, Wifi, Terminal, Clock, Globe, Crosshair } from "lucide-react";

const INITIAL_CHOICE_POINTS: ChoicePoint[] = [
  {
    id: "cp-1",
    label: "Midtown Watchpoint",
    type: "observation",
    lat: 40.758,
    lng: -73.9855,
    color: "#22d3ee",
    description: "Primary visual monitoring post on Midtown Manhattan grid cluster.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cp-2",
    label: "Central Park LZ Alpha",
    type: "extraction",
    lat: 40.7829,
    lng: -73.9654,
    color: "#4ade80",
    description: "Open-field secondary rotary extraction landing zone.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cp-3",
    label: "Hudson River Safehouse",
    type: "rendezvous",
    lat: 40.7484,
    lng: -74.007,
    color: "#c084fc",
    description: "Subterranean backup hub for tactical agents.",
    createdAt: new Date().toISOString(),
  },
];

function Maps3DContent() {
  const [selectedCity, setSelectedCity] = useState<CityConfig>(FEATURED_CITIES[0]);
  const [utcTime, setUtcTime] = useState("");

  const [choicePoints, setChoicePoints] = useState<ChoicePoint[]>(() => {
    try {
      const saved = localStorage.getItem("axe_choice_points");
      return saved ? JSON.parse(saved) : INITIAL_CHOICE_POINTS;
    } catch {
      return INITIAL_CHOICE_POINTS;
    }
  });

  const [clickedLatLng, setClickedLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<"intel" | "tactical" | "weather" | "coord">("intel");

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const isFirstRender = useRef(true);

  const showToast = (message: string, type: ToastItem["type"] = "success") => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  useEffect(() => {
    localStorage.setItem("axe_choice_points", JSON.stringify(choicePoints));
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      showToast("Tactical Waypoints Matrix auto-saved to local browser storage", "success");
    }
  }, [choicePoints]);

  useEffect(() => {
    const updateTime = () => setUtcTime(new Date().toUTCString());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectCity = (city: CityConfig) => {
    setSelectedCity(city);
  };

  const handleCustomCoordinate = (lat: number, lng: number, name: string) => {
    const customCity: CityConfig = {
      name,
      country: "Custom",
      lat,
      lng,
      altitude: 500,
      heading: 0,
      tilt: 45,
      range: 1500,
      description: `A custom-defined OSINT monitor zone centered at coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}.`,
    };
    setSelectedCity(customCity);
  };

  const handleAddChoicePoint = (newPoint: Omit<ChoicePoint, "id" | "createdAt">) => {
    const point: ChoicePoint = {
      ...newPoint,
      id: `cp-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setChoicePoints((prev) => [...prev, point]);
  };

  const handleDeleteChoicePoint = (id: string) => {
    setChoicePoints((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLocateChoicePoint = (point: ChoicePoint) => {
    handleCustomCoordinate(point.lat, point.lng, point.label);
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setClickedLatLng(coords);
    setRightPanelTab("tactical");
  };

  return (
    <div className="h-full bg-black text-slate-100 flex flex-col font-sans select-none selection:bg-cyan-500 selection:text-black relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

      <header className="bg-[#030406]/95 border-b border-cyan-950/80 px-6 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 relative z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-cyan-950/30 border border-cyan-500/40 text-cyan-400 rounded-lg flex items-center justify-center">
            <Radio className="w-4 h-4 animate-pulse text-cyan-400" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black tracking-widest text-white uppercase font-mono flex items-center gap-2">
              AXE GLOBAL SURVEILLANCE FEED
            </h1>
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono">
          <div className="flex items-center gap-1.5 bg-black/60 border border-cyan-950/80 px-2.5 py-1 rounded text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>UTC: {utcTime}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 bg-black/60 border border-cyan-950/80 px-2.5 py-1 rounded text-slate-400">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-400 font-bold uppercase tracking-wider">SECURE LINK</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-black/60 border border-cyan-950/80 px-2.5 py-1 rounded text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>AXE CORE</span>
          </div>
        </div>
      </header>

      <div className="bg-[#030406]/90 border-b border-cyan-950/80 px-6 py-2 overflow-x-auto whitespace-nowrap flex items-center gap-3 shrink-0 scrollbar-none relative z-10">
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1 shrink-0">
          <Globe className="w-3.5 h-3.5 text-cyan-500 animate-spin" style={{ animationDuration: "20s" }} /> Target Presets:
        </span>
        <div className="flex items-center gap-1.5">
          {FEATURED_CITIES.map((city) => {
            const isSelected = city.name === selectedCity.name;
            return (
              <button
                key={city.name}
                onClick={() => handleSelectCity(city)}
                className={`px-3 py-1 rounded border font-mono text-[9px] uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-cyan-500 text-black border-cyan-400 font-extrabold shadow-lg shadow-cyan-500/15"
                    : "bg-black/50 border-cyan-950/60 hover:border-cyan-800 text-slate-300"
                }`}
              >
                <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-black" : "bg-cyan-400 animate-pulse"}`} />
                {city.name}
                <span className={`text-[8px] opacity-60 font-mono ${isSelected ? "text-black" : "text-slate-500"}`}>
                  [{city.lat.toFixed(2)}, {city.lng.toFixed(2)}]
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-grow p-4 md:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto lg:overflow-hidden min-h-0">
        <section className="col-span-1 lg:col-span-9 h-[500px] lg:h-full flex flex-col min-h-0">
          <MapsViewer city={selectedCity} choicePoints={choicePoints} onMapClick={handleMapClick} />
        </section>

        <section className="col-span-1 lg:col-span-3 flex flex-col h-full min-h-0 space-y-3">
          <div className="grid grid-cols-4 bg-[#030406]/95 border border-cyan-950 p-1 rounded-lg shrink-0">
            <button
              onClick={() => setRightPanelTab("intel")}
              className={`py-2 text-[9px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                rightPanelTab === "intel" ? "bg-cyan-500 text-black shadow-md font-extrabold" : "text-slate-400 hover:text-white"
              }`}
              title="OSINT Intelligence Feeds"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Intel</span>
            </button>
            <button
              onClick={() => setRightPanelTab("tactical")}
              className={`py-2 text-[9px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                rightPanelTab === "tactical" ? "bg-cyan-500 text-black shadow-md font-extrabold" : "text-slate-400 hover:text-white"
              }`}
              title="Tactical Waypoints Matrix"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Tactical</span>
              {clickedLatLng && rightPanelTab !== "tactical" && (
                <span className="absolute top-1 right-2 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400"></span>
                </span>
              )}
            </button>
            <button
              onClick={() => setRightPanelTab("weather")}
              className={`py-2 text-[9px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                rightPanelTab === "weather" ? "bg-cyan-500 text-black shadow-md font-extrabold" : "text-slate-400 hover:text-white"
              }`}
              title="Local Atmospheric & Weather Sensors"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Sensors</span>
            </button>
            <button
              onClick={() => setRightPanelTab("coord")}
              className={`py-2 text-[9px] font-mono font-bold uppercase tracking-wider rounded-md transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                rightPanelTab === "coord" ? "bg-cyan-500 text-black shadow-md font-extrabold" : "text-slate-400 hover:text-white"
              }`}
              title="Target Coordinator & Coordinates"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Target</span>
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {rightPanelTab === "intel" ? (
              <OSINTPanel cityName={selectedCity.name} lat={selectedCity.lat} lng={selectedCity.lng} />
            ) : rightPanelTab === "tactical" ? (
              <TacticalMatrixPanel
                choicePoints={choicePoints}
                onAddPoint={handleAddChoicePoint}
                onDeletePoint={handleDeleteChoicePoint}
                onLocatePoint={handleLocateChoicePoint}
                clickedLatLng={clickedLatLng}
                onClearClickedLatLng={() => setClickedLatLng(null)}
              />
            ) : rightPanelTab === "weather" ? (
              <WeatherWidget lat={selectedCity.lat} lng={selectedCity.lng} cityName={selectedCity.name} />
            ) : (
              <CitySelector selectedCity={selectedCity} onSelectCity={handleSelectCity} onCustomCoordinate={handleCustomCoordinate} />
            )}
          </div>
        </section>
      </main>

      <footer className="bg-[#030406] border-t border-cyan-950/80 px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 shrink-0 select-none">
        <div className="flex items-center gap-3.5 flex-wrap">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            AXE CORE ACTIVE
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-cyan-500" />
            3D MAPS + OSINT
          </span>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-2 sm:mt-0">
          <span>Sector: {selectedCity.name}</span>
          <span>•</span>
          <span>Waypoints: {choicePoints.length}</span>
        </div>
      </footer>

      <div className="fixed bottom-16 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: -30, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex items-center gap-3 bg-[#030406]/95 border border-cyan-500/40 shadow-[0_0_25px_rgba(6,182,212,0.15)] px-4 py-3 rounded-lg text-xs font-mono text-cyan-300 backdrop-blur-md"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0 shadow-[0_0_8px_#34d399]" />
              <div className="flex-1">
                <span className="font-bold text-white uppercase block text-[8px] tracking-widest text-cyan-500/80 mb-0.5">LOCAL LOG SYSTEM SYNC</span>
                {toast.message}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Maps3D() {
  return (
    <motion.div className="h-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Maps3DContent />
    </motion.div>
  );
}
