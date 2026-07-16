import { useState } from "react";
import { Compass, Globe, MapPin, Navigation, Info, Search, Check, X } from "lucide-react";
import { CityConfig } from "@/lib/maps3d/types";
import { FEATURED_CITIES } from "@/lib/maps3d/constants";

interface CitySelectorProps {
  selectedCity: CityConfig;
  onSelectCity: (city: CityConfig) => void;
  onCustomCoordinate: (lat: number, lng: number, name: string) => void;
}

export function CitySelector({ selectedCity, onSelectCity, onCustomCoordinate }: CitySelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
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

  const filteredCities = FEATURED_CITIES.filter((city) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      city.name.toLowerCase().includes(term) ||
      city.country.toLowerCase().includes(term) ||
      city.description.toLowerCase().includes(term)
    );
  });

  return (
    <div
      className="rounded-xl overflow-hidden shadow-2xl flex flex-col h-full font-mono"
      style={{
        background: 'rgba(5,6,8,0.95)',
        border: '1px solid rgba(34,211,238,0.15)',
        maxHeight: '70vh',
      }}
    >
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between shrink-0"
        style={{ background: '#030406', borderBottom: '1px solid rgba(34,211,238,0.1)' }}
      >
        <div className="flex items-center gap-2">
          <Compass size={16} style={{ color: 'var(--accent-cyan)' }} />
          <h2 className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--accent-cyan)' }}>Target Coordinator</h2>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded"
          style={{
            background: 'rgba(34,211,238,0.08)',
            color: 'var(--accent-cyan)',
            border: '1px solid rgba(34,211,238,0.2)',
          }}
        >
          AXE_COORD v3.2
        </span>
      </div>

      {/* Search */}
      <div className="p-3 shrink-0" style={{ background: 'rgba(0,0,0,0.4)' }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search sectors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded text-xs font-mono focus:outline-none pl-9 pr-8 py-2"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--text-primary)',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-2 text-[9px] font-bold"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 flex-grow overflow-y-auto" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {/* City List */}
        <div className="space-y-2">
          <label className="text-[9px] uppercase tracking-widest font-bold block flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-muted)' }}>
            <Globe size={12} style={{ color: 'var(--accent-cyan)' }} />
            {searchTerm ? "Filtered Targets" : "Sectors Database"}
          </label>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {filteredCities.length === 0 ? (
              <p className="text-[10px] italic py-2 text-center rounded" style={{ color: 'var(--danger)', border: '1px dashed rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
                No matching sectors found.
              </p>
            ) : (
              filteredCities.map((city) => {
                const isSelected = city.name === selectedCity.name;
                return (
                  <button
                    key={city.name}
                    type="button"
                    onClick={() => onSelectCity(city)}
                    className="w-full text-left p-2.5 rounded-lg border font-mono transition-all duration-200 cursor-pointer flex items-center justify-between gap-2"
                    style={{
                      background: isSelected ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)',
                      border: isSelected ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="shrink-0 relative">
                        <MapPin size={14} style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="text-xs font-bold truncate flex items-center gap-1">
                          <span style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>{city.name}</span>
                          <span className="text-[8px] opacity-65 font-normal" style={{ color: 'var(--text-muted)' }}>({city.country})</span>
                        </div>
                        <div className="text-[8.5px] truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
                          {city.description}
                        </div>
                      </div>
                    </div>
                    {isSelected ? (
                      <Check size={14} style={{ color: 'var(--accent-cyan)' }} className="shrink-0" />
                    ) : (
                      <span className="text-[8.5px] font-bold shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>
                        [{city.lat.toFixed(0)}, {city.lng.toFixed(0)}]
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Custom Coord Input */}
        <form onSubmit={handleCustomSubmit} className="space-y-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <label className="text-[9px] uppercase tracking-widest font-bold block" style={{ color: 'var(--text-muted)' }}>
            Manual Coordinates
          </label>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Zone Name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full rounded px-3 py-1.5 text-xs focus:outline-none"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--text-primary)',
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Latitude"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                required
                className="w-full rounded px-3 py-1.5 text-xs focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                placeholder="Longitude"
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                required
                className="w-full rounded px-3 py-1.5 text-xs focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
          {error && <p className="text-[10px]" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button
            type="submit"
            className="w-full rounded py-1.5 text-[10px] uppercase tracking-widest transition-all font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            style={{
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
              color: 'var(--accent-cyan)',
            }}
          >
            <Navigation size={14} /> Set Monitor Zone
          </button>
        </form>

        {/* Selected City Info */}
        <div className="rounded-lg p-3 space-y-2 text-xs" style={{ background: 'rgba(3,4,6,0.9)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <h3 className="font-semibold flex items-center gap-1.5 pb-1.5 text-[10px] uppercase tracking-widest" style={{ color: 'var(--accent-cyan)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <Info size={12} /> Target Info
          </h3>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{selectedCity.description}</p>
          <div className="grid grid-cols-2 gap-2.5 pt-2 text-[10px] font-mono" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
            <div>
              <span className="block text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>LAT</span>
              <span className="font-semibold" style={{ color: 'var(--accent-cyan)' }}>{selectedCity.lat.toFixed(5)}°</span>
            </div>
            <div>
              <span className="block text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>LNG</span>
              <span className="font-semibold" style={{ color: 'var(--accent-cyan)' }}>{selectedCity.lng.toFixed(5)}°</span>
            </div>
            <div>
              <span className="block text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>RANGE</span>
              <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{selectedCity.range}m</span>
            </div>
            <div>
              <span className="block text-[8px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>SECTOR</span>
              <span className="font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{selectedCity.name.slice(0, 3)}-GRID</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
