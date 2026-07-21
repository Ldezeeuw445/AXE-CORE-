import { useState, useEffect } from "react";
import type { ChoicePoint } from "@/domain/maps3d/types";
import {
  MapPin,
  Target,
  Plus,
  Trash2,
  Crosshair,
  AlertTriangle,
  Compass,
  Eye,
  Upload,
  Info,
  Layers,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TacticalMatrixPanelProps {
  choicePoints: ChoicePoint[];
  onAddPoint: (point: Omit<ChoicePoint, "id" | "createdAt">) => void;
  onDeletePoint: (id: string) => void;
  onLocatePoint: (point: ChoicePoint) => void;
  clickedLatLng: { lat: number; lng: number } | null;
  onClearClickedLatLng: () => void;
}

const WAYPOINT_TYPES = [
  { value: "waypoint", label: "Waypoint", icon: Compass, color: "text-blue-400 border-blue-500/30 bg-blue-950/20" },
  { value: "observation", label: "Observation Post", icon: Eye, color: "text-cyan-400 border-cyan-500/30 bg-cyan-950/20" },
  { value: "rendezvous", label: "Rendezvous Point", icon: Layers, color: "text-purple-400 border-purple-500/30 bg-purple-950/20" },
  { value: "extraction", label: "Extraction Zone", icon: Sparkles, color: "text-green-400 border-green-500/30 bg-green-950/20" },
  { value: "target", label: "Target Alpha", icon: Target, color: "text-orange-400 border-orange-500/30 bg-orange-950/20" },
  { value: "hazard", label: "Hazard Area", icon: AlertTriangle, color: "text-red-400 border-red-500/30 bg-red-950/20" },
];

const PRESET_COLORS = [
  { name: "Cyan Spark", value: "#22d3ee" },
  { name: "Neon Green", value: "#4ade80" },
  { name: "Glow Purple", value: "#c084fc" },
  { name: "War Orange", value: "#fb923c" },
  { name: "Danger Red", value: "#f87171" },
  { name: "Deep Blue", value: "#60a5fa" },
];

export function TacticalMatrixPanel({
  choicePoints,
  onAddPoint,
  onDeletePoint,
  onLocatePoint,
  clickedLatLng,
  onClearClickedLatLng,
}: TacticalMatrixPanelProps) {
  const [activeTab, setActiveTab] = useState<"list" | "deploy">("list");

  const [label, setLabel] = useState("");
  const [type, setType] = useState<ChoicePoint["type"]>("waypoint");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (clickedLatLng) {
      setLat(clickedLatLng.lat.toFixed(6));
      setLng(clickedLatLng.lng.toFixed(6));
      setActiveTab("deploy");
    }
  }, [clickedLatLng]);

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

    onAddPoint({
      label: label.trim(),
      type,
      lat: parsedLat,
      lng: parsedLng,
      color,
      description: description.trim() || undefined,
    });

    setLabel("");
    setDescription("");
    onClearClickedLatLng();
    setActiveTab("list");
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(choicePoints, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `axe_tactical_waypoints_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCSV = () => {
    if (choicePoints.length === 0) return;
    const headers = ["ID", "Label", "Type", "Latitude", "Longitude", "Color", "Description", "CreatedAt"];
    const rows = choicePoints.map((p) => [
      p.id,
      `"${p.label.replace(/"/g, '""')}"`,
      p.type,
      p.lat,
      p.lng,
      p.color,
      `"${(p.description || "").replace(/"/g, '""')}"`,
      p.createdAt,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," + encodeURIComponent([headers.join(","), ...rows.map((e) => e.join(","))].join("\n"));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", csvContent);
    downloadAnchor.setAttribute("download", `axe_tactical_waypoints_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const validPoints = parsed.filter((p) => p.label && p.type && typeof p.lat === "number" && typeof p.lng === "number");
          validPoints.forEach((p) => {
            onAddPoint({
              label: p.label,
              type: p.type,
              lat: p.lat,
              lng: p.lng,
              color: p.color || "#22d3ee",
              description: p.description,
            });
          });
        }
      } catch (err) {
        console.error("Failed to parse waypoints JSON import:", err);
      }
    };
    fileReader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#050608]/95 border border-cyan-950/80 rounded-xl overflow-hidden shadow-2xl relative select-none font-mono">
      <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500/20 via-cyan-500/80 to-cyan-500/20" />

      <div className="p-4 bg-[#030406] border-b border-cyan-950/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: "12s" }} />
          <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase">TACTICAL WAYPOINTS MATRIX</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-emerald-500 tracking-wider font-bold">READY</span>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-cyan-950/80 bg-black/60 shrink-0">
        <button
          onClick={() => setActiveTab("list")}
          className={`py-2 px-3 text-[10px] uppercase font-bold tracking-widest border-r border-cyan-950/50 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "list" ? "text-cyan-400 bg-cyan-950/10 border-b-2 border-b-cyan-500" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Waypoints ({choicePoints.length})
        </button>
        <button
          onClick={() => setActiveTab("deploy")}
          className={`py-2 px-3 text-[10px] uppercase font-bold tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
            activeTab === "deploy" ? "text-cyan-400 bg-cyan-950/10 border-b-2 border-b-cyan-500" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Plus className="w-3.5 h-3.5" /> Deploy Unit
          {clickedLatLng && (
            <span className="absolute top-1 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 bg-black/30">
        <AnimatePresence mode="wait">
          {activeTab === "list" ? (
            <motion.div
              key="list-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="flex-grow flex flex-col h-full space-y-3"
            >
              <div className="flex items-center justify-between gap-2 shrink-0 pb-1 border-b border-cyan-950/40">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">ACTIVE WAYPOINT RECORDS</span>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-600 font-mono">EXPORT:</span>
                  <button
                    onClick={handleExport}
                    disabled={choicePoints.length === 0}
                    className="px-1.5 py-0.5 text-[8px] font-mono font-bold text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/20 border border-cyan-950/80 rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                    title="Export waypoint coordinates to JSON file"
                  >
                    JSON
                  </button>
                  <button
                    onClick={handleExportCSV}
                    disabled={choicePoints.length === 0}
                    className="px-1.5 py-0.5 text-[8px] font-mono font-bold text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/20 border border-cyan-950/80 rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed uppercase"
                    title="Export waypoint coordinates to CSV file"
                  >
                    CSV
                  </button>
                  <label
                    className="p-1 text-slate-500 hover:text-cyan-400 hover:bg-cyan-950/20 border border-transparent hover:border-cyan-950 rounded transition-all cursor-pointer"
                    title="Import waypoints from JSON file"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                  </label>
                </div>
              </div>

              {choicePoints.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-cyan-950/40 rounded-lg bg-black/40">
                  <MapPin className="w-8 h-8 text-cyan-950 mb-2 animate-bounce" />
                  <p className="text-[11px] text-slate-400 leading-relaxed max-w-[200px]">
                    No planning waypoints loaded. Switch to <strong className="text-cyan-400">Deploy Unit</strong> tab or{" "}
                    <strong className="text-cyan-400">click anywhere on the map</strong> to deploy coordinates.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {choicePoints.map((point) => {
                    const typeConfig = WAYPOINT_TYPES.find((t) => t.value === point.type) || WAYPOINT_TYPES[0];
                    const TypeIcon = typeConfig.icon;
                    return (
                      <div
                        key={point.id}
                        className="group p-3 bg-[#07090d]/90 hover:bg-[#0c0f17] border border-cyan-950/50 hover:border-cyan-500/40 rounded-lg flex items-start gap-2.5 transition-all shadow-md relative"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md" style={{ backgroundColor: point.color }} />

                        <div className={`p-1.5 border rounded-md shrink-0 flex items-center justify-center ${typeConfig.color}`}>
                          <TypeIcon className="w-3.5 h-3.5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[11px] font-bold text-white uppercase truncate tracking-wide">{point.label}</span>
                            <span className="text-[8px] text-slate-500 font-mono self-start mt-0.5 shrink-0">
                              {new Date(point.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div className="text-[9px] text-slate-400 mt-1 flex items-center gap-1 bg-black/30 px-1.5 py-0.5 rounded border border-cyan-950/40 w-fit font-mono">
                            <MapPin className="w-2.5 h-2.5 text-cyan-500 shrink-0" />
                            <span className="truncate">
                              {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                            </span>
                          </div>

                          {point.description && (
                            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed bg-black/15 px-2 py-1 rounded border-l border-cyan-950/30">
                              {point.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 self-center opacity-85 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onLocatePoint(point)}
                            className="p-1 bg-cyan-950/20 hover:bg-cyan-500 hover:text-black text-cyan-400 border border-cyan-500/20 hover:border-cyan-400 rounded transition-all cursor-pointer"
                            title="Fly camera to waypoint coordinate"
                          >
                            <Crosshair className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => onDeletePoint(point.id)}
                            className="p-1 bg-red-950/20 hover:bg-red-500 hover:text-white text-red-400 border border-red-500/20 hover:border-red-400 rounded transition-all cursor-pointer"
                            title="Delete waypoint"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="deploy-tab"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="flex-grow flex flex-col"
            >
              <form onSubmit={handleSubmit} className="space-y-3 flex-1 flex flex-col min-h-0">
                {clickedLatLng ? (
                  <div className="p-2.5 bg-cyan-950/30 border border-cyan-500/40 rounded-lg text-[10px] text-cyan-300 leading-relaxed flex items-start gap-2 animate-pulse shrink-0">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white">Coordinate Registered</strong>
                      <p className="text-cyan-400/80">Map click registered! Lat/Lng automatically mapped to active fields. Customize details below to deploy.</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-[#07090d]/80 border border-cyan-950/50 rounded-lg text-[9px] text-slate-400 leading-relaxed flex items-start gap-2 shrink-0">
                    <Info className="w-4 h-4 text-cyan-500/40 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-cyan-400 font-bold">PRO-TIP:</span> Click anywhere on the 3D or 2D map to automatically capture specific latitude/longitude coordinates directly.
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Waypoint Code / Identifier *</label>
                    <input
                      type="text"
                      placeholder="e.g. ALPHA POINT, EX-FIL CHARLIE"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/40 px-3 py-1.5 rounded text-[11px] focus:outline-none transition-all uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Objective Purpose</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {WAYPOINT_TYPES.map((t) => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setType(t.value as ChoicePoint["type"])}
                            className={`p-1.5 border rounded text-[9px] flex items-center gap-1.5 cursor-pointer transition-all ${
                              type === t.value
                                ? "border-cyan-500 bg-cyan-950/20 text-cyan-400"
                                : "border-cyan-950/40 bg-black/20 text-slate-500 hover:text-slate-300 hover:border-cyan-950/80"
                            }`}
                          >
                            <Icon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Latitude *</label>
                      <input
                        type="text"
                        placeholder="e.g. 40.7580"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/40 px-3 py-1.5 rounded text-[11px] focus:outline-none transition-all font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Longitude *</label>
                      <input
                        type="text"
                        placeholder="e.g. -73.9855"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/40 px-3 py-1.5 rounded text-[11px] focus:outline-none transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1.5">Glow Color Indicator</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setColor(c.value)}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-95 ${
                            color === c.value ? "border-white" : "border-transparent"
                          }`}
                          style={{ backgroundColor: c.value }}
                          title={c.name}
                        >
                          {color === c.value && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase tracking-widest mb-1">Objective / Instructions</label>
                    <textarea
                      placeholder="Enter tactical operations brief or mission objective detail..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-black/60 border border-cyan-950/80 focus:border-cyan-500 text-cyan-300 placeholder-cyan-900/30 px-3 py-1.5 rounded text-[11px] focus:outline-none transition-all resize-none"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-2 bg-red-950/20 border border-red-500/40 rounded text-[10px] text-red-400 flex items-center gap-1.5 shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-black py-2 rounded font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-cyan-500/10 cursor-pointer transition-all active:scale-[0.98] mt-2 shrink-0 flex items-center justify-center gap-2"
                >
                  <Crosshair className="w-4 h-4" /> Deploy Waypoint Matrix
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
