import { useState, useEffect } from "react";
import type { OSINTEvent, OSINTAnalysisResponse } from "@/domain/maps3d/types";
import {
  AlertTriangle,
  Activity,
  Search,
  Send,
  Sparkles,
  ExternalLink,
  FileText,
  Zap,
  ShieldAlert,
  Server,
  Plane,
  AlertCircle,
  Radio,
  Sliders,
  RefreshCw,
} from "lucide-react";
import { QDENTPanel } from "./QDENTPanel";
import { SeismicPanel } from "./SeismicPanel";
import { ChoicePointsPanel } from "./ChoicePointsPanel";

interface OSINTPanelProps {
  cityName: string;
  lat: number;
  lng: number;
}

export function OSINTPanel({ cityName, lat, lng }: OSINTPanelProps) {
  const [activeTab, setActiveTab] = useState<"feed" | "analyst" | "triage" | "qdent" | "seismic" | "choice">("feed");
  const [isDemo, setIsDemo] = useState(false);

  const [events, setEvents] = useState<OSINTEvent[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState("");

  const [analystQuery, setAnalystQuery] = useState("");
  const [analystResponse, setAnalystResponse] = useState<OSINTAnalysisResponse | null>(null);
  const [loadingAnalyst, setLoadingAnalyst] = useState(false);

  const [triageText, setTriageText] = useState("");
  const [triageResponse, setTriageResponse] = useState("");
  const [loadingTriage, setLoadingTriage] = useState(false);

  const fetchCityEvents = async () => {
    setLoadingFeed(true);
    setFeedError("");
    try {
      const response = await fetch("/api/osint/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: cityName }),
      });
      if (!response.ok) {
        throw new Error("Unable to parse OSINT events.");
      }
      const data = await response.json();
      if (data && typeof data === "object" && "events" in data) {
        setEvents(data.events);
        setIsDemo(!!data.isDemo);
      } else if (Array.isArray(data)) {
        setEvents(data);
        setIsDemo(false);
      } else {
        setEvents([]);
        setIsDemo(false);
      }
    } catch (err: any) {
      console.error(err);
      setFeedError("OSINT satellites out of range or offline.");
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchCityEvents();
    setAnalystResponse(null);
    setTriageResponse("");
  }, [cityName]);

  const handleAnalystSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analystQuery.trim()) return;

    setLoadingAnalyst(true);
    setAnalystResponse(null);
    try {
      const response = await fetch("/api/osint/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: analystQuery, city: cityName }),
      });
      if (!response.ok) {
        throw new Error("Analyst uplink failed.");
      }
      const data = await response.json();
      setAnalystResponse(data);
      if (data && typeof data === "object" && "isDemo" in data) {
        setIsDemo(!!data.isDemo);
      }
    } catch (err) {
      console.error(err);
      setAnalystResponse({
        analysis: "Transmission failed. Secure channel disconnected. Please retry query.",
        sources: [],
      });
    } finally {
      setLoadingAnalyst(false);
    }
  };

  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triageText.trim()) return;

    setLoadingTriage(true);
    setTriageResponse("");
    try {
      const response = await fetch("/api/osint/fast-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentText: triageText }),
      });
      if (!response.ok) {
        throw new Error("Triage connection failed.");
      }
      const data = await response.json();
      setTriageResponse(data.analysis);
      if (data && typeof data === "object" && "isDemo" in data) {
        setIsDemo(!!data.isDemo);
      }
    } catch (err) {
      console.error(err);
      setTriageResponse("Triage system offline. Fast evaluation aborted.");
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
      case "incident":
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case "infrastructure":
        return <Server className="w-4 h-4 text-cyan-400" />;
      case "traffic":
        return <Plane className="w-4 h-4 text-amber-400" />;
      case "weather":
        return <Activity className="w-4 h-4 text-cyan-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="bg-[#050608] border border-cyan-950/80 rounded-xl overflow-hidden shadow-xl flex flex-col h-full font-sans select-none">
      <div className="bg-[#030406] border-b border-cyan-950/60 flex flex-col p-1.5 gap-1.5">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTab("feed")}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
              activeTab === "feed" ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/50" : "text-slate-400 border-transparent hover:text-cyan-300"
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Intel
          </button>

          <button
            onClick={() => setActiveTab("analyst")}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
              activeTab === "analyst" ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/50" : "text-slate-400 border-transparent hover:text-cyan-300"
            }`}
          >
            <Search className="w-3.5 h-3.5" /> Analyst
          </button>

          <button
            onClick={() => setActiveTab("triage")}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
              activeTab === "triage" ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/50" : "text-slate-400 border-transparent hover:text-cyan-300"
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> Triage
          </button>

          <button
            onClick={() => setActiveTab("qdent")}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
              activeTab === "qdent" ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/50" : "text-slate-400 border-transparent hover:text-cyan-300"
            }`}
          >
            <Radio className="w-3.5 h-3.5" /> QDENT
          </button>

          <button
            onClick={() => setActiveTab("seismic")}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
              activeTab === "seismic" ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/50" : "text-slate-400 border-transparent hover:text-cyan-300"
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Seismic
          </button>

          <button
            onClick={() => setActiveTab("choice")}
            className={`px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
              activeTab === "choice" ? "bg-cyan-950/20 text-cyan-400 border-cyan-500/50" : "text-slate-400 border-transparent hover:text-cyan-300"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Decisions
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="bg-amber-950/10 border-b border-amber-900/40 px-3.5 py-2 flex items-center justify-between text-[11px] font-mono text-amber-400/90 shrink-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>Demo Mode:</strong> Simulated data streams are active — no live Gemini/search key configured.
            </span>
          </div>
          <span className="text-[9px] text-amber-500 font-bold tracking-wide bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/30">
            KEY BYPASS
          </span>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        {activeTab === "feed" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Live OSINT Sector Feed</h3>
                <p className="text-[10px] text-slate-500 font-sans">Sector observations grounded by real-world satellite queries.</p>
              </div>
              <button
                onClick={fetchCityEvents}
                disabled={loadingFeed}
                className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 border border-cyan-900 bg-cyan-950/10 px-2.5 py-1 rounded hover:bg-cyan-950/30 cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingFeed ? "animate-spin" : ""}`} />
                {loadingFeed ? "Syncing..." : "Sync Grid"}
              </button>
            </div>

            {loadingFeed ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-black/40 border border-cyan-950/40 p-4 rounded-xl space-y-2 animate-pulse">
                    <div className="h-4 bg-slate-900 rounded w-1/3" />
                    <div className="h-3 bg-slate-900/80 rounded w-full" />
                    <div className="h-3 bg-slate-900/50 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : feedError ? (
              <div className="text-center py-10 bg-[#030406] border border-cyan-950/50 rounded-xl">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 animate-bounce" />
                <p className="text-xs text-rose-400 font-mono">{feedError}</p>
                <button
                  onClick={fetchCityEvents}
                  className="mt-3 text-xs bg-black hover:bg-cyan-950/20 px-4 py-1.5 rounded-lg border border-cyan-950 font-mono text-cyan-400"
                >
                  Force Link Reconnect
                </button>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 bg-black/20 border border-cyan-950/40 rounded-xl text-slate-500 text-xs">
                No active anomalies logged in this sector.
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((evt, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-3.5 transition-all duration-200 hover:border-cyan-500/30 relative overflow-hidden flex flex-col justify-between ${getSeverityColor(
                      evt.severity
                    )}`}
                  >
                    <div
                      className={`absolute top-0 bottom-0 left-0 w-1 ${
                        evt.severity === "critical" ? "bg-rose-500" : evt.severity === "warning" ? "bg-amber-500" : "bg-cyan-500/40"
                      }`}
                    />

                    <div className="pl-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {getCategoryIcon(evt.category)}
                          <span className="font-semibold text-xs text-white tracking-wide">{evt.title}</span>
                        </div>
                        <span
                          className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                            evt.severity === "critical"
                              ? "bg-rose-950/40 text-rose-300 border-rose-500/30"
                              : evt.severity === "warning"
                              ? "bg-amber-950/40 text-amber-300 border-amber-500/30"
                              : "bg-cyan-950/30 text-cyan-400 border-cyan-500/20"
                          }`}
                        >
                          {evt.severity}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed font-sans">{evt.description}</p>

                      {evt.location && (
                        <div className="text-[9px] text-slate-500 font-mono flex items-center gap-1.5">
                          <span>SECTOR:</span>
                          <span className="text-slate-300">{evt.location}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono pt-1.5 border-t border-cyan-950/40">
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
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> Query Virtual OSINT Analyst
              </h3>
              <p className="text-[10px] text-slate-500 font-sans">Issue a target query to execute deep search-grounded intelligence.</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                "Airport operational status and congestion?",
                "Major port ship-traffic details?",
                "Power grid status or emergency directives?",
                "Geopolitical gatherings or active events?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setAnalystQuery(suggestion)}
                  className="text-[10px] font-mono text-slate-400 border border-cyan-950 bg-black hover:bg-cyan-950/20 hover:border-cyan-500/40 px-2 py-1 rounded transition-all text-left cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form onSubmit={handleAnalystSearch} className="flex gap-2">
              <input
                type="text"
                placeholder={`Query ${cityName} infrastructure, anomalies...`}
                value={analystQuery}
                onChange={(e) => setAnalystQuery(e.target.value)}
                className="flex-1 bg-black border border-cyan-950 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="submit"
                disabled={loadingAnalyst || !analystQuery.trim()}
                className="bg-black hover:bg-cyan-950/20 border border-cyan-850 text-cyan-400 px-3 py-2 rounded-lg text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
              >
                {loadingAnalyst ? "Analyzing..." : <Send className="w-3.5 h-3.5" />}
              </button>
            </form>

            {loadingAnalyst ? (
              <div className="bg-[#030406] border border-cyan-950 p-6 rounded-xl text-center space-y-2">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-mono text-slate-400">Locking satellite telemetry on {cityName}...</p>
                <p className="text-[10px] text-slate-600">Retrieving intelligence web links...</p>
              </div>
            ) : analystResponse ? (
              <div className="bg-black border border-cyan-950/80 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider pb-2 border-b border-cyan-950/40">
                  <FileText className="w-4 h-4 text-cyan-400" /> SECURE_INTEL_REPORT
                </div>

                <div className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">{analystResponse.analysis}</div>

                {analystResponse.sources && analystResponse.sources.length > 0 && (
                  <div className="pt-3 border-t border-cyan-950/40 space-y-1.5">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500 block">Sources Grounded:</span>
                    <div className="grid gap-1">
                      {analystResponse.sources.map((src, sIdx) => (
                        <a
                          key={sIdx}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[9px] text-cyan-400 hover:underline flex items-center gap-1 font-mono truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0 text-cyan-500" /> {src.title || src.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 bg-black/10 border border-cyan-950/60 rounded-xl border-dashed">
                <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-sans">Command center ready. Enter query coordinates to begin.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "triage" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> Low Latency Alert Evaluator
              </h3>
              <p className="text-[10px] text-slate-500 font-sans">
                Instantly evaluate threat indices for any signal, wire transcript, or custom report.
              </p>
            </div>

            <form onSubmit={handleTriageSubmit} className="space-y-2">
              <textarea
                rows={3}
                placeholder="Paste news flash, raw incident log, decrypted cell intercept wire..."
                value={triageText}
                onChange={(e) => setTriageText(e.target.value)}
                className="w-full bg-black border border-cyan-950 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono resize-none"
              />
              <button
                type="submit"
                disabled={loadingTriage || !triageText.trim()}
                className="w-full bg-black hover:bg-cyan-950/20 border border-cyan-850 text-cyan-400 py-2 rounded-lg text-xs font-mono uppercase tracking-widest cursor-pointer transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {loadingTriage ? (
                  "Processing..."
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Evaluate Danger Vector
                  </>
                )}
              </button>
            </form>

            {triageResponse && (
              <div className="bg-black border border-amber-950/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-mono font-bold uppercase tracking-wider pb-2 border-b border-amber-950/20">
                  <AlertCircle className="w-4 h-4" /> TRIAGE_EVALUATION_REPORT
                </div>
                <div className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">{triageResponse}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "qdent" && <QDENTPanel cityName={cityName} lat={lat} lng={lng} />}

        {activeTab === "seismic" && <SeismicPanel cityName={cityName} lat={lat} lng={lng} />}

        {activeTab === "choice" && <ChoicePointsPanel />}
      </div>
    </div>
  );
}
