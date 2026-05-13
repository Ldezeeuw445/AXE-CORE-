import React, { useState } from "react";
import { Bell, Check, CheckCheck, X, Settings } from "lucide-react";
import { useAlerts } from "../../contexts/AlertsContext";
import { Badge } from "../axe/Panel";
import { AlertRulesModal } from "./AlertRulesModal";

function sevTone(s) {
  if (s === "HIGH" || s === "CRITICAL") return "alert";
  if (s === "MEDIUM") return "amber";
  return "cyan";
}

function timeAgo(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AlertBell({ compact = false }) {
  const { events, unread, ack, ackAll } = useAlerts();
  const [open, setOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const items = events.slice(0, 20);

  return (
    <>
      <div className="relative" data-testid="alert-bell-wrap">
        <button onClick={() => setOpen((v) => !v)} title="Alerts" data-testid="alert-bell"
          className={`relative inline-flex items-center gap-1 p-1.5 rounded-md ${unread > 0 ? "text-[#FFCC66]" : "text-[#9FB0C0]"} hover:text-[#66E6FF]`}>
          <Bell size={compact ? 14 : 14} className={unread > 0 ? "animate-pulse" : ""} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center text-[9px] font-semibold rounded-full px-1 min-w-[16px] h-[16px]"
              style={{ background: "#FF2E63", color: "#000", boxShadow: "0 0 10px #FF2E63" }}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 rounded-lg border border-white/10 overflow-hidden"
               style={{ background: "#0B0C0E", width: 360, maxHeight: "75vh",
                        boxShadow: "0 18px 50px rgba(0,0,0,0.7)" }} data-testid="alert-panel">
            <header className="px-3 py-2 flex items-center gap-2 border-b border-white/8">
              <Bell size={12} className="text-[#66E6FF]"/>
              <span className="text-[11px] font-semibold tracking-[0.10em]">ALERTS</span>
              <Badge tone="cyan" className="text-[9px]">{unread} UNREAD</Badge>
              <button onClick={ackAll} title="Acknowledge all" data-testid="alert-ack-all"
                className="ml-auto text-[#9FB0C0] hover:text-[#2EF2C2] inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em]">
                <CheckCheck size={12}/> Ack all
              </button>
              <button onClick={() => { setRulesOpen(true); setOpen(false); }} title="Manage rules"
                data-testid="alert-rules-open" className="text-[#9FB0C0] hover:text-[#66E6FF]">
                <Settings size={12}/>
              </button>
              <button onClick={() => setOpen(false)} className="text-[#9FB0C0] hover:text-[#FF4D6D]">
                <X size={12}/>
              </button>
            </header>
            <ul className="overflow-y-auto" style={{ maxHeight: "65vh" }}>
              {items.length === 0 && (
                <li className="px-4 py-6 text-center text-[11px] text-[#6F8193]">
                  No alerts yet. Configure rules to start watching.
                </li>
              )}
              {items.map((ev) => (
                <li key={ev.id} className={`px-3 py-2 border-b border-white/5 ${ev.acknowledged ? "opacity-60" : ""}`} data-testid={`alert-event-${ev.id}`}>
                  <div className="flex items-start gap-2">
                    <Badge tone={sevTone(ev.severity)} className="shrink-0">{ev.severity}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-[#EAF2F7] truncate">{ev.name}</div>
                      <div className="text-[10.5px] text-[#9FB0C0] leading-snug line-clamp-2">{ev.summary}</div>
                      <div className="text-[9px] text-[#6F8193] tracking-[0.06em] uppercase mt-1">{ev.layer} · {timeAgo(ev.triggered_at)}</div>
                    </div>
                    {!ev.acknowledged && (
                      <button onClick={() => ack(ev.id)} className="text-[#6F8193] hover:text-[#2EF2C2] p-0.5" title="Acknowledge" data-testid={`alert-ack-${ev.id}`}>
                        <Check size={12}/>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <AlertRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </>
  );
}
