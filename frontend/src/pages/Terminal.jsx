import React, { useEffect, useMemo, useState, useCallback } from "react";
import { sources, ai } from "../lib/api";
import { TopBar } from "../components/terminal/TopBar";
import { LeftSidebar } from "../components/terminal/LeftSidebar";
import { RightSidebar } from "../components/terminal/RightSidebar";
import { CenterPane } from "../components/terminal/CenterPane";
import { NewsTicker } from "../components/terminal/NewsTicker";
import { useAuth } from "../contexts/AuthContext";

const REFRESH_MS = 30000;

export default function Terminal() {
  const { logout } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [loadingSweep, setLoadingSweep] = useState(false);
  const [loadingCorrelate, setLoadingCorrelate] = useState(false);
  const [lastSweepAt, setLastSweepAt] = useState(null);
  const [secondsSinceSweep, setSecondsSinceSweep] = useState(0);
  const [activeRegion, setActiveRegion] = useState("WORLD");

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

  // Initial load + auto refresh
  useEffect(() => {
    fetchLatest();
    (async () => {
      try { const c = await ai.latestCorrelation(); if (c?.status === "ok") setCorrelation(c.result); } catch {}
    })();
    const t = setInterval(fetchLatest, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchLatest]);

  // Sweep age counter
  useEffect(() => {
    const t = setInterval(() => {
      if (lastSweepAt) setSecondsSinceSweep(Math.floor((Date.now() - lastSweepAt.getTime())/1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastSweepAt]);

  // Auto-correlate first time after we have a snapshot
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
        loadingSweep={loadingSweep}
        loadingCorrelate={loadingCorrelate}
      />
      <NewsTicker snapshot={snapshot} />
      <main className="flex-1 p-3 grid gap-3 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <LeftSidebar snapshot={snapshot} onLogout={logout} />
        <CenterPane snapshot={snapshot} correlation={correlation} activeRegion={activeRegion} setActiveRegion={setActiveRegion} loadingCorrelate={loadingCorrelate} onCorrelate={correlate} />
        <RightSidebar snapshot={snapshot} correlation={correlation} loadingCorrelate={loadingCorrelate} />
      </main>
    </div>
  );
}
