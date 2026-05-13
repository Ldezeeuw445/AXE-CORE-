/**
 * IntelMarker factory — premium SVG glyphs per OSINT category for Leaflet divIcons.
 * Each category emits a unique, recognizable symbol with severity-encoded glow.
 *
 * Exports:
 *   - CATEGORY_META  : { color, glow, label, description }
 *   - buildDivIcon   : returns a Leaflet divIcon for a category/severity/rotation
 *   - categoryFromItem(item) : derives a canonical category from a normalized item
 */
import L from "leaflet";

export const CATEGORY_META = {
  jet:     { color: "#66E6FF", glow: "rgba(0, 212, 255, 0.55)",  label: "Corp. Aircraft",     symbol: "AIR-CORP"  },
  air:     { color: "#00D4FF", glow: "rgba(0, 212, 255, 0.40)",  label: "Air Traffic",        symbol: "AIR"       },
  military:{ color: "#FF7A45", glow: "rgba(255, 122, 69, 0.55)", label: "Military Aircraft",  symbol: "MIL-AIR"   },
  vessel_high: { color: "#A78BFA", glow: "rgba(167, 139, 250, 0.60)", label: "Strategic Vessel", symbol: "VSL-HI" },
  vessel:  { color: "#7C3AED", glow: "rgba(124, 58, 237, 0.45)", label: "Vessel (AIS)",       symbol: "VSL"       },
  thermal: { color: "#FF6A2C", glow: "rgba(255, 106, 44, 0.55)", label: "Thermal / Fire",     symbol: "FIRE"      },
  quake:   { color: "#FF2E63", glow: "rgba(255, 46, 99, 0.55)",  label: "Seismic Event",      symbol: "EQ"        },
  cyber:   { color: "#FF4D6D", glow: "rgba(255, 77, 109, 0.55)", label: "Cyber / Vuln.",      symbol: "CVE"       },
  space:   { color: "#7CF6FF", glow: "rgba(124, 246, 255, 0.55)",label: "Spacecraft",         symbol: "ORB"       },
  news:    { color: "#FFCC66", glow: "rgba(255, 204, 102, 0.50)",label: "News Event",         symbol: "NEWS"      },
  macro:   { color: "#2EF2C2", glow: "rgba(46, 242, 194, 0.55)", label: "Macro Indicator",    symbol: "MAC"       },
  intel:   { color: "#FFCC66", glow: "rgba(255, 204, 102, 0.50)",label: "OSINT Event",        symbol: "INT"       },
};

/** Derive a canonical category from any normalized OSINT item. */
export function categoryFromItem(item, layer) {
  if (!item) return layer || "intel";
  if (layer === "air") {
    if (item.is_registry_match || item.is_corporate) return "jet";
    if (item.is_military) return "military";
    return "air";
  }
  if (layer === "vessel" || item.layer === "vessel") {
    if (item.is_registry_match) return "vessel_high";
    return "vessel";
  }
  if (layer === "heatmap") return "thermal";
  if (layer === "space") return "space";
  if (layer === "news") return "news";
  if (layer === "macro") return "macro";
  if (layer === "intel") {
    if (item.category === "earthquake") return "quake";
    if (item.category === "cyber-vuln" || item.category === "cyber") return "cyber";
    return "intel";
  }
  return layer || "intel";
}

