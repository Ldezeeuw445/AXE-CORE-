import React, { useState } from "react";
import { CityConfig } from "@/domain/maps3d/types";
import { FEATURED_CITIES } from "@/domain/maps3d/constants";
import { Globe, ChevronDown, Check } from "lucide-react";

interface CitySelectorProps {
  selectedCity: CityConfig;
  onSelectCity: (city: CityConfig) => void;
}

export function CitySelector({ selectedCity, onSelectCity }: CitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative font-sans select-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-[#030406]/95 border border-cyan-950/80 hover:border-cyan-500/40 px-3 py-2 rounded-lg text-cyan-400 transition-all cursor-pointer min-w-[160px]"
      >
        <Globe className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: "20s" }} />
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider">{selectedCity.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-[#030406] border border-cyan-950/80 rounded-lg shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-cyan-950/60">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500">Target Presets</span>
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {FEATURED_CITIES.map((city) => (
                <button
                  key={city.name}
                  onClick={() => {
                    onSelectCity(city);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-all hover:bg-cyan-950/20 cursor-pointer ${
                    city.name === selectedCity.name ? "bg-cyan-950/20 border-l-2 border-l-cyan-400" : "border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-slate-200">{city.name}</span>
                    <span className="text-[9px] text-slate-500 font-mono">{city.country} — [{city.lat.toFixed(2)}, {city.lng.toFixed(2)}]</span>
                  </div>
                  {city.name === selectedCity.name && (
                    <Check className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
