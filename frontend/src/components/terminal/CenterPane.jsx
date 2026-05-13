import React, { useState } from "react";
import { Panel, Badge } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import { Globe2, Map as MapIcon, Layers, Maximize2, Crosshair, Sparkles, LineChart, TrendingUp, TrendingDown } from "lucide-react";
import WorldMap2D from "./WorldMap2D";
import WorldGlobe3D from "./WorldGlobe3D";
import { MacroMarkets } from "./MacroMarkets";
import { LeverageableIdeas } from "./LeverageableIdeas";
import { LiveNewsList } from "./LiveNewsList";

const REGIONS = ["WORLD", "AMERICAS", "EUROPE", "MIDDLE EAST", "ASIA PACIFIC", "AFRICA"];
const REGION_BOUNDS = {
  WORLD: null,
  AMERICAS: { center: [10, -80], zoom: 3 },
  EUROPE: { center: [50, 15], zoom: 4 },
  "MIDDLE EAST": { center: [30, 45], zoom: 4 },
  "ASIA PACIFIC": { center: [20, 110], zoom: 3 },
  AFRICA: { center: [0, 20], zoom: 3 },
};

export function CenterPane({ snapshot, correlation, activeRegion, setActiveRegion, loadingCorrelate, onCorrelate }) {
  const [mode, setMode] = useState("2D");
  const view = REGION_BOUNDS[activeRegion];

  return (
    <div className="flex flex-col gap-3 min-w-0" data-testid="center-pane">
      <Panel
        flush
        title="World Intelligence Map"
        dataTestId="world-map-panel"
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-white/3 p-0.5 border border-white/8">
              {REGIONS.map((r) => (
                <button key={r} onClick={() => setActiveRegion(r)}
                  className={`text-[10px] tracking-[0.06em] uppercase px-2 py-1 rounded ${activeRegion === r ? "bg-[#00D4FF] text-black font-semibold" : "text-[#9FB0C0] hover:text-[#66E6FF]"}`}
                  data-testid={`region-tab-${r.toLowerCase().replace(/[^a-z]+/g,'-')}`}>{r}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-md bg-white/3 p-0.5 border border-white/8">
              <button onClick={() => setMode("2D")}
                className={`text-[10px] uppercase tracking-[0.06em] px-2 py-1 rounded inline-flex items-center gap-1 ${mode === "2D" ? "bg-[#00D4FF] text-black font-semibold" : "text-[#9FB0C0] hover:text-[#66E6FF]"}`}
                data-testid="topbar-visuals-toggle">
                <MapIcon size={12}/> 2D
              </button>
              <button onClick={() => setMode("3D")}
                className={`text-[10px] uppercase tracking-[0.06em] px-2 py-1 rounded inline-flex items-center gap-1 ${mode === "3D" ? "bg-[#00D4FF] text-black font-semibold" : "text-[#9FB0C0] hover:text-[#66E6FF]"}`}
                data-testid="map-mode-3d">
                <Globe2 size={12}/> 3D
              </button>
            </div>
          </div>
        }
      >
        <div className="relative h-[460px] xl:h-[520px] w-full" data-testid="map-container">
          {mode === "2D" ? (
            <WorldMap2D snapshot={snapshot} view={view} />
          ) : (
            <WorldGlobe3D snapshot={snapshot} />
          )}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-white/5 bg-[#050505]">
          <Legend dot="#00D4FF" label="Air Traffic" />
          <Legend dot="#FF7A45" label="Thermal/Fire" />
          <Legend dot="#FF2E63" label="Conflict/Seismic" />
          <Legend dot="#7C3AED" label="Vessel" />
          <Legend dot="#FFCC66" label="OSINT Event" />
          <Legend dot="#66E6FF" label="Space" />
          <div className="ml-auto text-[10px] text-[#6F8193]" data-testid="map-region-label">REGION: {activeRegion}</div>
        </div>
      </Panel>

      <MacroMarkets snapshot={snapshot} />
      <LeverageableIdeas correlation={correlation} loading={loadingCorrelate} onCorrelate={onCorrelate} />
      <LiveNewsList snapshot={snapshot} />
    </div>
  );
}

function Legend({ dot, label }) {
  return (
    <span className="flex items-center gap-1 text-[10px] tracking-[0.06em] uppercase text-[#9FB0C0]">
      <span style={{ width: 6, height: 6, background: dot, borderRadius: 999, boxShadow: `0 0 8px ${dot}` }} />
      {label}
    </span>
  );
}
