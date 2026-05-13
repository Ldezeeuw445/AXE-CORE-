import React from "react";
import { TriangleLogo } from "../axe/TriangleLogo";
import { Badge } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import { Activity, Globe, Power, RefreshCcw, Sparkles } from "lucide-react";

function fmtAge(s) {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

export function TopBar({ headlineRisk, alertLevel, sweepAge, sourcesHealthy, sourcesTotal, onSweep, onCorrelate, onLogout, loadingSweep, loadingCorrelate }) {
  const isHigh = (alertLevel || "").toUpperCase() === "HIGH" || (alertLevel || "").toUpperCase() === "CRITICAL";
  return (
    <header className="axe-topbar px-4 py-2 flex items-center gap-3 justify-between" data-testid="topbar">
      <div className="flex items-center gap-3 min-w-0">
        <TriangleLogo size={22} animate />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[12px] font-semibold tracking-[0.16em] text-[#EAF2F7]">AXE INTELLIGENCE</span>
          <span className="text-[9px] tracking-[0.18em] uppercase text-[#6F8193]">TERMINAL · OPERATOR MODE</span>
        </div>
        {headlineRisk && (
          <div className="ml-3 px-2 py-1 rounded-md border flex items-center gap-2"
               style={{ borderColor: "rgba(255,204,102,0.25)", background: "#0B0C0E", borderLeft: "2px solid #FFCC66" }}
               data-testid="topbar-headline-risk">
            <Activity size={12} className="text-[#FFCC66]" />
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#FFCC66]">
              {headlineRisk}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[10px] tracking-[0.08em] uppercase text-[#9FB0C0]" data-testid="topbar-sweep-timer">
          <span className="text-[#6F8193]">SWEEP</span>
          <span className="axe-num text-[#EAF2F7]">{fmtAge(sweepAge)}</span>
          {loadingSweep && <Spinner variant="dots" className="ml-1" />}
        </div>
        <div className="flex items-center gap-1 text-[10px] tracking-[0.08em] uppercase text-[#9FB0C0]" data-testid="topbar-sources-count">
          <Globe size={12} className="text-[#66E6FF]" />
          <span className="text-[#6F8193]">SOURCES</span>
          <span className="axe-num text-[#EAF2F7]">{sourcesHealthy}/{sourcesTotal}</span>
        </div>
        {alertLevel && (
          <Badge tone={isHigh ? "alert" : "amber"} dataTestId="topbar-alert-badge">
            {alertLevel} ALERT
          </Badge>
        )}
        <button onClick={onSweep} className="axe-btn text-[10px] tracking-[0.08em] uppercase px-2 py-1 rounded-md border border-white/10 text-[#C9D6E2] hover:text-[#66E6FF] hover:border-[#00D4FF]/30 transition-colors inline-flex items-center gap-1"
          data-testid="topbar-sweep-button">
          <RefreshCcw size={12}/> SWEEP NOW
        </button>
        <button onClick={onCorrelate} className="axe-btn text-[10px] tracking-[0.08em] uppercase px-2 py-1 rounded-md bg-[#00D4FF] text-black font-semibold hover:bg-[#66E6FF] transition-colors inline-flex items-center gap-1"
          data-testid="topbar-correlate-button">
          {loadingCorrelate ? <Spinner variant="braille" colorClassName="text-black"/> : <Sparkles size={12}/>}
          AXE CORRELATE
        </button>
        <button onClick={onLogout} title="Sign out" className="text-[#6F8193] hover:text-[#FF4D6D] transition-colors p-1" data-testid="topbar-logout-button">
          <Power size={14}/>
        </button>
      </div>
    </header>
  );
}
