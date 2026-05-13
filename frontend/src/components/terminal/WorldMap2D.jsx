import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { buildDivIcon, categoryFromItem, severityFromString } from "./intelMarkers";
import { IntelHoverPanel } from "./IntelHoverPanel";

/** Smoothly re-center on region change. */
function RegionView({ view }) {
  const map = useMap();
  useEffect(() => {
    if (view) map.flyTo(view.center, view.zoom, { duration: 0.8 });
    else map.flyTo([20, 0], 2, { duration: 0.8 });
  }, [view, map]);
  return null;
}

/** Closes hover panel when user clicks the map (and clears pinned). */
function MapClickClear({ onClear }) {
  useMapEvents({ click: () => onClear() });
  return null;
}

/** Renders the hover/pinned IntelHoverPanel inside the map at pixel coords. */
function HoverLayer({ active, onClear, onPin, mobile }) {
  const map = useMap();
  const [dims, setDims] = useState({ w: 1024, h: 600 });
  useEffect(() => {
    const update = () => {
      const c = map.getContainer();
      setDims({ w: c.clientWidth, h: c.clientHeight });
    };
    update();
    map.on("resize zoomend moveend", update);
    return () => map.off("resize zoomend moveend", update);
  }, [map]);

  if (!active) return null;
  const pt = map.latLngToContainerPoint([active.item.lat, active.item.lon]);
  return (
    <IntelHoverPanel
      item={active.item}
      category={active.category}
      x={pt.x}
      y={pt.y}
      mapWidth={dims.w}
      mapHeight={dims.h}
      mode={active.pinned ? "pinned" : "hover"}
      onClose={onClear}
      onPin={onPin}
      mobile={mobile}
    />
  );
}

