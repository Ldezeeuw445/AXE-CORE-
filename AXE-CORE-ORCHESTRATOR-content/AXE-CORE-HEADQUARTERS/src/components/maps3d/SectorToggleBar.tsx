import React from "react";
import { SectorType } from "@/lib/maps3d/types";
import {
  Ship,
  Plane,
  Flame,
  AlertTriangle,
  Radiation,
  Server,
  Shield,
  TreePine,
} from "lucide-react";
import { getSectorCount } from "@/lib/maps3d/fleetData";

const SECTOR_CONFIG: {
  id: SectorType;
  label: string;
  icon: React.ElementType;
  color: string;
  activeBg: string;
  activeBorder: string;
  glow: string;
}[] = [
  {
    id: "maritime",
    label: "Maritime",
    icon: Ship,
    color: "text-cyan-400",
    activeBg: "bg-cyan-950/40",
    activeBorder: "border-cyan-500/50",
    glow: "shadow-cyan-500/20",
  },
  {
    id: "aviation",
    label: "Aviation",
    icon: Plane,
    color: "text-sky-400",
    activeBg: "bg-sky-950/40",
    activeBorder: "border-sky-500/50",
    glow: "shadow-sky-500/20",
  },
  {
    id: "seismic",
    label: "Seismic",
    icon: Flame,
    color: "text-amber-400",
    activeBg: "bg-amber-950/40",
    activeBorder: "border-amber-500/50",
    glow: "shadow-amber-500/20",
  },
  {
    id: "chokepoints",
    label: "Chokepoints",
    icon: AlertTriangle,
    color: "text-orange-400",
    activeBg: "bg-orange-950/40",
    activeBorder: "border-orange-500/50",
    glow: "shadow-orange-500/20",
  },
  {
    id: "nuclear",
    label: "Nuclear",
    icon: Radiation,
    color: "text-emerald-400",
    activeBg: "bg-emerald-950/40",
    activeBorder: "border-emerald-500/50",
    glow: "shadow-emerald-500/20",
  },
  {
    id: "data_centers",
    label: "Data Centers",
    icon: Server,
    color: "text-violet-400",
    activeBg: "bg-violet-950/40",
    activeBorder: "border-violet-500/50",
    glow: "shadow-violet-500/20",
  },
  {
    id: "war_zones",
    label: "War Zones",
    icon: Shield,
    color: "text-rose-400",
    activeBg: "bg-rose-950/40",
    activeBorder: "border-rose-500/50",
    glow: "shadow-rose-500/20",
  },
  {
    id: "environment",
    label: "Environment",
    icon: TreePine,
    color: "text-teal-400",
    activeBg: "bg-teal-950/40",
    activeBorder: "border-teal-500/50",
    glow: "shadow-teal-500/20",
  },
];

interface SectorToggleBarProps {
  activeSectors: Set<SectorType>;
  onToggle: (sector: SectorType) => void;
}

export default function SectorToggleBar({ activeSectors, onToggle }: SectorToggleBarProps) {
  return (
    <div className="flex items-center gap-0.5 md:gap-1 px-1 md:px-2 py-1 md:py-1.5 bg-[#030406]/95 backdrop-blur border-b border-cyan-950/60 overflow-x-auto custom-scrollbar">
      <div className="flex items-center gap-0.5 md:gap-1 min-w-max">
        <span className="hidden md:inline text-[9px] font-mono font-bold uppercase tracking-wider text-slate-500 mr-2 whitespace-nowrap">
          Sectors
        </span>
        {SECTOR_CONFIG.map((sector) => {
          const Icon = sector.icon;
          const isActive = activeSectors.has(sector.id);
          const count = getSectorCount(sector.id);
          return (
            <button
              key={sector.id}
              onClick={() => onToggle(sector.id)}
              className={`
                flex items-center gap-0.5 md:gap-1 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded border md:rounded-md text-[8px] md:text-[9px] font-mono font-bold uppercase tracking-wider
                transition-all duration-150 cursor-pointer whitespace-nowrap
                ${isActive
                  ? `${sector.color} ${sector.activeBg} ${sector.activeBorder} border shadow-sm ${sector.glow}`
                  : "border-cyan-950/30 text-slate-500 hover:text-slate-300 bg-black/30 hover:bg-black/50"
                }
              `}
              title={`${sector.label} (${count} assets)`}
            >
              <Icon className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
              <span className="hidden md:inline">{sector.label}</span>
              <span className={`
                text-[7px] md:text-[8px] px-0.5 md:px-1 py-0 rounded-full font-mono
                ${isActive ? "bg-white/10" : "bg-cyan-950/40 text-slate-600"}
              `}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
