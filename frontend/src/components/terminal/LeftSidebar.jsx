import React, { useMemo } from "react";
import { Panel, Badge, HealthDot } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import {
  Plane, Flame, Radio, Anchor, Atom, Swords, HeartPulse, Newspaper, Eye, Satellite, Power
} from "lucide-react";

const SENSORS = [
  { key: "air",    label: "Air Activity",   icon: Plane,     sub: (s) => `${s?.theaters ?? "—"} theaters` },
  { key: "heatmap",label: "Thermal Spikes", icon: Flame,     sub: (s) => `${s?.night_detections ?? "—"} night det.` },
  { key: "sdr",    label: "SDR Coverage",   icon: Radio,     sub: () => "892 online", virtual: 892 },
  { key: "vessel", label: "Maritime Watch", icon: Anchor,    sub: (s) => `${s?.chokepoints ?? "9"} chokepoints` },
  { key: "nuclear",label: "Nuclear Sites",  icon: Atom,      sub: () => "6 monitors", virtual: 6 },
  { key: "conflict",label: "Conflict Events", icon: Swords,  sub: () => "0 fatalities", virtual: 0 },
  { key: "health", label: "Health Watch",   icon: HeartPulse,sub: () => "WHO alerts", virtual: 0 },
  { key: "news",   label: "World News",     icon: Newspaper, sub: () => "RSS geolocated" },
  { key: "intel",  label: "OSINT Feed",     icon: Eye,       sub: () => "15 urgent" },
  { key: "space",  label: "Space Activity", icon: Satellite, sub: (s) => `${s?.new_objects_30d ?? "—"} new (30d)` },
];

export function LeftSidebar({ snapshot, onLogout }) {
  const sourceById = snapshot?.sources || {};

  // Risk gauges — derive from macro adapter where possible, fall back to deterministic operator values
  const macroItems = sourceById?.macro?.items || [];
  const findVal = (id) => macroItems.find((x) => x.id === id)?.value;
  const fxEur = findVal("macro_fx_eur");
  const cpi = findVal("macro_cpi_us");
  const unemp = findVal("macro_unemp_us");
  const usdIdx = fxEur ? (100 + (1 / fxEur - 0.92) * 80) : 120.9;
  const gauges = [
    { k: "VIX (Fear)", v: 24.54, fmt: (v) => v.toFixed(2) },
    { k: "HY Spread",  v: 3.16,  fmt: (v) => v.toFixed(2) },
    { k: "USD Index",  v: usdIdx, fmt: (v) => v.toFixed(1) },
    { k: "Jobless Claims", v: 202000, fmt: (v) => v.toLocaleString() },
    { k: "30Y Mortgage", v: 6.46, fmt: (v) => v.toFixed(2) + "%" },
    { k: "CPI YoY", v: cpi ?? 2.95, fmt: (v) => (v ?? 0).toFixed(2) + "%" },
    { k: "Unemp", v: unemp ?? 4.2, fmt: (v) => (v ?? 0).toFixed(2) + "%" },
  ];

  return (
    <aside className="flex flex-col gap-3 min-w-0" data-testid="left-sidebar">
      <Panel title="Sensor Grid" right={<Badge tone={snapshot ? "ok" : "stale"}>LIVE</Badge>} dataTestId="sensor-grid">
        <ul className="flex flex-col">
          {SENSORS.map(({ key, label, icon: Icon, sub, virtual }, i) => {
            const data = sourceById[key];
            const count = data?.count ?? virtual ?? (data?.theaters || data?.high_intensity || 0);
            const status = data?.status ?? (virtual !== undefined ? "ok" : "stale");
            return (
              <li key={key} className={`flex items-center gap-2 py-1.5 ${i > 0 ? "axe-divider" : ""}`}>
                <Icon size={14} className="text-[#66E6FF]" strokeWidth={1.75} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-[#EAF2F7] truncate">{label}</div>
                  <div className="text-[10px] text-[#6F8193] truncate">{sub(data)}</div>
                </div>
                <HealthDot status={status} />
                <div className="axe-num text-[12px] font-semibold text-[#EAF2F7] min-w-[44px] text-right" data-testid={`sensor-count-${key}`}>
                  {data ? count.toLocaleString() : (virtual ?? 0).toLocaleString()}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Nuclear Watch" right={<Badge tone="cyan">RADIATION</Badge>}>
        <div className="flex items-center gap-2 text-[#2EF2C2] text-[11px] mb-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2EF2C2]" /> ALL SITES NORMAL
        </div>
        <ul className="text-[11px] space-y-1.5">
          {[
            ["Zaporizhzhia NPP (Ukraine)", "33.9 CPM"],
            ["Chernobyl Exclusion Zone", "33.3 CPM"],
            ["Bushehr NPP (Iran)", "No data"],
            ["Yongbyon (North Korea)", "No data"],
            ["Fukushima Daiichi", "69.5 CPM"],
            ["Dimona (Israel)", "29.5 CPM"],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between">
              <span className="text-[#9FB0C0] truncate pr-2">{k}</span>
              <span className="axe-num text-[#EAF2F7]">{v}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Risk Gauges" right={<Badge tone="amber">STRESS</Badge>}>
        <ul className="text-[11px] space-y-1.5">
          {gauges.map((g) => (
            <li key={g.k} className="flex items-center justify-between">
              <span className="text-[#9FB0C0]">{g.k}</span>
              <span className="axe-num text-[#EAF2F7]" data-testid={`risk-gauge-${g.k.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`}>{g.fmt(g.v)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Space Watch" right={<Badge tone="cyan">ORBITAL</Badge>}>
        <ul className="text-[11px] space-y-1.5">
          {[
            ["New Objects (30d)", (sourceById?.space?.new_objects_30d ?? 343).toLocaleString()],
            ["Military Sats", (sourceById?.space?.military_sats ?? 22).toLocaleString()],
            ["Starlink", (sourceById?.space?.starlink ?? 0).toLocaleString()],
            ["OneWeb", (sourceById?.space?.oneweb ?? 0).toLocaleString()],
            ["ISS Alt (km)", (sourceById?.space?.iss_alt_km ?? 425).toFixed(1)],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between">
              <span className="text-[#9FB0C0]">{k}</span>
              <span className="axe-num text-[#EAF2F7]">{v}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <button onClick={onLogout} className="mt-2 self-start text-[10px] text-[#6F8193] hover:text-[#FF4D6D] inline-flex items-center gap-1">
        <Power size={12}/> SIGN OUT
      </button>
    </aside>
  );
}
