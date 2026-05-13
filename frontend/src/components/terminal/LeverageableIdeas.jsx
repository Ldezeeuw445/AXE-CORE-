import React from "react";
import { Panel, Badge } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import { Sparkles, Layers, Clock } from "lucide-react";

const SIDE_COLOR = { LONG: "#2EF2C2", SHORT: "#FF4D6D", HEDGE: "#66E6FF" };

export function LeverageableIdeas({ correlation, loading, onCorrelate }) {
  const ideas = correlation?.leverageable_ideas || [];
  return (
    <Panel
      title="Leverageable Ideas"
      dataTestId="leverageable-ideas"
      right={
        <div className="flex items-center gap-2">
          <Badge tone="cyan">AI ENHANCED</Badge>
          <button onClick={onCorrelate} className="text-[10px] tracking-[0.06em] uppercase text-[#66E6FF] hover:text-[#00D4FF] inline-flex items-center gap-1" data-testid="ideas-refresh">
            <Sparkles size={11}/> RECORRELATE
          </button>
        </div>
      }
    >
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-[#9FB0C0]">
          <Spinner variant="wave" label="AXE generating ideas"/>
        </div>
      )}
      {!loading && ideas.length === 0 && (
        <div className="text-[11px] text-[#6F8193]">No ideas yet. Press AXE CORRELATE.</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-1">
        {ideas.map((i, idx) => (
          <div key={i.id || idx} className="rounded-md bg-white/2 border border-white/6 p-2.5" data-testid={`idea-${idx}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="axe-badge" style={{ color: SIDE_COLOR[i.side] || "#66E6FF", borderColor: `${SIDE_COLOR[i.side]}55`, background: `${SIDE_COLOR[i.side]}1a` }}>{i.side}</span>
              <span className="axe-badge axe-badge-cyan"><Layers size={10}/> {i.ticker_or_theme}</span>
              <span className="axe-badge" style={{ color: "#9FB0C0", borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
                <Clock size={10}/> {i.horizon}
              </span>
              <span className={`axe-badge ${i.confidence === "HIGH" ? "axe-badge-ok" : i.confidence === "LOW" ? "axe-badge-stale" : "axe-badge-cyan"}`}>{i.confidence} CONF</span>
            </div>
            <div className="text-[11px] text-[#EAF2F7] mt-2 leading-snug">{i.thesis}</div>
            <div className="text-[10px] text-[#FF7A45] mt-1.5 leading-snug"><span className="text-[#9FB0C0]">Risk:</span> {i.risk}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
