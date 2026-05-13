import React from "react";
import { Panel, Badge } from "../axe/Panel";
import { Plane, Building2, TrendingUp } from "lucide-react";

export function CorporateJets({ snapshot }) {
  const air = snapshot?.sources?.air || {};
  const items = (air.items || []);
  const corp = items.filter((x) => x.is_corporate || x.is_registry_match);
  const matched = items.filter((x) => x.is_registry_match);
  return (
    <Panel title="Corporate Jet Movements" dataTestId="corp-jets-panel"
      right={
        <div className="flex items-center gap-2">
          <Badge tone="cyan">{air.corporate_count ?? 0} CORP</Badge>
          <Badge tone="amber">{air.military_count ?? 0} MIL</Badge>
          <Badge tone="ok">{air.registry_hits ?? 0} MATCH</Badge>
        </div>
      }>
      {matched.length > 0 && (
        <div className="mb-3">
          <div className="axe-section-label mb-1">REGISTRY MATCHES — LIVE</div>
          <ul className="space-y-1">
            {matched.slice(0, 12).map((j) => (
              <li key={j.id} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: "80px 1fr 60px 60px" }} data-testid={`corp-jet-${j.icao24}`}>
                <span className="axe-num text-[#66E6FF] font-semibold">{j.registration}</span>
                <span className="text-[#EAF2F7] truncate" title={j.owner}>{j.owner}</span>
                <span className="axe-badge axe-badge-cyan justify-center">{j.ticker || j.sector}</span>
                <span className="text-right text-[#9FB0C0] axe-num">{j.altitude_ft ? `${(j.altitude_ft/1000).toFixed(0)}k ft` : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="axe-section-label mb-1">RECENT CORPORATE / PRIVACY-FLAGGED</div>
      <ul className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
        {corp.slice(0, 30).map((j) => (
          <li key={j.id} className="grid gap-2 items-center text-[11px]" style={{ gridTemplateColumns: "70px 80px 1fr 60px" }}>
            <span className="axe-badge axe-badge-cyan"><Plane size={9}/> {j.source.replace("adsb-","").toUpperCase()}</span>
            <span className="axe-num text-[#EAF2F7]">{j.registration || j.icao24}</span>
            <span className="text-[#9FB0C0] truncate">{j.callsign || j.type || ""}</span>
            <span className="text-right text-[#9FB0C0] axe-num">{j.altitude_ft ? `${(j.altitude_ft/1000).toFixed(0)}k` : "—"}</span>
          </li>
        ))}
        {corp.length === 0 && <li className="text-[11px] text-[#6F8193]">No corporate jets in current sweep.</li>}
      </ul>
      <div className="text-[9px] text-[#6F8193] mt-2 flex items-center gap-1">
        <Building2 size={10}/> Registry: {air.registry_size ?? 0} corporate jets (US-first, then EU).
      </div>
    </Panel>
  );
}
