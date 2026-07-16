import { useState, useEffect } from "react";
import {
  AlertTriangle, Activity, Search, Send, Sparkles, ExternalLink,
  FileText, Zap, ShieldAlert, RefreshCw, Radio, Sliders, Plane, Ship,
  Globe, MapPin, Flame, Waves, Eye, EyeOff, ChevronDown, ChevronUp
} from "lucide-react";
import { OSINTEvent, OSINTAnalysisResponse, FleetAsset } from "@/lib/maps3d/types";
import { playClick, playBeep, playSuccess, playWarning } from "@/lib/maps3d/audio";
import { simulateAssetsMovement, STRATEGIC_CHOICE_POINTS, SEISMIC_EVENTS, CORPORATE_JETS, COMMERCIAL_VESSELS } from "@/lib/maps3d/fleetData";

interface OSINTPanelProps {
  cityName: string;
  lat: number;
  lng: number;
  events: OSINTEvent[];
  loadingFeed: boolean;
  feedError: string;
  fetchCityEvents: () => void;
  isDemo: boolean;
  setIsDemo: (d: boolean) => void;
  onCustomCoordinate?: (lat: number, lng: number, name: string) => void;
}

export function OSINTPanel({
  cityName,
  events,
  loadingFeed,
  feedError,
  fetchCityEvents,
  isDemo,
  setIsDemo,
}: OSINTPanelProps) {
  const [activeTab, setActiveTab] = useState<"feed" | "analyst" | "triage" | "fleet">("feed");
  const [analystQuery, setAnalystQuery] = useState("");
  const [analystResponse, setAnalystResponse] = useState<OSINTAnalysisResponse | null>(null);
  const [loadingAnalyst, setLoadingAnalyst] = useState(false);
  const [triageText, setTriageText] = useState("");
  const [triageResponse, setTriageResponse] = useState("");
  const [loadingTriage, setLoadingTriage] = useState(false);
  const [showFleetSidebar, setShowFleetSidebar] = useState(true);
  const [fleetAssets, setFleetAssets] = useState<FleetAsset[]>(() => [
    ...CORPORATE_JETS,
    ...COMMERCIAL_VESSELS,
    ...STRATEGIC_CHOICE_POINTS,
    ...SEISMIC_EVENTS
  ]);
  const [fleetFilter, setFleetFilter] = useState<"all" | "jet" | "vessel" | "choice_point" | "seismic">("all");

  useEffect(() => {
    setAnalystResponse(null);
    setTriageResponse("");
  }, [cityName]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFleetAssets((prev) => simulateAssetsMovement(prev));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleAnalystSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analystQuery.trim()) return;
    playClick();
    setLoadingAnalyst(true);
    setAnalystResponse(null);
    try {
      const response = await fetch("/api/osint/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: analystQuery, city: cityName }),
      });
      if (!response.ok) throw new Error("Analyst uplink failed.");
      const data = await response.json();
      setAnalystResponse(data);
      if (data && typeof data === "object" && "isDemo" in data) setIsDemo(!!data.isDemo);
      playSuccess();
    } catch {
      setAnalystResponse({ analysis: "Transmission failed. Secure channel disconnected. Please retry query.", sources: [] });
      playWarning();
    } finally {
      setLoadingAnalyst(false);
    }
  };

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triageText.trim()) return;
    playClick();
    setLoadingTriage(true);
    setTriageResponse("");
    try {
      const response = await fetch("/api/osint/fast-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentText: triageText }),
      });
      if (!response.ok) throw new Error("Triage connection failed.");
      const data = await response.json();
      setTriageResponse(data.analysis);
      if (data && typeof data === "object" && "isDemo" in data) setIsDemo(!!data.isDemo);
      playSuccess();
    } catch {
      setTriageResponse("Triage system offline. Fast evaluation aborted.");
      playWarning();
    } finally {
      setLoadingTriage(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    if (sev === "critical") return "bg-rose-950/20 border-rose-500/40 text-rose-300";
    if (sev === "warning") return "bg-amber-950/20 border-amber-500/40 text-amber-300";
    return "bg-[#050608] border-cyan-950/60 text-slate-300";
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "traffic": return <MapPin size={12} style={{ color: 'var(--warning)' }} />;
      case "infrastructure": return <Zap size={12} style={{ color: 'var(--accent-cyan)' }} />;
      case "weather": return <Waves size={12} style={{ color: 'var(--accent-blue)' }} />;
      case "incident": return <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />;
      default: return <Activity size={12} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const filteredAssets = fleetAssets.filter((asset) => {
    if (fleetFilter === "all") return true;
    return asset.type === fleetFilter;
  });

  const tabs = [
    { id: "feed" as const, label: "Intel", icon: Activity },
    { id: "analyst" as const, label: "Analyst", icon: Search },
    { id: "triage" as const, label: "Triage", icon: Zap },
    { id: "fleet" as const, label: "Fleet", icon: Globe },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      {/* Panel Tab Bar Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between p-1.5"
        style={{ background: '#030406', borderBottom: '1px solid rgba(34,211,238,0.08)' }}
      >
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { playClick(); setActiveTab(tab.id); }}
              className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
                activeTab === tab.id
                  ? "text-cyan-400"
                  : "text-slate-400 border-transparent hover:text-cyan-300"
              }`}
              style={activeTab === tab.id ? {
                background: 'rgba(34,211,238,0.1)',
                border: '1px solid rgba(34,211,238,0.3)'
              } : {}}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "fleet" && (
          <button
            onClick={() => { playBeep(); setShowFleetSidebar(!showFleetSidebar); }}
            className="p-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1"
            style={{
              background: showFleetSidebar ? 'rgba(34,211,238,0.1)' : 'transparent',
              border: showFleetSidebar ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: showFleetSidebar ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}
          >
            {showFleetSidebar ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        )}
      </div>

      {/* Demo notice banner */}
      {isDemo && (
        <div
          className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 text-[10px] font-mono"
          style={{
            background: 'rgba(245,158,11,0.05)',
            color: 'var(--warning)',
            borderBottom: '1px solid rgba(245,158,11,0.1)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <Sparkles size={10} />
            <span>Demo Mode: Simulated data streams active</span>
          </div>
          <span
            className="text-[8px] font-bold tracking-wide px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.15)',
            }}
          >
            KEY BYPASS
          </span>
        </div>
      )}

      {/* Main Tab Panel Body */}
      <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: 'thin' }}>
        {activeTab === "feed" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Live OSINT Sector Feed</h3>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Real-time sector observations</p>
              </div>
              <button
                onClick={() => { playBeep(); fetchCityEvents(); }}
                disabled={loadingFeed}
                className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded cursor-pointer disabled:opacity-50 flex items-center gap-1"
                style={{
                  background: 'rgba(34,211,238,0.08)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  color: 'var(--accent-cyan)',
                }}
              >
                <RefreshCw size={10} className={loadingFeed ? "animate-spin" : ""} />
                {loadingFeed ? "Syncing..." : "Sync"}
              </button>
            </div>

            {loadingFeed ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="p-4 rounded-xl space-y-2 animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="h-4 rounded w-1/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    <div className="h-3 rounded w-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.03)' }} />
                  </div>
                ))}
              </div>
            ) : feedError ? (
              <div className="text-center py-10 rounded-xl" style={{ background: '#030406', border: '1px solid rgba(255,255,255,0.04)' }}>
                <AlertTriangle size={24} style={{ color: 'var(--warning)' }} className="mx-auto mb-2" />
                <p className="text-xs font-mono" style={{ color: 'var(--danger)' }}>{feedError}</p>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                No active anomalies logged in this sector.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((evt, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-3 transition-all duration-200 relative overflow-hidden ${getSeverityColor(evt.severity)}`}
                    style={{ borderWidth: '1px' }}
                  >
                    <div
                      className="absolute top-0 bottom-0 left-0 w-0.5"
                      style={{
                        background: evt.severity === "critical" ? 'var(--danger)' : evt.severity === "warning" ? 'var(--warning)' : 'var(--accent-cyan)',
                      }}
                    />
                    <div className="pl-2 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {getCategoryIcon(evt.category)}
                          <span className="font-semibold text-xs tracking-wide" style={{ color: 'var(--text-primary)' }}>{evt.title}</span>
                        </div>
                        <span
                          className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded"
                          style={{
                            background: evt.severity === "critical" ? 'rgba(239,68,68,0.1)' : evt.severity === "warning" ? 'rgba(245,158,11,0.1)' : 'rgba(34,211,238,0.1)',
                            color: evt.severity === "critical" ? 'var(--danger)' : evt.severity === "warning" ? 'var(--warning)' : 'var(--accent-cyan)',
                            border: `1px solid ${evt.severity === "critical" ? 'rgba(239,68,68,0.2)' : evt.severity === "warning" ? 'rgba(245,158,11,0.2)' : 'rgba(34,211,238,0.2)'}`,
                          }}
                        >
                          {evt.severity}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{evt.description}</p>
                      {evt.location && (
                        <div className="text-[9px] font-mono flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <span>SECTOR:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{evt.location}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[8px] font-mono pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                        <span>SOURCE: {evt.source.toUpperCase()}</span>
                        <span>{evt.timestamp}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "analyst" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Sparkles size={12} style={{ color: 'var(--accent-cyan)' }} /> AI OSINT Analyst
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Query the AI for deep intelligence analysis</p>
            </div>

            <div className="flex flex-wrap gap-1">
              {["Airport status?", "Port traffic?", "Power grid?", "Geopolitical?"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setAnalystQuery(suggestion)}
                  className="text-[10px] font-mono px-2 py-1 rounded transition-all cursor-pointer"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form onSubmit={handleAnalystSearch} className="flex gap-2">
              <input
                type="text"
                placeholder={`Query ${cityName}...`}
                value={analystQuery}
                onChange={(e) => setAnalystQuery(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={loadingAnalyst || !analystQuery.trim()}
                className="px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                style={{
                  background: 'rgba(34,211,238,0.1)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  color: 'var(--accent-cyan)',
                }}
              >
                {loadingAnalyst ? "..." : <Send size={12} />}
              </button>
            </form>

            {loadingAnalyst ? (
              <div className="p-6 rounded-xl text-center space-y-2" style={{ background: '#030406', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-6 h-6 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--accent-cyan)', borderTopColor: 'transparent' }} />
                <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Analyzing...</p>
              </div>
            ) : analystResponse ? (
              <div className="rounded-lg p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--accent-cyan)' }}>
                  <FileText size={12} /> SECURE INTEL REPORT
                </div>
                <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                  {analystResponse.analysis}
                </div>
                {analystResponse.sources && analystResponse.sources.length > 0 && (
                  <div className="pt-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[9px] font-mono uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>Sources:</span>
                    {analystResponse.sources.map((src, sIdx) => (
                      <a
                        key={sIdx}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] flex items-center gap-1 font-mono truncate"
                        style={{ color: 'var(--accent-cyan)' }}
                      >
                        <ExternalLink size={10} /> {src.title || src.url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 rounded-xl border-dashed" style={{ border: '1px dashed rgba(255,255,255,0.06)' }}>
                <ShieldAlert size={24} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-2" />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter a query to begin analysis</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "triage" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Zap size={12} style={{ color: 'var(--accent-cyan)' }} /> Fast Threat Triage
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Rapid incident assessment</p>
            </div>

            <form onSubmit={handleTriageSubmit} className="space-y-2">
              <textarea
                placeholder="Describe the incident or threat..."
                value={triageText}
                onChange={(e) => setTriageText(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none resize-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'var(--text-primary)',
                  minHeight: '80px',
                }}
              />
              <button
                type="submit"
                disabled={loadingTriage || !triageText.trim()}
                className="w-full py-2 rounded-lg text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40"
                style={{
                  background: 'rgba(34,211,238,0.1)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  color: 'var(--accent-cyan)',
                }}
              >
                {loadingTriage ? "Analyzing..." : "Run Triage"}
              </button>
            </form>

            {triageResponse && (
              <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--accent-cyan)' }}>
                  <FileText size={12} /> TRIAGE REPORT
                </div>
                <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                  {triageResponse}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "fleet" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Global Fleet Monitor</h3>
              <div className="flex gap-1">
                {(["all", "jet", "vessel", "choice_point", "seismic"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFleetFilter(f)}
                    className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded cursor-pointer"
                    style={{
                      background: fleetFilter === f ? 'rgba(34,211,238,0.1)' : 'transparent',
                      border: fleetFilter === f ? '1px solid rgba(34,211,238,0.3)' : '1px solid rgba(255,255,255,0.04)',
                      color: fleetFilter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
                    }}
                  >
                    {f === "choice_point" ? "Points" : f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-lg p-2.5 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${asset.severity === "critical" ? 'rgba(239,68,68,0.2)' : asset.severity === "warning" ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {asset.type === "jet" && <Plane size={12} style={{ color: 'var(--accent-cyan)' }} />}
                      {asset.type === "vessel" && <Ship size={12} style={{ color: 'var(--accent-blue)' }} />}
                      {asset.type === "choice_point" && <MapPin size={12} style={{ color: 'var(--warning)' }} />}
                      {asset.type === "seismic" && <Flame size={12} style={{ color: 'var(--danger)' }} />}
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{asset.name}</div>
                        <div className="text-[9px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{asset.label}</div>
                      </div>
                    </div>
                    <span
                      className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        background: asset.severity === "critical" ? 'rgba(239,68,68,0.1)' : asset.severity === "warning" ? 'rgba(245,158,11,0.1)' : 'rgba(34,211,238,0.05)',
                        color: asset.severity === "critical" ? 'var(--danger)' : asset.severity === "warning" ? 'var(--warning)' : 'var(--accent-cyan)',
                      }}
                    >
                      {asset.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {asset.lat.toFixed(4)}°N, {asset.lng.toFixed(4)}°E
                    {asset.speed && ` • ${asset.speed} knots`}
                    {asset.altitude && ` • ${asset.altitude}ft`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
