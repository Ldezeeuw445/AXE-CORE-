import React from "react";
import { Panel, Badge } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import { AlertOctagon, Layers, Zap, Activity, ShieldAlert, Flame, Plane, Anchor, Satellite, Newspaper, Bug } from "lucide-react";

const LAYER_ICON = {
  news: Newspaper, air: Plane, vessel: Anchor, space: Satellite,
  macro: Activity, crypto: Zap, thermal: Flame, heatmap: Flame, intel: Bug,
};

function Bar({ value, max = 100, color = "#00D4FF" }) {
  const w = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
      <div style={{ width: `${w}%`, background: `linear-gradient(90deg, ${color}AA, ${color})` }} className="h-full"/>
    </div>
  );
}

export function RightSidebar({ snapshot, correlation, loadingCorrelate }) {
  const signals = correlation?.signals || [];
  const intel = snapshot?.sources?.intel?.items || [];

  const hot = [
    ["Incident Tempo", Math.min(60, (snapshot?.events_total || 0)/30), 60, "#00D4FF"],
    ["Air Theaters", snapshot?.sources?.air?.theaters || 0, 30, "#66E6FF"],
    ["Thermal Spikes", snapshot?.sources?.heatmap?.high_intensity || 0, 100, "#FF7A45"],
    ["Night Detections", snapshot?.sources?.heatmap?.night_detections || 0, 200, "#FFCC66"],
    ["Chokepoints", snapshot?.sources?.vessel?.chokepoints || 9, 20, "#66E6FF"],
    ["Cyber KEV (↑)", (intel.filter(i => i.category === "cyber-vuln")).length, 30, "#FF4D6D"],
  ];

  return (
    <aside className="flex flex-col gap-3 min-w-0" data-testid="right-sidebar">
      <Panel title="Cross-Source Signals" right={<Badge tone="cyan">WORLDVIEW</Badge>} dataTestId="cross-source-signals-panel">
        {loadingCorrelate && (
          <div className="flex items-center gap-2 text-[11px] text-[#9FB0C0]">
            <Spinner variant="braille" label="AXE correlating"/>
          </div>
        )}
        {!loadingCorrelate && signals.length === 0 && (
          <div className="text-[11px] text-[#6F8193]">No correlations yet. Press AXE CORRELATE.</div>
        )}
        <ul className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
          {signals.map((s, i) => (
            <li key={s.id || i} className="axe-row gap-2 p-2 rounded-md bg-white/2 border border-white/5 hover:border-[#00D4FF]/25 transition-colors" style={{ gridTemplateColumns: "22px 1fr" }} data-testid={`signal-${i}`}>
              <span className="text-[10px] font-semibold tracking-[0.06em] text-[#FFCC66]">{(i+1).toString().padStart(2,'0')}</span>
              <div>
                <div className="text-[11px] font-medium text-[#EAF2F7]">{s.title}</div>
                <div className="text-[10px] text-[#9FB0C0] mt-0.5 leading-snug">{s.narrative}</div>
                <div className="flex items-center gap-1 flex-wrap mt-1">
                  {(s.sources_involved || []).map((src) => {
                    const Icon = LAYER_ICON[src] || Layers;
                    return <span key={src} className="axe-badge axe-badge-cyan"><Icon size={10}/> {src}</span>;
                  })}
                  <span className={`axe-badge ${s.confidence === "HIGH" ? "axe-badge-ok" : s.confidence === "LOW" ? "axe-badge-stale" : "axe-badge-cyan"}`}>{s.confidence}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="OSINT Stream" right={<Badge tone="amber">{intel.length} URGENT</Badge>} dataTestId="osint-stream-list">
        <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {intel.slice(0, 14).map((it) => (
            <li key={it.id} className="axe-row gap-2 text-[11px]" style={{ gridTemplateColumns: "80px 1fr" }}>
              <span className={`axe-badge ${it.category === "cyber-vuln" ? "axe-badge-error" : "axe-badge-amber"}`}>{it.category === "cyber-vuln" ? "CVE" : "QUAKE"}</span>
              <div className="min-w-0">
                <div className="text-[#EAF2F7] truncate">{it.title}</div>
                <div className="text-[10px] text-[#6F8193] truncate">{it.place || it.vendor || it.product || ""}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Signal Core" right={<Badge tone="cyan">HOT METRICS</Badge>}>
        <ul className="space-y-2">
          {hot.map(([k, v, max, color]) => (
            <li key={k} className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0] w-[120px]">{k}</span>
              <div className="flex-1"><Bar value={v} max={max} color={color}/></div>
              <span className="axe-num text-[11px] font-semibold text-[#EAF2F7] w-12 text-right">{Number(v).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Sweep Delta" right={<Badge tone={"ok"}>BASELINE</Badge>}>
        <div className="text-[11px] text-[#9FB0C0]">
          Sources are updating on a {30}s cadence. Cross-source AI runs on demand.
        </div>
      </Panel>
    </aside>
  );
}
