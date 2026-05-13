import React, { useState } from "react";
import { TriangleLogo } from "../components/axe/TriangleLogo";
import { Spinner } from "../components/axe/Spinner";
import { Badge, HealthDot } from "../components/axe/Panel";
import WorldMap2D from "../components/terminal/WorldMap2D";
import { AlertBell } from "../components/terminal/AlertBell";
import { CATEGORY_META } from "../components/terminal/intelMarkers";
import {
  Activity, Globe, Power, RefreshCcw, Sparkles, History,
  LayoutGrid, Newspaper, BarChart3, Plane, Ship,
  ChevronRight, TrendingUp, TrendingDown, Flame, Zap, Anchor, Satellite, Eye, X, Crosshair
} from "lucide-react";

const TABS = [
  { key: "map",      label: "Map",      icon: Globe },
  { key: "overview", label: "Pulse",    icon: LayoutGrid },
  { key: "jets",     label: "Jets",     icon: Plane },
  { key: "vessels",  label: "Vessels",  icon: Ship },
  { key: "markets",  label: "Markets",  icon: BarChart3 },
  { key: "signals",  label: "Signals",  icon: Sparkles },
  { key: "news",     label: "News",     icon: Newspaper },
];

function fmtAge(s) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

function fmtUsd(v) {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${Number(v).toFixed(v < 1 ? 4 : 2)}`;
}

export default function MobileTerminal({
  snapshot, correlation, loadingSweep, loadingCorrelate,
  sweepNow, correlate, onLogout, onOpenHistory,
  sweepAge, sourcesCount, headlineRisk, alertLevel,
  activeRegion, setActiveRegion,
}) {
  const [tab, setTab] = useState("map");
  const isHigh = (alertLevel || "").toUpperCase() === "HIGH" || (alertLevel || "").toUpperCase() === "CRITICAL";
  const isMapView = tab === "map";

  const regions = ["WORLD", "AMERICAS", "EUROPE", "MIDDLE EAST", "ASIA PACIFIC", "AFRICA"];
  const view = activeRegion === "WORLD" ? null : (
    {
      AMERICAS: { center: [10, -80], zoom: 3 },
      EUROPE: { center: [50, 15], zoom: 4 },
      "MIDDLE EAST": { center: [30, 45], zoom: 4 },
      "ASIA PACIFIC": { center: [20, 110], zoom: 3 },
      AFRICA: { center: [0, 20], zoom: 3 },
    }[activeRegion]
  );

  return (
    <div className="min-h-screen relative bg-black text-[#EAF2F7] overflow-hidden" data-testid="mobile-terminal">

      {/* ========== PERSISTENT MAP BACKGROUND (never unmounts) ========== */}
      <div className="fixed inset-0 z-0" data-testid="mobile-map-bg">
        <WorldMap2D snapshot={snapshot} view={view} mobile fullBleed />
      </div>

      {/* ========== TOP BAR (always visible) ========== */}
      <header
        className="fixed top-0 left-0 right-0 z-30 px-3 pt-3 pb-2 border-b border-white/5"
        style={{
          background: isMapView
            ? "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0) 100%)"
            : "rgba(5,5,5,0.96)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        data-testid="mobile-topbar"
      >
        <div className="flex items-center gap-2">
          <TriangleLogo size={22} animate />
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-[12px] font-semibold tracking-[0.14em] text-[#EAF2F7]">AXE INTELLIGENCE</span>
            <span className="text-[9px] tracking-[0.18em] uppercase text-[#6F8193]">OPERATOR · MOBILE</span>
          </div>
          {alertLevel && (
            <Badge tone={isHigh ? "alert" : "amber"} dataTestId="mobile-alert-badge">{alertLevel}</Badge>
          )}
        </div>
        {headlineRisk && headlineRisk !== "AWAITING CORRELATION" && (
          <div className="mt-2 px-2 py-1.5 rounded-md flex items-center gap-2 border-l-2"
               style={{ borderColor: "#FFCC66", background: "rgba(11,12,14,0.92)", border: "1px solid rgba(255,255,255,0.06)" }}
               data-testid="mobile-headline-risk">
            <Activity size={12} className="text-[#FFCC66] shrink-0" />
            <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[#FFCC66] leading-tight">{headlineRisk}</span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-3 text-[10px] tracking-[0.06em] uppercase text-[#9FB0C0]">
          <div className="flex items-center gap-1">
            <span className="text-[#6F8193]">SWEEP</span>
            <span className="axe-num text-[#EAF2F7]">{fmtAge(sweepAge)}</span>
            {loadingSweep && <Spinner variant="dots" className="ml-1" />}
          </div>
          <div className="flex items-center gap-1">
            <Globe size={11} className="text-[#66E6FF]" />
            <span className="axe-num text-[#EAF2F7]">{sourcesCount?.healthy ?? 0}/{sourcesCount?.total ?? 8}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#6F8193]">EV</span>
            <span className="axe-num text-[#EAF2F7]">{(snapshot?.events_total ?? 0).toLocaleString()}</span>
          </div>
          <button onClick={onOpenHistory} title="Replay" data-testid="mobile-history-button"
                  className="ml-auto text-[#9FB0C0] hover:text-[#66E6FF] p-1">
            <History size={14} />
          </button>
          <AlertBell compact />
          <button onClick={onLogout} title="Sign out" data-testid="mobile-logout-button"
                  className="text-[#9FB0C0] hover:text-[#FF4D6D] p-1">
            <Power size={14} />
          </button>
        </div>
      </header>

      {/* ========== MAP-VIEW HUD (only when tab=map) ========== */}
      {isMapView && (
        <>
          {/* Region selector floating */}
          <div className="fixed left-3 right-3 z-20 flex items-center gap-2 overflow-x-auto no-scrollbar"
               style={{ top: "var(--mobile-header-h, 116px)" }} data-testid="mobile-map-regions">
            <div className="inline-flex items-center gap-1 rounded-md p-0.5"
                 style={{ background: "rgba(11,12,14,0.85)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(10px)" }}>
              {regions.map((r) => (
                <button key={r} onClick={() => setActiveRegion(r)}
                  className={`text-[10px] tracking-[0.06em] uppercase px-2 py-1 rounded transition-colors ${activeRegion === r ? "bg-[#00D4FF] text-black font-semibold" : "text-[#9FB0C0]"}`}
                  data-testid={`mobile-region-${r.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Legend pill bottom-left of map */}
          <div className="fixed left-3 z-20 rounded-md px-2 py-1.5 max-w-[200px] flex flex-wrap gap-x-2 gap-y-1"
               style={{
                 bottom: 168, background: "rgba(11,12,14,0.85)",
                 border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(10px)"
               }}>
            {["jet", "vessel_high", "thermal", "quake", "cyber"].map((c) => (
              <span key={c} className="flex items-center gap-1 text-[8.5px] tracking-[0.06em] uppercase text-[#9FB0C0]">
                <span style={{
                  width: 6, height: 6, borderRadius: 999,
                  background: CATEGORY_META[c]?.color,
                  boxShadow: `0 0 6px ${CATEGORY_META[c]?.color}`
                }} />
                {CATEGORY_META[c]?.label}
              </span>
            ))}
          </div>
        </>
      )}

      {/* ========== TAB CONTENT OVERLAY ========== */}
      {!isMapView && (
        <main className="fixed inset-0 z-10 overflow-y-auto pt-[116px] pb-[168px] px-3"
              style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
              data-testid="mobile-content">
          <div className="space-y-3 max-w-[680px] mx-auto">
            {tab === "overview" && <OverviewTab snapshot={snapshot} correlation={correlation} onSweep={sweepNow} loadingSweep={loadingSweep} onCorrelate={correlate} loadingCorrelate={loadingCorrelate} />}
            {tab === "jets" && <JetsTab snapshot={snapshot} />}
            {tab === "vessels" && <VesselsTab snapshot={snapshot} />}
            {tab === "markets" && <MarketsTab snapshot={snapshot} />}
            {tab === "signals" && <SignalsTab correlation={correlation} loadingCorrelate={loadingCorrelate} onCorrelate={correlate} />}
            {tab === "news" && <NewsTab snapshot={snapshot} />}
          </div>
        </main>
      )}

      {/* ========== BOTTOM DOCK (always visible) ========== */}
      <nav className="fixed bottom-0 left-0 right-0 px-2 pb-2 pt-2 z-40"
           style={{ background: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.92) 60%, rgba(0,0,0,0) 100%)" }}
           data-testid="mobile-dock">
        <div className="flex items-center gap-0.5 rounded-full p-1 mx-auto max-w-[640px]"
             style={{
               background: "rgba(11,12,14,0.95)", border: "1px solid rgba(255,255,255,0.10)",
               boxShadow: "0 10px 30px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.06)",
               backdropFilter: "blur(12px)",
             }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-1 py-2 rounded-full transition-all ${active ? "bg-white/10 text-[#66E6FF]" : "text-[#9FB0C0] hover:text-[#EAF2F7]"}`}
                data-testid={`mobile-tab-${t.key}`} aria-label={t.label}>
                <Icon size={16} strokeWidth={active ? 2.4 : 1.8} />
                {active && <span className="text-[10px] font-semibold tracking-[0.06em] uppercase">{t.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ================== TABS ================== */

function OverviewTab({ snapshot, correlation, onSweep, loadingSweep, onCorrelate, loadingCorrelate }) {
  const sources = snapshot?.sources || {};
  const sensors = [
    { key: "air",     label: "Air",      icon: Plane,      val: sources.air?.theaters || 0,                    unit: "thtr" },
    { key: "heatmap", label: "Thermal",  icon: Flame,      val: sources.heatmap?.high_intensity || 0,           unit: "FRP>10" },
    { key: "vessel",  label: "Maritime", icon: Anchor,     val: sources.vessel?.tanker_count || 0,              unit: "tankr" },
    { key: "intel",   label: "Intel",    icon: Eye,        val: sources.intel?.count || 0,                       unit: "evts" },
    { key: "space",   label: "Space",    icon: Satellite,  val: (sources.space?.starlink || 0).toLocaleString(), unit: "stllt" },
    { key: "crypto",  label: "Crypto",   icon: Zap,        val: sources.crypto?.count || 0,                      unit: "coins" },
    { key: "macro",   label: "Macro",    icon: BarChart3,  val: sources.macro?.count || 0,                       unit: "indics" },
    { key: "news",    label: "News",     icon: Newspaper,  val: sources.news?.count || 0,                        unit: "arts" },
  ];
  const topSignals = (correlation?.signals || []).slice(0, 2);
  return (
    <>
      <div className="grid grid-cols-2 gap-2" data-testid="mobile-overview-actions">
        <button onClick={onSweep} className="axe-panel py-3 flex items-center justify-center gap-2 text-[12px] uppercase tracking-[0.06em] text-[#EAF2F7] hover:text-[#66E6FF]" data-testid="mobile-sweep-button">
          {loadingSweep ? <Spinner variant="dots2" colorClassName="text-[#66E6FF]" /> : <RefreshCcw size={14} />}
          Sweep
        </button>
        <button onClick={onCorrelate} className="axe-panel py-3 flex items-center justify-center gap-2 text-[12px] uppercase tracking-[0.06em] font-semibold"
          style={{ background: "#0E2A33", borderColor: "rgba(0,212,255,0.30)", color: "#66E6FF" }} data-testid="mobile-correlate-button">
          {loadingCorrelate ? <Spinner variant="braille" colorClassName="text-[#66E6FF]" /> : <Sparkles size={14} />}
          AXE Correlate
        </button>
      </div>

      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Sensor Grid</h3><Badge tone="cyan">LIVE</Badge></header>
        <div className="grid grid-cols-4 gap-px bg-white/5">
          {sensors.map(({ key, label, icon: Icon, val, unit }) => (
            <div key={key} className="bg-[#0B0C0E] p-2.5 flex flex-col items-start gap-0.5" data-testid={`mobile-sensor-${key}`}>
              <div className="flex items-center gap-1 text-[#66E6FF]"><Icon size={12} strokeWidth={1.8} />
                <span className="text-[9px] tracking-[0.06em] uppercase text-[#9FB0C0]">{label}</span>
              </div>
              <div className="axe-num text-[14px] font-semibold text-[#EAF2F7] leading-tight">{val}</div>
              <div className="text-[9px] text-[#6F8193] tracking-[0.06em] uppercase">{unit}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Top Cross-Source Signals</h3><Badge tone="cyan">AI</Badge></header>
        <div className="axe-panel-body">
          {topSignals.length === 0 && <div className="text-[11px] text-[#6F8193]">Press AXE CORRELATE.</div>}
          <ul className="space-y-2">
            {topSignals.map((s, i) => (
              <li key={s.id || i} className="rounded-md bg-white/2 border border-white/5 p-2.5">
                <div className="text-[11px] font-medium text-[#EAF2F7]">{s.title}</div>
                <div className="text-[10px] text-[#9FB0C0] mt-1 leading-snug">{s.narrative}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(s.sources_involved || []).map((src) => <Badge key={src} tone="cyan">{src}</Badge>)}
                  <Badge tone={s.confidence === "HIGH" ? "ok" : s.confidence === "LOW" ? "stale" : "cyan"}>{s.confidence}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Source Health</h3><Badge tone="ok">{snapshot?.healthy_sources}/{snapshot?.total_sources}</Badge></header>
        <ul className="axe-panel-body grid grid-cols-2 gap-y-1.5 text-[11px]">
          {Object.entries(sources).map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-2 pr-2">
              <div className="flex items-center gap-1.5">
                <HealthDot status={v.status} />
                <span className="text-[#9FB0C0] uppercase tracking-[0.04em]">{k}</span>
              </div>
              <span className="axe-num text-[#EAF2F7]">{(v.count ?? 0).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function JetsTab({ snapshot }) {
  const air = snapshot?.sources?.air || {};
  const items = air.items || [];
  const matched = items.filter((x) => x.is_registry_match);
  const corp = items.filter((x) => x.is_corporate);
  return (
    <section className="axe-panel">
      <header className="axe-panel-header"><h3 className="axe-panel-title">Corporate Jet Movements</h3>
        <div className="flex gap-1"><Badge tone="cyan">{air.corporate_count ?? 0}</Badge>{air.military_count ? <Badge tone="amber">{air.military_count} mil</Badge> : null}</div>
      </header>
      {matched.length > 0 && (
        <div className="axe-panel-body">
          <div className="axe-section-label mb-1">Registry Matches · Live</div>
          <ul className="space-y-1">
            {matched.slice(0, 14).map((j) => (
              <li key={j.id} className="flex items-center gap-2 text-[11px] py-1" data-testid={`mobile-jet-match-${j.icao24}`}>
                <span className="axe-num text-[#66E6FF] font-semibold w-[70px]">{j.registration}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[#EAF2F7] truncate">{j.owner}</div>
                  <div className="text-[10px] text-[#6F8193] truncate">{j.sector} · {j.aircraft_model || j.type}</div>
                </div>
                <Badge tone="cyan">{j.ticker || j.region_tag}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="axe-panel-body border-t border-white/5">
        <div className="axe-section-label mb-1">Privacy-Flagged / PIA · LADD</div>
        <ul className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
          {corp.slice(0, 30).map((j) => (
            <li key={j.id} className="flex items-center gap-2 text-[11px] py-1">
              <Badge tone="cyan">{(j.source || "").replace("adsb-", "").toUpperCase()}</Badge>
              <span className="axe-num text-[#EAF2F7] truncate">{j.registration || j.icao24}</span>
              <span className="text-[#9FB0C0] truncate flex-1">{j.callsign || j.type || ""}</span>
              <span className="text-[#9FB0C0] axe-num">{j.altitude_ft ? `${(j.altitude_ft / 1000).toFixed(0)}k` : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function VesselsTab({ snapshot }) {
  const v = snapshot?.sources?.vessel || {};
  const watchlist = v.watchlist || [];
  const sectors = v.sector_summary || {};
  const [filter, setFilter] = useState("ALL");
  const items = filter === "ALL" ? watchlist : watchlist.filter((w) => w.sector === filter);
  return (
    <section className="axe-panel">
      <header className="axe-panel-header"><h3 className="axe-panel-title">Vessel Trading Intel</h3>
        <Badge tone="amber">{v.tanker_count ?? 0} TANKER</Badge>
      </header>
      <div className="px-3 pt-2 pb-1 flex gap-1 overflow-x-auto">
        {["ALL", ...Object.keys(sectors)].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-[10px] tracking-[0.06em] uppercase px-2 py-1 rounded-full whitespace-nowrap ${filter === s ? "bg-[#00D4FF] text-black font-semibold" : "bg-white/3 border border-white/8 text-[#9FB0C0]"}`}
            data-testid={`mobile-vessel-filter-${s.toLowerCase()}`}>
            {s}{s !== "ALL" && ` (${sectors[s]})`}
          </button>
        ))}
      </div>
      <ul className="axe-panel-body space-y-1 max-h-[60vh] overflow-y-auto">
        {items.slice(0, 80).map((w) => (
          <li key={w.mmsi} className="flex items-center gap-2 text-[11px] py-1" data-testid={`mobile-vessel-${w.mmsi}`}>
            <Badge tone={w.live ? "ok" : "cyan"}>{w.live ? "LIVE" : "IDLE"}</Badge>
            <div className="flex-1 min-w-0">
              <div className="text-[#EAF2F7] truncate">{w.name}</div>
              <div className="text-[10px] text-[#6F8193] truncate">{w.operator} · {w.flag}</div>
            </div>
            <span className="axe-num text-[10px] text-[#9FB0C0]">{w.dwt ? `${(w.dwt / 1000).toFixed(0)}k` : "—"}</span>
            <ChevronRight size={12} className="text-[#6F8193]" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketsTab({ snapshot }) {
  const crypto = snapshot?.sources?.crypto?.items || [];
  const macro = snapshot?.sources?.macro?.items || [];
  const fx = macro.filter((x) => x.source === "frankfurter");
  const idx = macro.filter((x) => x.source === "worldbank");
  return (
    <>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Indexes / Macro</h3></header>
        <ul className="axe-panel-body grid grid-cols-2 gap-2">
          {idx.map((r) => (
            <li key={r.id} className="px-2 py-1.5 bg-white/3 border border-white/8 rounded-md">
              <div className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0]">{r.title}</div>
              <div className="axe-num text-[12px] text-[#EAF2F7] font-semibold">{r.unit === "USD" ? fmtUsd(r.value) : `${(r.value ?? 0).toFixed(2)}${r.unit === "%" ? "%" : ""}`}</div>
            </li>
          ))}
        </ul>
      </section>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">FX (USD vs)</h3></header>
        <ul className="axe-panel-body grid grid-cols-2 gap-2">
          {fx.map((r) => (
            <li key={r.id} className="px-2 py-1.5 bg-white/3 border border-white/8 rounded-md">
              <div className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0]">{r.title}</div>
              <div className="axe-num text-[12px] text-[#EAF2F7] font-semibold">{r.value?.toFixed?.(4)}</div>
            </li>
          ))}
        </ul>
      </section>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Crypto Top {Math.min(crypto.length, 12)}</h3><Badge tone="cyan">CoinGecko</Badge></header>
        <ul className="axe-panel-body space-y-1">
          {crypto.slice(0, 12).map((c) => {
            const pos = (c.change_24h_pct ?? 0) >= 0;
            return (
              <li key={c.id} className="flex items-center gap-2 text-[11px] py-1">
                {c.image && <img src={c.image} alt="" width="16" height="16" className="opacity-90" />}
                <span className="text-[10px] uppercase tracking-[0.06em] text-[#9FB0C0] w-12">{c.symbol}</span>
                <span className="flex-1 axe-num text-[#EAF2F7]">{fmtUsd(c.price_usd)}</span>
                <span className={`inline-flex items-center gap-0.5 ${pos ? "text-[#2EF2C2]" : "text-[#FF4D6D]"}`}>
                  {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {(c.change_24h_pct ?? 0).toFixed(2)}%
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function SignalsTab({ correlation, loadingCorrelate, onCorrelate }) {
  const signals = correlation?.signals || [];
  const ideas = correlation?.leverageable_ideas || [];
  return (
    <>
      <button onClick={onCorrelate} className="w-full axe-panel py-3 flex items-center justify-center gap-2 text-[12px] uppercase tracking-[0.06em] font-semibold"
        style={{ background: "#0E2A33", borderColor: "rgba(0,212,255,0.30)", color: "#66E6FF" }} data-testid="mobile-signals-correlate">
        {loadingCorrelate ? <Spinner variant="braille" /> : <Sparkles size={14} />}
        Re-correlate
      </button>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Cross-Source Signals</h3><Badge tone="cyan">{signals.length}</Badge></header>
        <ul className="axe-panel-body space-y-2">
          {signals.map((s, i) => (
            <li key={s.id || i} className="rounded-md bg-white/2 border border-white/5 p-2.5">
              <div className="text-[11px] font-medium text-[#EAF2F7]">{s.title}</div>
              <div className="text-[10px] text-[#9FB0C0] mt-1 leading-snug">{s.narrative}</div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(s.sources_involved || []).map((src) => <Badge key={src} tone="cyan">{src}</Badge>)}
                <Badge tone={s.confidence === "HIGH" ? "ok" : s.confidence === "LOW" ? "stale" : "cyan"}>{s.confidence}</Badge>
              </div>
            </li>
          ))}
          {signals.length === 0 && <li className="text-[11px] text-[#6F8193]">No signals yet.</li>}
        </ul>
      </section>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Leverageable Ideas</h3><Badge tone="cyan">{ideas.length}</Badge></header>
        <ul className="axe-panel-body space-y-2">
          {ideas.map((i, n) => (
            <li key={i.id || n} className="rounded-md bg-white/2 border border-white/5 p-2.5" data-testid={`mobile-idea-${n}`}>
              <div className="flex flex-wrap gap-1 items-center">
                <Badge tone={i.side === "LONG" ? "ok" : i.side === "SHORT" ? "error" : "cyan"}>{i.side}</Badge>
                <Badge tone="cyan">{i.ticker_or_theme}</Badge>
                <Badge tone="amber">{i.horizon}</Badge>
                <Badge tone={i.confidence === "HIGH" ? "ok" : i.confidence === "LOW" ? "stale" : "cyan"}>{i.confidence}</Badge>
              </div>
              <div className="text-[11px] text-[#EAF2F7] mt-2">{i.thesis}</div>
              <div className="text-[10px] text-[#FF7A45] mt-1"><span className="text-[#9FB0C0]">Risk:</span> {i.risk}</div>
            </li>
          ))}
          {ideas.length === 0 && <li className="text-[11px] text-[#6F8193]">No ideas yet.</li>}
        </ul>
      </section>
    </>
  );
}

function NewsTab({ snapshot }) {
  const items = snapshot?.sources?.news?.items || [];
  const intel = snapshot?.sources?.intel?.items || [];
  return (
    <>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">Live News</h3><Badge tone="cyan">{items.length}</Badge></header>
        <ul className="axe-panel-body space-y-1.5 max-h-[55vh] overflow-y-auto">
          {items.slice(0, 30).map((it) => (
            <li key={it.id} className="grid gap-2 items-start text-[11px]" style={{ gridTemplateColumns: "70px 1fr" }}>
              <span className="axe-badge axe-badge-amber truncate uppercase" title={it.source}>{(it.country || it.source || "").slice(0, 10)}</span>
              <a href={it.url} target="_blank" rel="noreferrer" className="text-[#EAF2F7] hover:text-[#66E6FF] leading-snug">{it.title}</a>
            </li>
          ))}
        </ul>
      </section>
      <section className="axe-panel">
        <header className="axe-panel-header"><h3 className="axe-panel-title">OSINT Stream</h3><Badge tone="amber">{intel.length}</Badge></header>
        <ul className="axe-panel-body space-y-1.5 max-h-[45vh] overflow-y-auto">
          {intel.slice(0, 20).map((it) => (
            <li key={it.id} className="grid gap-2 items-start text-[11px]" style={{ gridTemplateColumns: "60px 1fr" }}>
              <span className={`axe-badge ${it.category === "cyber-vuln" ? "axe-badge-error" : "axe-badge-amber"}`}>
                {it.category === "cyber-vuln" ? "CVE" : "QUAKE"}
              </span>
              <div className="min-w-0">
                <div className="text-[#EAF2F7]">{it.title}</div>
                <div className="text-[10px] text-[#6F8193]">{it.place || it.vendor || ""}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