export default function WorldMap2D({ snapshot, view, mobile = false, fullBleed = false }) {
  const [active, setActive] = useState(null); // { item, category, pinned }
  const hoverTimer = useRef(null);

  const clearHover = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setActive((cur) => (cur?.pinned ? cur : null));
  }, []);

  const clearAll = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setActive(null);
  }, []);

  const showHover = useCallback((item, category) => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setActive((cur) => (cur?.pinned ? cur : { item, category, pinned: false }));
  }, []);

  const pinActive = useCallback(() => {
    setActive((cur) => (cur ? { ...cur, pinned: true } : cur));
  }, []);

  // Cleanup timer on unmount
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  // ---- Build per-layer datasets ----
  const layers = useMemo(() => {
    const s = snapshot?.sources || {};
    const air = (s.air?.items || []).filter((x) => x.lat != null && x.lon != null);
    const air_jets = air.filter((x) => x.is_registry_match || x.is_corporate);
    const air_mil  = air.filter((x) => x.is_military);
    const air_reg  = air.filter((x) => !x.is_registry_match && !x.is_corporate && !x.is_military).slice(0, 220);

    const vessel = (s.vessel?.items || []).filter((x) => x.lat != null && x.lon != null);
    const vessel_hi  = vessel.filter((x) => x.is_registry_match);
    const vessel_reg = vessel.filter((x) => !x.is_registry_match).slice(0, 240);

    return {
      air_jets,
      air_mil,
      air_reg,
      thermal: (s.heatmap?.items || []).filter((x) => x.lat != null && x.lon != null).slice(0, 380),
      vessel_hi,
      vessel_reg,
      intel: (s.intel?.items || []).filter((x) => x.lat != null && x.lon != null),
      space: (s.space?.items || []).filter((x) => x.lat != null && x.lon != null),
    };
  }, [snapshot]);

  // ---- Route arcs: link recent earthquakes to monitoring aircraft ----
  const arcs = useMemo(() => {
    const eq = (snapshot?.sources?.intel?.items || [])
      .filter((x) => x.category === "earthquake" && x.lat != null && x.lon != null).slice(0, 6);
    const air = (snapshot?.sources?.air?.items || [])
      .filter((x) => x.lat != null && x.lon != null).slice(0, 6);
    const out = [];
    for (let i = 0; i < Math.min(eq.length, air.length); i++) {
      out.push([[eq[i].lat, eq[i].lon], [air[i].lat, air[i].lon]]);
    }
    return out;
  }, [snapshot]);

  // Stable icon builder — memo by category+severity+rotation
  const iconFor = useCallback((category, item) => {
    const sev = severityFromString(item?.severity || item?.confidence);
    return buildDivIcon({
      category,
      size: sizeFor(category),
      rotation: rotForCategory(category, item),
      severity: sev,
      pulse: pulseFor(category, item),
    });
  }, []);

  const handlers = useCallback((item, category) => ({
    mouseover: () => showHover(item, category),
    mouseout: () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => clearHover(), 180);
    },
    click: () => { showHover(item, category); pinActive(); },
  }), [showHover, clearHover, pinActive]);

  return (
    <MapContainer
      center={[20, 0]} zoom={2} minZoom={2} maxZoom={9} scrollWheelZoom={true}
      preferCanvas={false}
      style={{ height: "100%", width: "100%", borderRadius: fullBleed ? 0 : 0, background: "#050505" }}
      data-testid="map-2d-container"
      attributionControl={true}
      worldCopyJump={true}
      zoomControl={!mobile}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        subdomains="abcd" maxZoom={19}
      />
      <RegionView view={view} />
      <MapClickClear onClear={clearAll} />

      {/* Background regular air traffic (small) */}
      {layers.air_reg.map((p) => (
        <Marker key={`air_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("air", p)} eventHandlers={handlers(p, "air")} />
      ))}

      {/* Military / state aircraft */}
      {layers.air_mil.map((p) => (
        <Marker key={`mil_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("military", p)} eventHandlers={handlers(p, "military")} />
      ))}

      {/* Corporate jets (registry matched) — premium */}
      {layers.air_jets.map((p) => (
        <Marker key={`jet_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("jet", p)} eventHandlers={handlers(p, "jet")} />
      ))}

      {/* Thermal / fire */}
      {layers.thermal.map((p) => (
        <Marker key={`ther_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("thermal", p)} eventHandlers={handlers(p, "thermal")} />
      ))}

      {/* Regular vessels */}
      {layers.vessel_reg.map((p) => (
        <Marker key={`v_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("vessel", p)} eventHandlers={handlers(p, "vessel")} />
      ))}

      {/* Strategic vessels (registry matched) — premium */}
      {layers.vessel_hi.map((p) => (
        <Marker key={`vhi_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("vessel_high", p)} eventHandlers={handlers(p, "vessel_high")} />
      ))}

      {/* Intel: earthquakes + cyber */}
      {layers.intel.map((p) => {
        const cat = categoryFromItem(p, "intel");
        return (
          <Marker key={`int_${p.id}`} position={[p.lat, p.lon]} icon={iconFor(cat, p)} eventHandlers={handlers(p, cat)} />
        );
      })}

      {/* Spacecraft (ISS / sample sats) */}
      {layers.space.map((p) => (
        <Marker key={`sp_${p.id}`} position={[p.lat, p.lon]} icon={iconFor("space", p)} eventHandlers={handlers(p, "space")} />
      ))}

      {/* Arcs */}
      {arcs.map((seg, i) => (
        <Polyline key={`arc_${i}`} positions={seg}
                  pathOptions={{ color: "#00D4FF", weight: 1.1, opacity: 0.55, dashArray: "4 6" }} />
      ))}

      {/* Hover / pinned panel */}
      <HoverLayer active={active} onClear={clearAll} onPin={pinActive} mobile={mobile} />
    </MapContainer>
  );
}

function sizeFor(cat) {
  if (cat === "jet" || cat === "vessel_high") return 26;
  if (cat === "military") return 24;
  if (cat === "quake") return 22;
  if (cat === "space") return 24;
  if (cat === "thermal") return 18;
  if (cat === "cyber") return 22;
  if (cat === "news" || cat === "macro") return 20;
  if (cat === "vessel") return 16;
  return 16; // air regular
}

function rotForCategory(cat, item) {
  if (!item) return 0;
  if (cat === "jet" || cat === "air" || cat === "military") {
    const t = item.true_track ?? item.heading ?? item.cog;
    if (t != null) return Number(t);
  }
  if (cat === "vessel" || cat === "vessel_high") {
    const t = item.heading ?? item.cog;
    if (t != null) return Number(t);
  }
  return 0;
}

function pulseFor(cat, item) {
  if (cat === "jet" || cat === "vessel_high") return true;
  if (cat === "quake" && (item?.magnitude ?? 0) >= 5) return true;
  if (cat === "cyber" && (item?.cvss ?? 0) >= 9) return true;
  return false;
}
