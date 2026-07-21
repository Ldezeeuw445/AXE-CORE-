import { useState } from "react";
import type { CityConfig } from "@/domain/maps3d/types";
import { Compass, Navigation, Info } from "lucide-react";

interface CitySelectorProps {
  selectedCity: CityConfig;
  onSelectCity: (city: CityConfig) => void;
  onCustomCoordinate: (lat: number, lng: number, name: string) => void;
}

export function CitySelector({ selectedCity, onCustomCoordinate }: CitySelectorProps) {
  const [customLat, setCustomLat] = useState("");
  const [customLng, setCustomLng] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState("");

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const lat = parseFloat(customLat);
    const lng = parseFloat(customLng);
    const name = customName.trim() || "Custom Monitor Zone";

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }

    onCustomCoordinate(lat, lng, name);
    setCustomLat("");
    setCustomLng("");
    setCustomName("");
  };

  return (
    <div className="bg-[#050608]/95 border border-cyan-950/80 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full font-mono select-none">
      <div className="p-4 bg-[#030406] border-b border-cyan-950/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: "15s" }} />
          <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">Target Coordinator</h2>
        </div>
        <span className="text-[10px] bg-cyan-950/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded">
          AXE_COORD v3.0
        </span>
      </div>

      <div className="p-4 space-y-4 flex-grow overflow-y-auto bg-black/30">
        <form onSubmit={handleCustomSubmit} className="space-y-3">
          <label className="text-[9px] uppercase tracking-widest text-slate-400 block flex items-center gap-1.5">
            Manual Coordinates Entry
          </label>
          <div className="space-y-2.5">
            <div>
              <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-1">Zone name</label>
              <input
                type="text"
                placeholder="Zone Name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/40 px-3 py-1.5 rounded text-xs focus:outline-none transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-1">Latitude</label>
                <input
                  type="text"
                  placeholder="e.g. 34.05"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  required
                  className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/40 px-3 py-1.5 rounded text-xs focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-1">Longitude</label>
                <input
                  type="text"
                  placeholder="e.g. -118.2"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  required
                  className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/40 px-3 py-1.5 rounded text-xs focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>
          {error && <p className="text-[10px] text-rose-400">{error}</p>}
          <button
            type="submit"
            className="w-full bg-cyan-950/30 hover:bg-cyan-500 hover:text-black text-cyan-400 border border-cyan-500/20 hover:border-cyan-400 rounded py-1.5 text-[10px] uppercase tracking-widest transition-all font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" /> Set Monitor Zone
          </button>
        </form>

        <div className="bg-[#030406]/90 border border-cyan-950/80 rounded-lg p-3.5 space-y-2.5 text-xs">
          <h3 className="font-semibold text-slate-200 flex items-center gap-1.5 border-b border-cyan-950/40 pb-1.5 text-[10px] uppercase tracking-widest text-cyan-400">
            <Info className="w-3.5 h-3.5" /> Target Info Brief
          </h3>
          <p className="text-slate-400 leading-relaxed text-[11px] font-sans">{selectedCity.description}</p>
          <div className="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-cyan-950/40 text-[10px] text-slate-400 font-mono">
            <div>
              <span className="text-slate-600 block text-[8px] uppercase tracking-wider">MAP_CENTER_LAT</span>
              <span className="text-cyan-400 font-semibold">{selectedCity.lat.toFixed(5)}°</span>
            </div>
            <div>
              <span className="text-slate-600 block text-[8px] uppercase tracking-wider">MAP_CENTER_LNG</span>
              <span className="text-cyan-400 font-semibold">{selectedCity.lng.toFixed(5)}°</span>
            </div>
            <div>
              <span className="text-slate-600 block text-[8px] uppercase tracking-wider">CAMERA_RANGE</span>
              <span className="text-slate-300 font-semibold">{selectedCity.range}m</span>
            </div>
            <div>
              <span className="text-slate-600 block text-[8px] uppercase tracking-wider">TARGET_SECTOR</span>
              <span className="text-slate-300 font-semibold uppercase">{selectedCity.name.slice(0, 3)}-GRID</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
