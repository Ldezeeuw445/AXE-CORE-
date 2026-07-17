import React, { useState, useEffect } from "react";
import { ChoicePoint } from "@/lib/maps3d/types";
import {
  MapPin,
  Target,
  Plus,
  Trash2,
  Crosshair,
  AlertTriangle,
  Compass,
  Eye,
  Layers,
  Sparkles,
  Route,
  X,
} from "lucide-react";

const WAYPOINT_TYPES = [
  { value: "waypoint" as const, label: "Waypoint", icon: Compass, color: "text-blue-400 border-blue-500/30 bg-blue-950/20" },
  { value: "observation" as const, label: "Observation Post", icon: Eye, color: "text-cyan-400 border-cyan-500/30 bg-cyan-950/20" },
  { value: "rendezvous" as const, label: "Rendezvous Point", icon: Layers, color: "text-purple-400 border-purple-500/30 bg-purple-950/20" },
  { value: "extraction" as const, label: "Extraction Zone", icon: Sparkles, color: "text-green-400 border-green-500/30 bg-green-950/20" },
  { value: "target" as const, label: "Target Alpha", icon: Target, color: "text-orange-400 border-orange-500/30 bg-orange-950/20" },
  { value: "hazard" as const, label: "Hazard Area", icon: AlertTriangle, color: "text-red-400 border-red-500/30 bg-red-950/20" },
];

const PRESET_COLORS = [
  { name: "Cyan Spark", value: "#22d3ee" },
  { name: "Neon Green", value: "#4ade80" },
  { name: "Glow Purple", value: "#c084fc" },
  { name: "War Orange", value: "#fb923c" },
  { name: "Danger Red", value: "#f87171" },
  { name: "Deep Blue", value: "#60a5fa" }
];

const INITIAL_POINTS: ChoicePoint[] = [
  {
    id: "cp-1",
    label: "Midtown Watchpoint",
    type: "observation",
    lat: 40.7580,
    lng: -73.9855,
    color: "#22d3ee",
    description: "Primary visual monitoring post on Midtown Manhattan grid cluster.",
    createdAt: new Date().toISOString()
  },
  {
    id: "cp-2",
    label: "Central Park LZ Alpha",
    type: "extraction",
    lat: 40.7829,
    lng: -73.9654,
    color: "#4ade80",
    description: "Open-field secondary rotary extraction landing zone.",
    createdAt: new Date().toISOString()
  },
  {
    id: "cp-3",
    label: "Hudson River Safehouse",
    type: "rendezvous",
    lat: 40.7484,
    lng: -74.0070,
    color: "#c084fc",
    description: "Subterranean backup hub for tactical agents.",
    createdAt: new Date().toISOString()
  }
];

export function ChoicePointsPanel() {
  const [choicePoints, setChoicePoints] = useState<ChoicePoint[]>(() => {
    try {
      const saved = localStorage.getItem("axe_choice_points");
      return saved ? JSON.parse(saved) : INITIAL_POINTS;
    } catch {
      return INITIAL_POINTS;
    }
  });
  const [activeTab, setActiveTab] = useState<"list" | "deploy">("list");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<ChoicePoint["type"]>("waypoint");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.setItem("axe_choice_points", JSON.stringify(choicePoints));
  }, [choicePoints]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!label.trim()) {
      setError("Waypoint identifier code required.");
      return;
    }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setError("Valid numerical coordinate values required.");
      return;
    }
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      setError("Coordinate range limits exceeded.");
      return;
    }
    const point: ChoicePoint = {
      id: `cp-${Date.now()}`,
      label: label.trim(),
      type,
      lat: parsedLat,
      lng: parsedLng,
      color,
      description: description.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    setChoicePoints(prev => [...prev, point]);
    setLabel("");
    setDescription("");
    setLat("");
    setLng("");
    setActiveTab("list");
  };

  const handleDelete = (id: string) => {
    setChoicePoints(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col bg-[#050608]/95 border border-cyan-950/80 rounded-xl overflow-hidden shadow-2xl relative select-none font-mono">
      <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/80 to-cyan-500/20" />
      <div className="p-3 bg-[#030406] border-b border-cyan-950/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: "12s" }} />
          <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">Tactical Waypoints</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-emerald-500 tracking-wider font-bold">READY</span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-cyan-950/80 bg-black/60 shrink-0">
        <button
          onClick={() => setActiveTab("list")}
          className={`py-2 px-1 text-[9px] uppercase font-bold tracking-widest border-r border-cyan-950/50 transition-all flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === "list"
              ? "text-cyan-400 bg-cyan-950/10 border-b-2 border-b-cyan-500"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Waypoints ({choicePoints.length})
        </button>
        <button
          onClick={() => setActiveTab("deploy")}
          className={`py-2 px-1 text-[9px] uppercase font-bold tracking-widest transition-all flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === "deploy"
              ? "text-cyan-400 bg-cyan-950/10 border-b-2 border-b-cyan-500"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Plus className="w-3.5 h-3.5" /> Deploy Unit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0">
        {activeTab === "list" && (
          <div className="space-y-2">
            {choicePoints.length === 0 ? (
              <div className="text-center py-8 text-slate-600 font-mono text-[9px] uppercase border border-dashed border-cyan-950/40 rounded-lg">
                No waypoints deployed
              </div>
            ) : (
              choicePoints.map((cp) => (
                <div key={cp.id} className="bg-[#030406]/90 border border-cyan-950/50 p-2.5 rounded-lg space-y-1.5 transition-all hover:border-cyan-500/30 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" style={{ color: cp.color }} />
                      <span className="text-[10px] font-bold text-white tracking-wide">{cp.label}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(cp.id)}
                      className="p-0.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-[8px] text-slate-500 font-mono">
                    {cp.lat.toFixed(4)}, {cp.lng.toFixed(4)} — {cp.type}
                  </div>
                  {cp.description && (
                    <p className="text-[9px] text-slate-400 leading-normal pt-1 border-t border-cyan-950/30">{cp.description}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "deploy" && (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-2 bg-rose-950/20 border border-rose-500/30 rounded text-[10px] text-rose-400 font-mono flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Waypoint Label</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Enter identifier..."
                className="w-full bg-black border border-cyan-950 rounded px-2 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Latitude</label>
                <input
                  type="text"
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  placeholder="40.7580"
                  className="w-full bg-black border border-cyan-950 rounded px-2 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Longitude</label>
                <input
                  type="text"
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  placeholder="-73.9855"
                  className="w-full bg-black border border-cyan-950 rounded px-2 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Type</label>
              <div className="grid grid-cols-3 gap-1">
                {WAYPOINT_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded border text-[9px] font-mono transition-all cursor-pointer ${
                        type === t.value
                          ? `${t.color} font-bold`
                          : "border-cyan-950/40 text-slate-400 hover:text-slate-300"
                      }`}
                    >
                      <Icon className="w-3 h-3" /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Marker Color</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                      color === c.value ? "border-white scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Description (Optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Mission notes..."
                rows={2}
                className="w-full bg-black border border-cyan-950 rounded px-2 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-cyan-950/20 hover:bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Deploy Waypoint
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
