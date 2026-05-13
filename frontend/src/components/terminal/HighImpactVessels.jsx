import React, { useState } from "react";
import { Panel, Badge } from "../axe/Panel";
import { Ship, Anchor } from "lucide-react";

const TABS = ["WATCHLIST", "LIVE", "SECTORS"];

function fmtDwt(v) {
  if (!v) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k DWT`;
  return `${v} DWT`;
}

export function HighImpactVessels({ snapshot }) {
  const v = snapshot?.sources?.vessel || {};
  const items = v.items || [];
  const watchlist = v.watchlist || [];
  const sectors = v.sector_summary || {};

  const [tab, setTab] = useState("WATCHLIST");
  const [sectorFilter, setSectorFilter] = useState("ALL");

  const watchFiltered = sectorFilter === "ALL" ? watchlist : watchlist.filter((w) => w.sector === sectorFilter);
  const liveImpact = items.filter((x) => x.is_registry_match);

  return (
    <Panel title="Vessel Trading Intel" dataTestId="vessel-trading-intel"
      right={
        <div className="flex items-center gap-2">
          <Badge tone="cyan">{v.cargo_count ?? 0} CARGO</Badge>
          <Badge tone="amber">{v.tanker_count ?? 0} TANKER</Badge>
          <Badge tone="ok">{v.cruise_count ?? 0} CRUISE</Badge>
        </div>
      }>
      <div className="flex items-center gap-1 mb-2">
        <div className="flex items-center gap-1 rounded-md bg-white/3 p-0.5 border border-white/8">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[10px] tracking-[0.06em] uppercase px-2 py-1 rounded ${tab === t ? "bg-[#00D4FF] text-black font-semibold" : "text-[#9FB0C0] hover:text-[#66E6FF]"}`}
              data-testid={`vessel-tab-${t.toLowerCase()}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === "WATCHLIST" && (
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}
            className="axe-input ml-auto text-[10px] py-1 px-2 h-auto"
            data-testid="vessel-sector-filter">
            <option value="ALL">All sectors</option>
            {Object.keys(sectors).map((s) => <option key={s} value={s}>{s} ({sectors[s]})</option>)}
          </select>
        )}
      </div>

      {tab === "WATCHLIST" && (
        <ul className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
          {watchFiltered.slice(0, 60).map((w) => (
            <li key={w.mmsi} className="grid gap-2 items-center text-[11px] py-1" style={{ gridTemplateColumns: "54px 1fr 90px 70px" }} data-testid={`watch-vessel-${w.mmsi}`}>
              <span className={`axe-badge ${w.live ? "axe-badge-ok" : "axe-badge-cyan"}`}>{w.live ? "LIVE" : "IDLE"}</span>
              <div className="min-w-0">
                <div className="text-[#EAF2F7] truncate" title={w.notes}>{w.name}</div>
                <div className="text-[10px] text-[#6F8193] truncate">{w.operator} · {w.flag}</div>
              </div>
              <span className="axe-badge axe-badge-amber justify-center">{w.type.split(" ")[0]}</span>
              <span className="axe-num text-[10px] text-right text-[#9FB0C0]">{fmtDwt(w.dwt)}</span>
            </li>
          ))}
          {watchFiltered.length === 0 && <li className="text-[11px] text-[#6F8193]">No vessels match filter.</li>}
        </ul>
      )}

      {tab === "LIVE" && (
        <ul className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
          {liveImpact.slice(0, 30).map((it) => (
            <li key={it.id} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: "60px 1fr 60px" }}>
              <span className="axe-badge axe-badge-ok">MATCH</span>
              <div className="min-w-0">
                <div className="text-[#EAF2F7] truncate">{it.impact_name || it.name || it.mmsi}</div>
                <div className="text-[10px] text-[#6F8193] truncate">{it.operator} · {it.impact_type}</div>
              </div>
              <span className="axe-num text-[10px] text-right text-[#9FB0C0]">SOG {it.sog?.toFixed?.(1) ?? "—"}</span>
            </li>
          ))}
          {items.filter((x) => x.name && x.category !== "Other").slice(0, 25).map((it) => (
            <li key={`live_${it.id}`} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: "60px 1fr 60px" }}>
              <span className="axe-badge axe-badge-cyan">{it.category}</span>
              <div className="min-w-0">
                <div className="text-[#EAF2F7] truncate">{it.name}</div>
                <div className="text-[10px] text-[#6F8193] truncate">{it.destination || it.ship_type_name}</div>
              </div>
              <span className="axe-num text-[10px] text-right text-[#9FB0C0]">SOG {it.sog?.toFixed?.(1) ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "SECTORS" && (
        <ul className="grid grid-cols-2 gap-2">
          {Object.entries(sectors).map(([s, n]) => (
            <li key={s} className="rounded-md bg-white/3 border border-white/8 p-2.5">
              <div className="text-[10px] tracking-[0.06em] uppercase text-[#9FB0C0]">{s}</div>
              <div className="axe-num text-[18px] font-semibold text-[#EAF2F7] leading-tight">{n}</div>
              <div className="text-[10px] text-[#6F8193]">vessels in registry</div>
            </li>
          ))}
        </ul>
      )}

      <div className="text-[9px] text-[#6F8193] mt-2 flex items-center gap-1">
        <Ship size={10}/> Live: Baltic+N.Sea via DigiTraffic · Registry: {v.registry_size ?? 0} high-impact vessels (cargo / tanker / cruise / yacht / LNG).
      </div>
    </Panel>
  );
}
