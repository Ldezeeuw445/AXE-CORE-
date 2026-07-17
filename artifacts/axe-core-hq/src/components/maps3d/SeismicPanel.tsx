import React, { useState, useEffect } from "react";
import { Activity, AlertTriangle, RefreshCw, Layers, Compass } from "lucide-react";

interface SeismicPanelProps {
  cityName: string;
  lat: number;
  lng: number;
}

interface SeismicEventData {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  depth: number;
  url: string;
}

export function SeismicPanel({ cityName, lat, lng }: SeismicPanelProps) {
  const [events, setEvents] = useState<SeismicEventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchSeismicData = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=400&limit=8`
      );
      if (!response.ok) {
        throw new Error("USGS seismic service returned offline status.");
      }
      const data = await response.json();
      if (data && data.features) {
        const parsed: SeismicEventData[] = data.features.map((feat: any) => {
          const props = feat.properties;
          const geom = feat.geometry;
          return {
            id: feat.id,
            magnitude: props.mag,
            place: props.place,
            time: new Date(props.time).toLocaleString(),
            depth: geom.coordinates[2],
            url: props.url
          };
        });
        setEvents(parsed);
      } else {
        setEvents([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch USGS seismic data:", err);
      setError("Seismic uplink down or timed out.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeismicData();
  }, [cityName, lat, lng]);

  const getMagnitudeColor = (mag: number) => {
    if (mag >= 5.0) return "text-rose-500 border-rose-500/30 bg-rose-950/20";
    if (mag >= 3.0) return "text-amber-500 border-amber-500/30 bg-amber-950/20";
    return "text-cyan-400 border-cyan-800/30 bg-cyan-950/10";
  };

  return (
    <div className="space-y-4 font-mono text-xs text-slate-300">
      <div className="flex items-center justify-between border-b border-cyan-950/80 pb-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" /> Tectonic & Seismic Telemetry
          </h3>
          <p className="text-[10px] text-slate-500 font-sans">
            Real-time USGS tectonic readings in a 400km radius around active scan zone.
          </p>
        </div>
        <button
          onClick={fetchSeismicData}
          disabled={loading}
          className="bg-black hover:bg-cyan-950/20 border border-cyan-850 text-[10px] uppercase tracking-wider text-cyan-400 px-2.5 py-1 rounded cursor-pointer disabled:opacity-40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Aligning..." : "Refresh Sensors"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 py-8 text-center">
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] text-slate-500">Querying USGS National Earthquake Info Center...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-950/10 border border-rose-950/30 text-rose-400 rounded-lg text-center space-y-2">
          <AlertTriangle className="w-6 h-6 mx-auto text-rose-500 animate-bounce" />
          <p className="text-[11px]">{error}</p>
          <button
            onClick={fetchSeismicData}
            className="text-[10px] uppercase bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 px-3 py-1 rounded cursor-pointer"
          >
            Retry Uplink
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="p-6 bg-[#050608] border border-[#1e293b] text-center text-slate-500 rounded-lg space-y-1.5">
          <Compass className="w-6 h-6 mx-auto text-slate-600" />
          <p className="text-[11px]">No active seismic disruptions recorded within 400km.</p>
          <p className="text-[9px] text-slate-600 font-sans">Fault line pressure is within nominal thresholds.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="p-3 bg-[#050608] border border-[#1e293b] hover:border-cyan-900 rounded-lg flex items-center justify-between gap-4 transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-slate-200 font-sans font-semibold truncate leading-normal" title={evt.place}>
                  {evt.place}
                </div>
                <div className="flex items-center gap-3 text-[9px] text-slate-500 font-mono mt-1">
                  <span>DEPTH: <strong className="text-slate-400">{evt.depth.toFixed(1)} km</strong></span>
                  <span>•</span>
                  <span>{evt.time}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <a
                  href={evt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-block border px-2 py-1 rounded text-[11px] font-bold tracking-wide transition-all hover:brightness-110 ${getMagnitudeColor(
                    evt.magnitude
                  )}`}
                >
                  M {evt.magnitude.toFixed(1)}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#030406] border border-cyan-950/55 p-3 rounded-lg flex justify-between items-center text-[10px] text-slate-500 font-mono">
        <span className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-500" />
          STATION: USGS_GSN_UPLINK
        </span>
        <span>STATUS: <strong className="text-emerald-400 animate-pulse">ONLINE</strong></span>
      </div>
    </div>
  );
}
