import React, { useEffect, useMemo, useState, useCallback } from "react";
import { sources, ai } from "../lib/api";
import { TopBar } from "../components/terminal/TopBar";
import { LeftSidebar } from "../components/terminal/LeftSidebar";
import { RightSidebar } from "../components/terminal/RightSidebar";
import { CenterPane } from "../components/terminal/CenterPane";
import { NewsTicker } from "../components/terminal/NewsTicker";
import { SignalHistoryModal } from "../components/terminal/SignalHistoryModal";
import { BrowserPanel } from "../components/axe/BrowserPanel";
import MobileTerminal from "./MobileTerminal";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";

const REFRESH_MS = 30000;
const MOBILE_BREAKPOINT = 1024;
const STORAGE_KEYS = { left: "axe-core.left-sidebar-open", right: "axe-core.right-sidebar-open" };

function storedOpen(key) {
  if (typeof window === "undefined") return true;
  const value = window.localStorage.getItem(key);
  return value === null ? true : value !== "false";
}

export default function Terminal() {
  const { logout } = useAuth();
  const { notify } = useNotification();
  const [snapshot, setSnapshot] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [loadingSweep, setLoadingSweep] = useState(false);
  const [loadingCorrelate, setLoadingCorrelate] = useState(false);
  const [lastSweepAt, setLastSweepAt] = useState(null);
  const [secondsSinceSweep, setSecondsSinceSweep] = useState(0);
  const [activeRegion, setActiveRegion] = useState("WORLD");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(() => storedOpen(STORAGE_KEYS.left));
  const [rightOpen, setRightOpen] = useState(() => storedOpen(STORAGE_KEYS.right));
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < MOBILE_BREAKPOINT); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.left, String(leftOpen));
    window.localStorage.setItem(STORAGE_KEYS.right, String(rightOpen));
  }, [leftOpen, rightOpen]);

  useEffect(() => {
    const handleOpenBrowser = () => setBrowserOpen(true);
    window.addEventListener("axe-open-browser", handleOpenBrowser);
    return () => window.removeEventListener("axe-open-browser", handleOpenBrowser);
  }, []);

  const fetchLatest = useCallback(async () => {
    try { setLoadingSweep(true); const s = await sources.latest(); setSnapshot(s); if (s?.started_at) setLastSweepAt(new Date(s.started_at)); }
    catch (e) { console.error("fetchLatest", e); notify.error("Failed to fetch latest data"); }
    finally { setLoadingSweep(false); }
  }, [notify]);
  const sweepNow = useCallback(async () => {
    try { setLoadingSweep(true); notify.info("Running sweep across all sources...", 2000); const s = await sources.sweep(); setSnapshot(s); if (s?.started_at) setLastSweepAt(new Date(s.started_at)); const healthy = s?.healthy_sources ?? 0; const total = s?.total_sources ?? 8; notify.success(`Sweep complete — ${healthy}/${total} sources healthy, ${s?.events_total ?? 0} events`); }
    catch (e) { console.error("sweepNow", e); notify.error(`Sweep failed: ${e?.message || "Unknown error"}`); }
    finally { setLoadingSweep(false); }
  }, [notify]);
  const correlate = useCallback(async () => {
    try { setLoadingCorrelate(true); notify.info("AXE is correlating cross-source signals...", 3000); const out = await ai.correlate(); if (out?.status === "ok") { setCorrelation(out.result); const signals = out.result?.signals?.length || 0; const ideas = out.result?.leverageable_ideas?.length || 0; notify.success(`Correlation complete — ${signals} signals, ${ideas} ideas generated`); } else notify.warning("Correlation returned no results"); }
    catch (e) { console.error("correlate", e); notify.error(`Correlation failed: ${e?.message || "Unknown error"}`); }
    finally { setLoadingCorrelate(false); }
  }, [notify]);
  useEffect(() => { fetchLatest(); (async () => { try { const c = await ai.latestCorrelation(); if (c?.status === "ok") setCorrelation(c.result); } catch {} })(); const t = setInterval(fetchLatest, REFRESH_MS); return () => clearInterval(t); }, [fetchLatest]);
  useEffect(() => { const t = setInterval(() => { if (lastSweepAt) setSecondsSinceSweep(Math.floor((Date.now() - lastSweepAt.getTime())/1000)); }, 1000); return () => clearInterval(t); }, [lastSweepAt]);
  useEffect(() => { if (snapshot && !correlation && !loadingCorrelate) correlate(); }, [snapshot]);

  const sources_count = useMemo(() => ({ healthy: snapshot?.healthy_sources ?? 0, total: snapshot?.total_sources ?? 8 }), [snapshot]);
  const headlineRisk = correlation?.headline_risk || "AWAITING CORRELATION";
  const alertLevel = correlation?.alert_level || "";

  if (isMobile) return <><MobileTerminal snapshot={snapshot} correlation={correlation} loadingSweep={loadingSweep} loadingCorrelate={loadingCorrelate} sweepNow={sweepNow} correlate={correlate} onLogout={logout} onOpenHistory={() => setHistoryOpen(true)} sweepAge={secondsSinceSweep} sourcesCount={sources_count} headlineRisk={headlineRisk} alertLevel={alertLevel} activeRegion={activeRegion} setActiveRegion={setActiveRegion} /><SignalHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />{browserOpen && <BrowserPanel onClose={() => setBrowserOpen(false)} />}</>;

  const desktopColumns = `${leftOpen ? "320px" : "42px"} minmax(0,1fr) ${rightOpen ? "360px" : "42px"}`;
  return <div className="min-h-screen bg-black text-[#EAF2F7] flex flex-col">
    <TopBar headlineRisk={headlineRisk} alertLevel={alertLevel} sweepAge={secondsSinceSweep} sourcesHealthy={sources_count.healthy} sourcesTotal={sources_count.total} onSweep={sweepNow} onCorrelate={correlate} onLogout={logout} onOpenHistory={() => setHistoryOpen(true)} onOpenBrowser={() => setBrowserOpen(true)} loadingSweep={loadingSweep} loadingCorrelate={loadingCorrelate} />
    <NewsTicker snapshot={snapshot} />
    <main className="flex-1 p-3 grid gap-3 grid-cols-1" style={{ gridTemplateColumns: desktopColumns }}>
      <section className="min-w-0 relative">{leftOpen ? <><button type="button" onClick={() => setLeftOpen(false)} aria-label="Collapse left sidebar" className="absolute right-2 top-2 z-10 rounded border border-cyan-400/30 bg-black/70 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-400/10">← Hide</button><LeftSidebar snapshot={snapshot} onLogout={logout} /></> : <button type="button" onClick={() => setLeftOpen(true)} aria-label="Open left sidebar" className="h-full min-h-[120px] w-full rounded border border-cyan-400/20 bg-slate-950/70 text-lg text-cyan-200 hover:bg-cyan-400/10" title="Open left sidebar">→</button>}</section>
      <CenterPane snapshot={snapshot} correlation={correlation} activeRegion={activeRegion} setActiveRegion={setActiveRegion} loadingCorrelate={loadingCorrelate} onCorrelate={correlate} />
      <section className="min-w-0 relative">{rightOpen ? <><button type="button" onClick={() => setRightOpen(false)} aria-label="Collapse right sidebar" className="absolute left-2 top-2 z-10 rounded border border-cyan-400/30 bg-black/70 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-400/10">Hide →</button><RightSidebar snapshot={snapshot} correlation={correlation} loadingCorrelate={loadingCorrelate} /></> : <button type="button" onClick={() => setRightOpen(true)} aria-label="Open right sidebar" className="h-full min-h-[120px] w-full rounded border border-cyan-400/20 bg-slate-950/70 text-lg text-cyan-200 hover:bg-cyan-400/10" title="Open right sidebar">←</button>}</section>
    </main>
    <SignalHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />{browserOpen && <BrowserPanel onClose={() => setBrowserOpen(false)} />}
  </div>;
}
