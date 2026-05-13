import React, { useMemo } from "react";
import { CATEGORY_META } from "./intelMarkers";
import {
  Plane, Anchor, Flame, Activity, ShieldAlert, Satellite, Newspaper,
  LineChart, Radio, MapPin, Clock, Compass, Gauge, Layers, ExternalLink,
  Building2, Crosshair, Hash, Globe2, Ship, Zap, AlertTriangle
} from "lucide-react";

/**
 * IntelHoverPanel — Bloomberg/Palantir-grade hover/tap intel card.
 *
 * Props:
 *   - item: normalized OSINT item with `data`/extras
 *   - category: canonical category key from intelMarkers.CATEGORY_META
 *   - x, y: pixel coords (relative to map container)
 *   - mapWidth, mapHeight: container dims for edge clamping
 *   - mode: "hover" | "pinned"
 *   - onClose: () => void   (close when pinned)
 *   - onPin: () => void     (convert hover to pinned)
 *   - mobile: boolean       (bottom-sheet rendering)
 */
export function IntelHoverPanel({
  item, category, x = 0, y = 0,
  mapWidth = 1024, mapHeight = 600,
  mode = "hover", onClose, onPin, mobile = false,
}) {
  const meta = CATEGORY_META[category] || CATEGORY_META.intel;

  // Edge-aware positioning: open to the side with most room.
  const PANEL_W = 340;
  const PANEL_H = 260;
  const placeRight = x + 18 + PANEL_W < mapWidth - 8;
  const placeBottom = y + 12 + PANEL_H < mapHeight - 8;
  const left = mobile ? 8 : (placeRight ? x + 14 : x - PANEL_W - 14);
  const top  = mobile ? null : (placeBottom ? y + 12 : y - PANEL_H - 12);
  const bottom = mobile ? 12 : null;

  const Icon = pickIcon(category);
  const headline = pickHeadline(item, category);
  const subtitle = pickSubtitle(item, category);
  const fields = useMemo(() => buildFields(item, category), [item, category]);
  const action = pickAction(item, category);
  const sev = (item?.severity || item?.confidence || "MED").toUpperCase();

  return (
    <div
      data-testid="intel-hover-panel"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: mobile ? "fixed" : "absolute",
        left, top, bottom,
        right: mobile ? 8 : undefined,
        width: mobile ? "auto" : PANEL_W,
        zIndex: 950,
        pointerEvents: "auto",
      }}
      className="axe-intel-card"
    >
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "rgba(8, 11, 14, 0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: `1px solid ${meta.glow}`,
          boxShadow: `0 16px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,212,255,0.08), 0 0 32px ${meta.glow}`,
        }}
      >
        {/* Header */}
        <div className="px-3 py-2 flex items-center gap-2 border-b border-white/8"
             style={{ background: `linear-gradient(135deg, ${meta.glow}, rgba(0,0,0,0)) ` }}>
          <div
            className="w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0"
            style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${meta.color}55`, color: meta.color }}
          >
            <Icon size={15} strokeWidth={1.9}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.14em] uppercase font-semibold"
                 style={{ color: meta.color }}>
              {meta.symbol} · {meta.label}
            </div>
            <div className="text-[12px] font-semibold text-[#EAF2F7] truncate" title={headline}>
              {headline}
            </div>
          </div>
          <SeverityChip sev={sev} color={meta.color} />
          {mode === "pinned" && onClose && (
            <button onClick={onClose} className="ml-1 text-[#6F8193] hover:text-[#FF4D6D] text-[16px] leading-none px-1"
                    data-testid="intel-hover-close" aria-label="Close intel panel">×</button>
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div className="px-3 py-1.5 text-[10.5px] tracking-[0.04em] text-[#9FB0C0] border-b border-white/5">
            {subtitle}
          </div>
        )}

        {/* Fields grid */}
        <div className="px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {fields.map((f) => (
            <Field key={f.k} icon={f.icon} label={f.k} value={f.v} mono={f.mono} accent={f.accent} fullWidth={f.full} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-white/8 flex items-center justify-between gap-2">
          <div className="text-[9px] tracking-[0.10em] uppercase text-[#6F8193] flex items-center gap-1 truncate">
            <Radio size={10}/>
            <span className="truncate">{(item?.source || item?.layer || "OSINT").toUpperCase()}</span>
            <span className="text-white/15">·</span>
            <Clock size={10}/>
            <span className="truncate">{fmtTs(item?.ts)}</span>
          </div>
          <div className="flex items-center gap-2">
            {action && (
              <a href={action.href} target="_blank" rel="noreferrer"
                 className="text-[10px] tracking-[0.06em] uppercase font-semibold inline-flex items-center gap-1 hover:underline"
                 style={{ color: meta.color }}
                 data-testid="intel-hover-action">
                {action.label} <ExternalLink size={10}/>
              </a>
            )}
            {mode === "hover" && onPin && (
              <button onClick={onPin}
                      className="text-[10px] tracking-[0.06em] uppercase text-[#9FB0C0] hover:text-[#66E6FF]"
                      data-testid="intel-hover-pin">
                PIN
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SeverityChip({ sev, color }) {
  const m = {
    CRITICAL: { c: "#FF2E63", bg: "rgba(255,46,99,0.14)", b: "rgba(255,46,99,0.45)" },
    HIGH:     { c: "#FF7A45", bg: "rgba(255,122,69,0.14)", b: "rgba(255,122,69,0.45)" },
    LOW:      { c: "#9FB0C0", bg: "rgba(159,176,192,0.10)", b: "rgba(159,176,192,0.32)" },
    MED:      { c: color || "#66E6FF", bg: "rgba(102,230,255,0.10)", b: "rgba(102,230,255,0.38)" },
  };
  const s = m[sev] || m.MED;
  return (
    <span className="text-[9px] font-bold tracking-[0.10em] px-1.5 py-0.5 rounded"
          style={{ color: s.c, background: s.bg, border: `1px solid ${s.b}` }}>
      {sev}
    </span>
  );
}

function Field({ icon: Icon, label, value, mono, accent, fullWidth }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className={`min-w-0 ${fullWidth ? "col-span-2" : ""}`}>
      <div className="text-[8.5px] tracking-[0.10em] uppercase text-[#6F8193] flex items-center gap-1">
        {Icon && <Icon size={9}/>} {label}
      </div>
      <div className={`text-[11px] truncate ${mono ? "axe-num" : ""}`}
           style={{ color: accent || "#EAF2F7" }} title={String(value)}>
        {value}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function pickIcon(cat) {
  switch (cat) {
    case "jet": case "air":      return Plane;
    case "military":             return Plane;
    case "vessel": case "vessel_high": return Ship;
    case "thermal":              return Flame;
    case "quake":                return Activity;
    case "cyber":                return ShieldAlert;
    case "space":                return Satellite;
    case "news":                 return Newspaper;
    case "macro":                return LineChart;
    default:                     return AlertTriangle;
  }
}

function pickHeadline(item, cat) {
  if (!item) return meta(cat)?.label || "Intel Event";
  if (cat === "jet" || cat === "air" || cat === "military") {
    return item.owner || item.callsign || item.registration || item.icao24 || "Aircraft";
  }
  if (cat === "vessel" || cat === "vessel_high") {
    return item.impact_name || item.name || (item.mmsi ? `MMSI ${item.mmsi}` : "Vessel");
  }
  if (cat === "thermal") return `FRP ${item.frp ?? "?"} · ${item.satellite || "VIIRS"}`;
  if (cat === "quake")   return `M${(item.magnitude ?? 0).toFixed?.(1) || item.magnitude || "?"} · ${item.place || ""}`;
  if (cat === "cyber")   return item.title || item.cve_id || "Vulnerability";
  if (cat === "space")   return item.title || `NORAD ${item.norad_id ?? "?"}`;
  if (cat === "news")    return item.title || "News";
  return item.title || item.name || "Event";
}

function pickSubtitle(item, cat) {
  if (!item) return "";
  if (cat === "jet")   return [item.sector, item.aircraft_model || item.type, item.ticker].filter(Boolean).join(" · ");
  if (cat === "air")   return [item.origin_country, item.aircraft_model || item.type, item.callsign].filter(Boolean).join(" · ");
  if (cat === "military") return [item.origin_country, "Military / State", item.callsign].filter(Boolean).join(" · ");
  if (cat === "vessel_high") return [item.impact_type, item.operator, item.flag].filter(Boolean).join(" · ");
  if (cat === "vessel") return [item.ship_type_name, item.flag, item.destination].filter(Boolean).join(" · ");
  if (cat === "thermal") return [item.country || "", item.brightness ? `BT ${item.brightness}` : "", item.daynight ? `${item.daynight}` : ""].filter(Boolean).join(" · ");
  if (cat === "quake")   return [item.region, item.depth_km ? `${item.depth_km} km` : "", item.mag_type].filter(Boolean).join(" · ");
  if (cat === "cyber")   return [item.vendor, item.product, item.cvss ? `CVSS ${item.cvss}` : ""].filter(Boolean).join(" · ");
  if (cat === "space")   return [item.country || item.operator, item.orbit_type, item.purpose].filter(Boolean).join(" · ");
  if (cat === "news")    return [item.country, item.source].filter(Boolean).join(" · ");
  return "";
}

function buildFields(item, cat) {
  if (!item) return [];
  const f = [];
  if (cat === "jet" || cat === "air" || cat === "military") {
    f.push({ k: "CALLSIGN", v: item.callsign, mono: true, icon: Hash });
    f.push({ k: "REG.", v: item.registration || item.icao24, mono: true, icon: Hash });
    f.push({ k: "ALT", v: fmtNum(item.altitude_ft, " ft") || (item.geo_altitude_m ? `${Math.round(item.geo_altitude_m * 3.281)} ft` : null), mono: true, icon: Layers });
    f.push({ k: "SPEED", v: fmtNum(item.velocity_kt, " kt") || fmtNum(item.velocity, " kt"), mono: true, icon: Gauge });
    f.push({ k: "HEADING", v: item.true_track != null ? `${Math.round(item.true_track)}°` : null, mono: true, icon: Compass });
    f.push({ k: "ORIGIN", v: item.origin_country, icon: Globe2 });
    if (cat === "jet") {
      f.push({ k: "OWNER", v: item.owner, full: true, icon: Building2, accent: "#66E6FF" });
      f.push({ k: "SECTOR", v: item.sector, icon: Layers });
      f.push({ k: "TICKER", v: item.ticker, mono: true, accent: "#2EF2C2", icon: LineChart });
    }
    f.push({ k: "POS", v: fmtLatLon(item.lat, item.lon), mono: true, full: true, icon: MapPin });
    return f;
  }
  if (cat === "vessel" || cat === "vessel_high") {
    f.push({ k: "NAME", v: item.impact_name || item.name, full: true, accent: "#A78BFA", icon: Ship });
    f.push({ k: "MMSI", v: item.mmsi, mono: true, icon: Hash });
    f.push({ k: "IMO", v: item.imo, mono: true, icon: Hash });
    f.push({ k: "TYPE", v: item.impact_type || item.ship_type_name, icon: Layers });
    f.push({ k: "FLAG", v: item.flag, icon: Globe2 });
    f.push({ k: "SOG", v: item.sog != null ? `${Number(item.sog).toFixed(1)} kn` : null, mono: true, icon: Gauge });
    f.push({ k: "COG", v: item.cog != null ? `${Math.round(item.cog)}°` : null, mono: true, icon: Compass });
    f.push({ k: "DEST", v: item.destination, full: true, icon: Crosshair });
    if (cat === "vessel_high") {
      f.push({ k: "OPERATOR", v: item.operator, full: true, accent: "#66E6FF", icon: Building2 });
      f.push({ k: "SECTOR", v: item.sector, icon: Layers });
      f.push({ k: "TICKER", v: item.ticker, mono: true, accent: "#2EF2C2", icon: LineChart });
      if (item.dwt) f.push({ k: "DWT", v: `${item.dwt.toLocaleString()} t`, mono: true, icon: Layers });
      if (item.teu) f.push({ k: "TEU", v: item.teu.toLocaleString(), mono: true, icon: Layers });
      if (item.notes) f.push({ k: "NOTES", v: item.notes, full: true });
    }
    f.push({ k: "POS", v: fmtLatLon(item.lat, item.lon), mono: true, full: true, icon: MapPin });
    return f;
  }
  if (cat === "thermal") {
    f.push({ k: "FRP", v: `${item.frp || "?"} MW`, mono: true, icon: Flame, accent: "#FF7A45" });
    f.push({ k: "BRIGHT", v: item.brightness, mono: true, icon: Zap });
    f.push({ k: "CONF", v: item.confidence, icon: AlertTriangle });
    f.push({ k: "SAT", v: item.satellite, icon: Satellite });
    f.push({ k: "DAY/NIGHT", v: item.daynight, icon: Clock });
    f.push({ k: "COUNTRY", v: item.country, icon: Globe2 });
    f.push({ k: "POS", v: fmtLatLon(item.lat, item.lon), mono: true, full: true, icon: MapPin });
    return f;
  }
  if (cat === "quake") {
    f.push({ k: "MAGNITUDE", v: item.magnitude, mono: true, accent: "#FF2E63", icon: Activity });
    f.push({ k: "DEPTH", v: item.depth_km ? `${item.depth_km} km` : null, mono: true, icon: Layers });
    f.push({ k: "REGION", v: item.region || item.place, full: true, icon: Globe2 });
    f.push({ k: "TYPE", v: item.mag_type, icon: Layers });
    f.push({ k: "POS", v: fmtLatLon(item.lat, item.lon), mono: true, full: true, icon: MapPin });
    return f;
  }
  if (cat === "cyber") {
    f.push({ k: "CVE", v: item.cve_id, mono: true, accent: "#FF4D6D", icon: ShieldAlert });
    f.push({ k: "CVSS", v: item.cvss, mono: true, icon: Gauge });
    f.push({ k: "VENDOR", v: item.vendor, icon: Building2 });
    f.push({ k: "PRODUCT", v: item.product, icon: Layers });
    if (item.description) f.push({ k: "DESC", v: item.description, full: true });
    return f;
  }
  if (cat === "space") {
    f.push({ k: "NORAD", v: item.norad_id, mono: true, icon: Hash });
    f.push({ k: "ALT", v: item.altitude_km ? `${item.altitude_km.toFixed?.(1) ?? item.altitude_km} km` : null, mono: true, icon: Layers });
    f.push({ k: "OPERATOR", v: item.operator || item.country, icon: Building2 });
    f.push({ k: "PURPOSE", v: item.purpose, icon: Layers });
    f.push({ k: "POS", v: fmtLatLon(item.lat, item.lon), mono: true, full: true, icon: MapPin });
    return f;
  }
  if (cat === "news") {
    f.push({ k: "TITLE", v: item.title, full: true, accent: "#FFCC66" });
    f.push({ k: "SOURCE", v: item.source, icon: Radio });
    f.push({ k: "COUNTRY", v: item.country, icon: Globe2 });
    f.push({ k: "TIME", v: fmtTs(item.ts), mono: true, icon: Clock });
    return f;
  }
  // default
  f.push({ k: "DETAIL", v: item.title || item.summary, full: true });
  if (item.lat != null) f.push({ k: "POS", v: fmtLatLon(item.lat, item.lon), mono: true, full: true, icon: MapPin });
  return f;
}

function pickAction(item, cat) {
  if (!item) return null;
  if (cat === "cyber" && item.cve_id)
    return { label: "NVD record", href: `https://nvd.nist.gov/vuln/detail/${item.cve_id}` };
  if (cat === "quake" && item.url)
    return { label: "USGS detail", href: item.url };
  if (cat === "news" && item.url)
    return { label: "Read source", href: item.url };
  if ((cat === "jet" || cat === "air" || cat === "military") && item.icao24)
    return { label: "Flightradar", href: `https://globe.adsbexchange.com/?icao=${item.icao24}` };
  if ((cat === "vessel" || cat === "vessel_high") && item.mmsi)
    return { label: "MarineTraffic", href: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${item.mmsi}` };
  if (cat === "space" && item.norad_id)
    return { label: "N2YO orbit", href: `https://www.n2yo.com/satellite/?s=${item.norad_id}` };
  return null;
}

function fmtNum(v, unit = "") { return v != null ? `${Math.round(v).toLocaleString()}${unit}` : null; }
function fmtLatLon(lat, lon) {
  if (lat == null || lon == null) return null;
  return `${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}`;
}
function fmtTs(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toUTCString().replace("GMT", "Z"); } catch { return String(ts); }
}
function meta(cat) { return CATEGORY_META[cat] || CATEGORY_META.intel; }
