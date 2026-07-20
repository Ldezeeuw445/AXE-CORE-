import React from "react";
import { OSINTEvent } from "@/domain/maps3d/types";
import { getIconForEvent } from "@/presentation/maps3d/eventIcons";
import { Clock, Radio } from "lucide-react";

interface EventFeedProps {
  events: OSINTEvent[];
}

export function EventFeed({ events }: EventFeedProps) {
  if (events.length === 0) {
    return (
      <div className="bg-[#050608] border border-cyan-950/60 rounded-xl p-4 font-sans select-none">
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">Live Event Feed</span>
        </div>
        <p className="text-[10px] text-slate-500 text-center py-4">No active events detected in this sector.</p>
      </div>
    );
  }

  const latest = events.slice(0, 4);

  return (
    <div className="bg-[#050608] border border-cyan-950/60 rounded-xl p-3 font-sans select-none shadow-xl">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-cyan-950/40">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">Live Event Feed</span>
        </div>
        <span className="text-[8px] text-slate-500 font-mono">{events.length} events</span>
      </div>
      <div className="space-y-2">
        {latest.map((evt, idx) => (
          <div
            key={idx}
            className={`border rounded-lg p-2 relative overflow-hidden ${
              evt.severity === "critical"
                ? "bg-rose-950/10 border-rose-500/20"
                : evt.severity === "warning"
                ? "bg-amber-950/10 border-amber-500/20"
                : "bg-black/30 border-cyan-950/40"
            }`}
          >
            <div className={`absolute top-0 left-0 w-0.5 h-full ${
              evt.severity === "critical"
                ? "bg-rose-500"
                : evt.severity === "warning"
                ? "bg-amber-500"
                : "bg-cyan-500/40"
            }`} />
            <div className="pl-2 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  {getIconForEvent(evt.type, evt.category)}
                  <span className="text-[10px] font-semibold text-slate-200 truncate">{evt.title}</span>
                </div>
                <span className={`text-[7px] font-mono uppercase px-1 py-0.5 rounded border ${
                  evt.severity === "critical"
                    ? "bg-rose-950/40 text-rose-300 border-rose-500/30"
                    : evt.severity === "warning"
                    ? "bg-amber-950/40 text-amber-300 border-amber-500/30"
                    : "bg-cyan-950/30 text-cyan-400 border-cyan-500/20"
                }`}>
                  {evt.severity}
                </span>
              </div>
              <p className="text-[9px] text-slate-400 leading-snug truncate">{evt.description}</p>
              <div className="flex items-center gap-1 text-[7px] text-slate-500 font-mono">
                <Clock className="w-2.5 h-2.5" />
                <span>{evt.timestamp}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
