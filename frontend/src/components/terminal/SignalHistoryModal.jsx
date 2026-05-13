import React, { useEffect, useState } from "react";
import { Panel, Badge } from "../axe/Panel";
import { Spinner } from "../axe/Spinner";
import { History as HistoryIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { history as historyApi } from "../../lib/api";

export function SignalHistoryModal({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await historyApi.correlations(30, 0);
        if (mounted) { setRows(r.items || []); setIdx(0); }
      } catch (e) { console.error(e); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [open]);

  if (!open) return null;
  const cur = rows[idx];

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="signal-history-modal">
      <div className="axe-panel w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" style={{ background: "#0B0C0E" }}>
        <header className="axe-panel-header">
          <div className="flex items-center gap-2">
            <HistoryIcon size={14} className="text-[#66E6FF]"/>
            <span className="axe-panel-title">SIGNAL REPLAY · CORRELATIONS HISTORY</span>
          </div>
          <button onClick={onClose} className="text-[#6F8193] hover:text-[#FF4D6D]" data-testid="signal-history-close"><X size={14}/></button>
        </header>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <button onClick={() => setIdx((i) => Math.min(rows.length - 1, i + 1))} disabled={idx >= rows.length - 1}
            className="text-[#9FB0C0] hover:text-[#66E6FF] disabled:opacity-30 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em]">
            <ChevronLeft size={12}/> OLDER
          </button>
          <span className="text-[10px] text-[#9FB0C0] mx-2">{rows.length > 0 ? `${idx + 1} / ${rows.length}` : "0"}</span>
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}
            className="text-[#9FB0C0] hover:text-[#66E6FF] disabled:opacity-30 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em]">
            NEWER <ChevronRight size={12}/>
          </button>
          {cur && (
            <span className="ml-auto text-[10px] text-[#6F8193]">
              {cur.sweep_id} · {new Date(cur.created_at).toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-[11px] text-[#9FB0C0]"><Spinner variant="dots2" label="loading"/></div>}
          {!loading && cur && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone="amber">{cur.result?.headline_risk}</Badge>
                <Badge tone={cur.result?.alert_level === "HIGH" || cur.result?.alert_level === "CRITICAL" ? "alert" : "cyan"}>
                  {cur.result?.alert_level}
                </Badge>
              </div>
              <section>
                <div className="axe-section-label mb-1">SIGNALS</div>
                <ul className="space-y-2">
                  {(cur.result?.signals || []).map((s, i) => (
                    <li key={s.id || i} className="rounded-md bg-white/2 border border-white/6 p-2.5">
                      <div className="text-[12px] text-[#EAF2F7] font-semibold">{s.title}</div>
                      <div className="text-[11px] text-[#9FB0C0] mt-1">{s.narrative}</div>
                      <div className="flex items-center gap-1 flex-wrap mt-1.5">
                        {(s.sources_involved || []).map((src) => <Badge key={src} tone="cyan">{src}</Badge>)}
                        <Badge tone={s.confidence === "HIGH" ? "ok" : s.confidence === "LOW" ? "stale" : "cyan"}>{s.confidence}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <div className="axe-section-label mb-1">LEVERAGEABLE IDEAS</div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(cur.result?.leverageable_ideas || []).map((i, n) => (
                    <li key={i.id || n} className="rounded-md bg-white/2 border border-white/6 p-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={i.side === "LONG" ? "ok" : i.side === "SHORT" ? "error" : "cyan"}>{i.side}</Badge>
                        <Badge tone="cyan">{i.ticker_or_theme}</Badge>
                        <Badge tone="amber">{i.horizon}</Badge>
                        <Badge tone={i.confidence === "HIGH" ? "ok" : i.confidence === "LOW" ? "stale" : "cyan"}>{i.confidence}</Badge>
                      </div>
                      <div className="text-[11px] text-[#EAF2F7] mt-2">{i.thesis}</div>
                      <div className="text-[10px] text-[#FF7A45] mt-1"><span className="text-[#9FB0C0]">Risk:</span> {i.risk}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
          {!loading && !cur && <div className="text-[11px] text-[#9FB0C0]">No correlations stored yet.</div>}
        </div>
      </div>
    </div>
  );
}