/** SVG glyph for each category — drawn at viewBox 0 0 24 24 in white; tinted via CSS color. */
const GLYPHS = {
  jet:
    `<path d="M2 14l9-2V5.5a1.5 1.5 0 1 1 3 0V12l8 2v2l-8-1.5V19l3 1.5V22l-4.5-1L8 22v-1.5L11 19v-4.5L2 16z"
       fill="currentColor"/>`,
  air:
    `<path d="M2 14l9-2V5.5a1.5 1.5 0 1 1 3 0V12l8 2v2l-8-1.5V19l3 1.5V22l-4.5-1L8 22v-1.5L11 19v-4.5L2 16z"
       fill="currentColor"/>`,
  military:
    `<path d="M12 2l2.2 5.4L20 8.2l-4 3.9.9 5.6L12 15l-4.9 2.7L8 12.1 4 8.2l5.8-.8L12 2z" fill="currentColor"/>`,
  vessel:
    `<path d="M12 2l4 5H8l4-5zm-7 7h14v3H5V9zm-1 4h16l-2 7H6l-2-7zm8-3v3" stroke="currentColor"
       stroke-width="1.6" fill="currentColor" fill-opacity="0.35" stroke-linejoin="round"/>`,
  vessel_high:
    `<path d="M12 1l5 6H7l5-6zm-8 7h16v3H4V8zm-1 4h18l-2.4 8H5.4L3 12zm9-2.5v2.5"
       stroke="currentColor" stroke-width="1.7" fill="currentColor" fill-opacity="0.45" stroke-linejoin="round"/>
     <circle cx="12" cy="3.5" r="1.4" fill="currentColor"/>`,
  thermal:
    `<path d="M12 2c1 3 4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-4 0-7z"
       fill="currentColor"/>`,
  quake:
    `<path d="M2 12h3l2-5 3 10 3-13 3 16 2-8 2 5h2"
       stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  cyber:
    `<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"
       stroke="currentColor" stroke-width="1.6" fill="currentColor" fill-opacity="0.25" stroke-linejoin="round"/>
     <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  space:
    `<path d="M5 12a7 7 0 1 1 14 0 7 7 0 0 1-14 0z" stroke="currentColor" stroke-width="1.4" fill="none"/>
     <path d="M2 12a10 10 0 0 0 20 0" stroke="currentColor" stroke-width="1.1" fill="none" stroke-dasharray="2 3"/>
     <circle cx="12" cy="12" r="2.2" fill="currentColor"/>`,
  news:
    `<rect x="3" y="5" width="16" height="14" rx="1.4" stroke="currentColor" stroke-width="1.5"
       fill="currentColor" fill-opacity="0.18"/>
     <path d="M6 9h10M6 12h10M6 15h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  macro:
    `<path d="M3 19V5m4 14V11m4 8V8m4 11v-5m4 5V6" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" fill="none"/>`,
  intel:
    `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.15"/>
     <circle cx="12" cy="12" r="3" fill="currentColor"/>`,
};

/**
 * Build a Leaflet divIcon for a category.
 * @param {Object} opts
 * @param {string} opts.category - one of CATEGORY_META keys
 * @param {number} [opts.size=22] - icon edge size in px
 * @param {number} [opts.rotation=0] - degrees, for aircraft heading
 * @param {("low"|"med"|"high"|"crit")} [opts.severity="med"] - controls glow intensity
 * @param {boolean} [opts.pulse=false] - animated halo for live/registry items
 */
export function buildDivIcon({ category = "intel", size = 22, rotation = 0, severity = "med", pulse = false } = {}) {
  const meta = CATEGORY_META[category] || CATEGORY_META.intel;
  const glyph = GLYPHS[category] || GLYPHS.intel;
  const sevScale = severity === "crit" ? 1.35 : severity === "high" ? 1.18 : severity === "low" ? 0.85 : 1;
  const haloAlpha = severity === "crit" ? 0.85 : severity === "high" ? 0.70 : severity === "low" ? 0.35 : 0.55;
  const px = Math.round(size * sevScale);
  const half = Math.round(px / 2);
  const rotateStyle = rotation ? `transform:rotate(${rotation}deg);` : "";
  const pulseHtml = pulse
    ? `<span class="axe-intel-marker-pulse" style="--ring:${meta.glow}"></span>`
    : "";
  const html = `
    <div class="axe-intel-marker" style="width:${px}px;height:${px}px;color:${meta.color};filter:drop-shadow(0 0 6px ${meta.glow});${rotateStyle}">
      ${pulseHtml}
      <svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">${glyph}</svg>
    </div>`;
  return L.divIcon({
    className: `axe-marker axe-marker-${category}`,
    html,
    iconSize: [px, px],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
    // expose for any consumer that wants to alter halo dynamically
    _haloAlpha: haloAlpha,
  });
}

/** Convenience: severity ranker from severity strings (LOW/MEDIUM/HIGH/CRITICAL). */
export function severityFromString(s) {
  const v = String(s ?? "").toUpperCase();
  if (v === "CRITICAL" || v === "CRIT") return "crit";
  if (v === "HIGH") return "high";
  if (v === "LOW") return "low";
  return "med";
}
