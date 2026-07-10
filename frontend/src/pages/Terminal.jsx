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

const REFRESH_MS = 30000;
const MOBILE_BREAKPOINT = 1024;

export default function Terminal() {
  const { logout } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [loadingSweep, setLoadingSweep] = useState(false);
  const [loadingCorrelate, setLoadingCorrelate] = useState(false);
  const [lastSweepAt, setLastSweepAt] = useState(null);
  const [secondsSinceSweep, setSecondsSinceSweep] = useState(0);
  const [activeRegion, setActiveRegion] = useState("WORLD");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < MOBILE_BREAKPOINT); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      setLoadingSweep(true);
      const s = await sources.latest();
      setSnapshot(s);
      if (s?.started_at) setLastSweepAt(new Date(s.started_at));
    } catch (e) {
      console.error("fetchLatest", e);
    } finally { setLoadingSweep(false); }
  }, []);

  const sweepNow = useCallback(async () => {
    try {
      setLoadingSweep(true);
      const s = await sources.sweep();
      setSnapshot(s);
      if (s?.started_at) setLastSweepAt(new Date(s.started_at));
    } catch (e) { console.error("sweepNow", e); }
    finally { setLoadingSweep(false); }
  }, []);

  const correlate = useCallback(async () => {
    try {
      setLoadingCorrelate(true);
      const out = await ai.correlate();
      if (out?.status === "ok") setCorrelation(out.result);
    } catch (e) { console.error("correlate", e); }
    finally { setLoadingCorrelate(false); }
  }, []);

  useEffect(() => {
    fetchLatest();
    (async () => {
      try { const c = await ai.latestCorrelation(); if (c?.status === "ok") setCorrelation(c.result); } catch {}
    })();
    const t = setInterval(fetchLatest, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchLatest]);

  useEffect(() => {
    const t = setInterval(() => {
      if (lastSweepAt) setSecondsSinceSweep(Math.floor((Date.now() - lastSweepAt.getTime())/1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastSweepAt]);

  useEffect(() => {
    if (snapshot && !correlation && !loadingCorrelate) {
      correlate();
    }
    // eslint-disable-next-line
  }, [snapshot]);

  const sources_count = useMemo(() => ({
    healthy: snapshot?.healthy_sources ?? 0,
    total: snapshot?.total_sources ?? 8,
  }), [snapshot]);

  const headlineRisk = correlation?.headline_risk || "AWAITING CORRELATION";
  const alertLevel = correlation?.alert_level || "";

  if (isMobile) {
    return (
      <>
        <MobileTerminal
          snapshot={snapshot}
          correlation={correlation}
          loadingSweep={loadingSweep}
          loadingCorrelate={loadingCorrelate}
          sweepNow={sweepNow}
          correlate={correlate}
          onLogout={logout}
          onOpenHistory={() => setHistoryOpen(true)}
          sweepAge={secondsSinceSweep}
          sourcesCount={sources_count}
          headlineRisk={headlineRisk}
          alertLevel={alertLevel}
          activeRegion={activeRegion}
          setActiveRegion={setActiveRegion}
        />
        <SignalHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#EAF2F7] flex flex-col">
      <TopBar
        headlineRisk={headlineRisk}
        alertLevel={alertLevel}
        sweepAge={secondsSinceSweep}
        sourcesHealthy={sources_count.healthy}
        sourcesTotal={sources_count.total}
        onSweep={sweepNow}
        onCorrelate={correlate}
        onLogout={logout}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenBrowser={() => setBrowserOpen(true)}
        loadingSweep={loadingSweep}
        loadingCorrelate={loadingCorrelate}
      />
      <NewsTicker snapshot={snapshot} />
      <main className="flex-1 p-3 grid gap-3 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <LeftSidebar snapshot={snapshot} onLogout={logout} />
        <CenterPane snapshot={snapshot} correlation={correlation} activeRegion={activeRegion} setActiveRegion={setActiveRegion} loadingCorrelate={loadingCorrelate} onCorrelate={correlate} />
        <RightSidebar snapshot={snapshot} correlation={correlation} loadingCorrelate={loadingCorrelate} />
      </main>
      <SignalHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
      {browserOpen && <BrowserPanel onClose={() => setBrowserOpen(false)} />}
    </div>
  );
}
