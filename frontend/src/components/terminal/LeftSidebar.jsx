import React, { useEffect, useState } from "react";
import { Panel, Badge, HealthDot } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import {
  Plane, Flame, Radio, Anchor, Atom, Swords, HeartPulse, Newspaper, Eye, Satellite, Power,
  Globe, Code, FileText, BookOpen, ThumbsUp, Server, Activity, Zap, Workflow
} from "lucide-react";
import { feedback, kimi } from "../../lib/api";

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
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [kimiHealth, setKimiHealth] = useState(null);
  const [vpsHealth, setVpsHealth] = useState({
    ollama: true,
    crewai: true,
    n8n: true,
    piper: true,
  });

  useEffect(() => {
    // Load feedback stats
    feedback.stats().then(setFeedbackStats).catch(() => {});
    // Load Kimi health
    kimi.health().then(setKimiHealth).catch(() => {});
  }, []);

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
      {/* Quick Actions */}
      <Panel title="Quick Actions" right={<Badge tone="cyan">TOOLS</Badge>}>
        <div className="grid grid-cols-2 gap-2">
          <a href="#" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("axe-open-browser")); }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[10px] text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors">
            <Globe size={12} /> Browser
          </a>
          <button onClick={() => window.dispatchEvent(new CustomEvent("axe-focus-chat", { detail: "/claw " }))}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#00D4FF]/10 border border-[#00D4FF]/20 text-[10px] text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors">
            <Zap size={12} /> KimiClaw
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent("axe-focus-chat", { detail: "/code " }))}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#2EF2C2]/10 border border-[#2EF2C2]/20 text-[10px] text-[#2EF2C2] hover:bg-[#2EF2C2]/20 transition-colors">
            <Code size={12} /> Kimi Code
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent("axe-focus-chat", { detail: "/work " }))}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#A78BFA]/10 border border-[#A78BFA]/20 text-[10px] text-[#A78BFA] hover:bg-[#A78BFA]/20 transition-colors">
            <FileText size={12} /> Kimi Work
          </button>
          <a href="/registry" className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#2EF2C2]/10 border border-[#2EF2C2]/20 text-[10px] text-[#2EF2C2] hover:bg-[#2EF2C2]/20 transition-colors">
            <Workflow size={12} /> Registry
          </a>
        </div>
      </Panel>

      {/* VPS Health */}
      <Panel title="VPS Health" right={<Badge tone="ok">ONLINE</Badge>}>
        <ul className="space-y-1.5">
          {[
            ["Ollama", vpsHealth.ollama, "ollama.axecompanion.com"],
            ["CrewAI", vpsHealth.crewai, "localhost:8000"],
            ["n8n", vpsHealth.n8n, "localhost:5678"],
            ["Piper TTS", vpsHealth.piper, "localhost:5000"],
          ].map(([name, status, host]) => (
            <li key={name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={10} className="text-[#6F8193]" />
                <span className="text-[11px] text-[#9FB0C0]">{name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-[#6F8193]">{host}</span>
                <HealthDot status={status ? "ok" : "error"} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

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

      {/* Feedback Stats */}
      {feedbackStats && feedbackStats.total > 0 && (
        <Panel title="AI Learning" right={<Badge tone="ok">ACTIVE</Badge>}>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <ThumbsUp size={10} className="text-[#2EF2C2]" />
              <span className="text-[11px] text-[#2EF2C2]">{feedbackStats.positive || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <ThumbsDown size={10} className="text-[#FF4D6D]" />
              <span className="text-[11px] text-[#FF4D6D]">{feedbackStats.negative || 0}</span>
            </div>
            <div className="text-[10px] text-[#6F8193]">
              {feedbackStats.total} total
            </div>
          </div>
          {feedbackStats.suggested_improvements?.length > 0 && (
            <ul className="space-y-1">
              {feedbackStats.suggested_improvements.slice(0, 3).map((imp, i) => (
                <li key={i} className="text-[9px] text-[#9FB0C0] flex items-start gap-1">
                  <Activity size={8} className="text-[#FFCC66] mt-0.5 shrink-0" />
                  {imp}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

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
