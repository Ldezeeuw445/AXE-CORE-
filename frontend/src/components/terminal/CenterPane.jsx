import React from "react";
import { Panel } from "../axe/Panel";
import { Map as MapIcon } from "lucide-react";
import WorldMap2D from "./WorldMap2D";
import { MacroMarkets } from "./MacroMarkets";
import { LeverageableIdeas } from "./LeverageableIdeas";
import { LiveNewsList } from "./LiveNewsList";
import { CorporateJets } from "./CorporateJets";
import { HighImpactVessels } from "./HighImpactVessels";
import { CATEGORY_META } from "./intelMarkers";

const REGIONS = ["WORLD", "AMERICAS", "EUROPE", "MIDDLE EAST", "ASIA PACIFIC", "AFRICA"];
const REGION_BOUNDS = {
  WORLD: null,
  AMERICAS: { center: [10, -80], zoom: 3 },
  EUROPE: { center: [50, 15], zoom: 4 },
  "MIDDLE EAST": { center: [30, 45], zoom: 4 },
  "ASIA PACIFIC": { center: [20, 110], zoom: 3 },
  AFRICA: { center: [0, 20], zoom: 3 },
};

const LEGEND_ITEMS = [
  { cat: "jet",         label: "Corporate Jet" },
  { cat: "military",    label: "Military" },
  { cat: "air",         label: "Air Traffic" },
  { cat: "vessel_high", label: "Strategic Vessel" },
  { cat: "vessel",      label: "Vessel (AIS)" },
  { cat: "thermal",     label: "Thermal/Fire" },
  { cat: "quake",       label: "Seismic" },
  { cat: "cyber",       label: "Cyber" },
  { cat: "space",       label: "Spacecraft" },
];

export function CenterPane({ snapshot, correlation, activeRegion, setActiveRegion, loadingCorrelate, onCorrelate }) {
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
                  data-testid={`region-tab-${r.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{r}</button>
              ))}
            </div>
            <div className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/3 border border-white/8 text-[10px] uppercase tracking-[0.06em] text-[#66E6FF]">
              <MapIcon size={12}/> 2D Dark
            </div>
          </div>
        }
      >
        <div className="relative h-[520px] xl:h-[600px] w-full" data-testid="map-container">
          <WorldMap2D snapshot={snapshot} view={view} />
        </div>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-white/5 bg-[#050505]">
          {LEGEND_ITEMS.map(({ cat, label }) => (
            <LegendDot key={cat} color={CATEGORY_META[cat]?.color} label={label} />
          ))}
          <div className="ml-auto text-[10px] text-[#6F8193]" data-testid="map-region-label">REGION: {activeRegion}</div>
        </div>
      </Panel>

      <MacroMarkets snapshot={snapshot} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CorporateJets snapshot={snapshot} />
        <HighImpactVessels snapshot={snapshot} />
      </div>
      <LeverageableIdeas correlation={correlation} loading={loadingCorrelate} onCorrelate={onCorrelate} />
      <LiveNewsList snapshot={snapshot} />
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1 text-[10px] tracking-[0.06em] uppercase text-[#9FB0C0]">
      <span style={{ width: 7, height: 7, background: color, borderRadius: 999, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}
