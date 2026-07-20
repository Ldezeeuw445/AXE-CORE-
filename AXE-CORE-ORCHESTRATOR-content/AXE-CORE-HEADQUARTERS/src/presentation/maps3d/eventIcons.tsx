import { OSINTEvent } from "@/domain/maps3d/types";
import {
  AlertTriangle,
  Activity,
  Radio,
  CloudRain,
  Car,
  Info,
  ShieldAlert,
  Flame,
  Waves,
  Plane,
  Ship,
  MapPin,
  Globe,
  Zap,
  Crosshair,
} from "lucide-react";

export function getIconForEvent(type?: string, category?: string) {
  const key = `${type || ""}-${category || ""}`;

  if (type === "aircraft" || category === "aircraft" || key.includes("air")) {
    return <Plane className="w-3.5 h-3.5 text-sky-400" />;
  }
  if (type === "vessel" || category === "vessel" || key.includes("ship") || key.includes("marine")) {
    return <Ship className="w-3.5 h-3.5 text-indigo-400" />;
  }
  if (type === "seismic" || category === "seismic" || key.includes("earthquake") || key.includes("quake")) {
    return <Activity className="w-3.5 h-3.5 text-red-400" />;
  }
  if (type === "fire" || category === "fire" || key.includes("fire")) {
    return <Flame className="w-3.5 h-3.5 text-orange-500" />;
  }
  if (type === "tsunami" || category === "tsunami" || key.includes("tsunami")) {
    return <Waves className="w-3.5 h-3.5 text-blue-400" />;
  }
  if (type === "weather" || category === "weather" || key.includes("weather") || key.includes("storm")) {
    return <CloudRain className="w-3.5 h-3.5 text-cyan-400" />;
  }
  if (type === "traffic" || category === "traffic" || key.includes("traffic") || key.includes("road")) {
    return <Car className="w-3.5 h-3.5 text-amber-400" />;
  }
  if (type === "infrastructure" || category === "infrastructure" || key.includes("infra")) {
    return <Radio className="w-3.5 h-3.5 text-cyan-400" />;
  }
  if (type === "cyber" || category === "cyber" || key.includes("cyber")) {
    return <Zap className="w-3.5 h-3.5 text-violet-400" />;
  }
  if (type === "critical" || category === "critical" || key.includes("critical")) {
    return <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />;
  }
  if (type === "target" || category === "target" || key.includes("target")) {
    return <Crosshair className="w-3.5 h-3.5 text-orange-400" />;
  }
  if (type === "location" || category === "location" || key.includes("location")) {
    return <MapPin className="w-3.5 h-3.5 text-cyan-400" />;
  }
  if (type === "global" || category === "global" || key.includes("global")) {
    return <Globe className="w-3.5 h-3.5 text-emerald-400" />;
  }
  if (type === "warning" || category === "warning" || key.includes("warning")) {
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
  }
  if (type === "incident" || category === "incident" || key.includes("incident")) {
    return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
  }

  return <Info className="w-3.5 h-3.5 text-slate-400" />;
}
