import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function RegionView({ view }) {
  const map = useMap();
  useEffect(() => {
    if (view) map.flyTo(view.center, view.zoom, { duration: 0.8 });
    else map.flyTo([20, 0], 2, { duration: 0.8 });
  }, [view, map]);
  return null;
}

const COLORS = {
  air: "#00D4FF",
  thermal: "#FF7A45",
  vessel: "#7C3AED",
  intel: "#FF2E63",
  space: "#66E6FF",
  news: "#FFCC66",
};

export default function WorldMap2D({ snapshot, view }) {
  const layers = useMemo(() => {
    const s = snapshot?.sources || {};
    return {
      air: (s.air?.items || []).filter((x) => x.lat && x.lon).slice(0, 250),
      thermal: (s.heatmap?.items || []).filter((x) => x.lat && x.lon).slice(0, 400),
      vessel: (s.vessel?.items || []).filter((x) => x.lat && x.lon).slice(0, 250),
      intel: (s.intel?.items || []).filter((x) => x.lat && x.lon),
      space: (s.space?.items || []).filter((x) => x.lat && x.lon),
    };
  }, [snapshot]);

  // Route arcs: from significant earthquakes to a few air theaters (illustrative cross-source link)
  const arcs = useMemo(() => {
    const eq = (snapshot?.sources?.intel?.items || [])
      .filter((x) => x.category === "earthquake" && x.lat && x.lon).slice(0, 8);
    const air = (snapshot?.sources?.air?.items || [])
      .filter((x) => x.lat && x.lon).slice(0, 8);
    const out = [];
    for (let i = 0; i < Math.min(eq.length, air.length); i++) {
      out.push([[eq[i].lat, eq[i].lon], [air[i].lat, air[i].lon]]);
    }
    return out;
  }, [snapshot]);

  return (
    <MapContainer
      center={[20, 0]} zoom={2} minZoom={2} maxZoom={9} scrollWheelZoom={true}
      preferCanvas={true}
      style={{ height: "100%", width: "100%", borderRadius: 0, background: "#050505" }}
      data-testid="map-2d-container"
      attributionControl={true}
      worldCopyJump={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        subdomains="abcd" maxZoom={19}
      />
      <RegionView view={view} />

      {/* Air traffic */}
      {layers.air.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={2.2} pathOptions={{ color: COLORS.air, weight: 0, fillColor: COLORS.air, fillOpacity: 0.85 }}>
          <Tooltip direction="top" offset={[0, -2]} opacity={0.9} className="axe-leaflet-tooltip">
            <div style={{ fontSize: 11 }}>{p.callsign || p.icao24} · {p.origin_country || p.registration || ""}</div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Thermal */}
      {layers.thermal.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={Math.max(1.5, Math.min(6, (p.frp_num || 1) / 4))} pathOptions={{ color: COLORS.thermal, weight: 0, fillColor: COLORS.thermal, fillOpacity: 0.85 }}>
          <Tooltip>
            <div style={{ fontSize: 11 }}>FRP {p.frp} · {p.satellite}</div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Vessels */}
      {layers.vessel.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={2} pathOptions={{ color: COLORS.vessel, weight: 0, fillColor: COLORS.vessel, fillOpacity: 0.85 }}>
          <Tooltip>
            <div style={{ fontSize: 11 }}>MMSI {p.mmsi} · SOG {p.sog}</div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Intel (earthquakes + cyber) */}
      {layers.intel.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={Math.max(3, Math.min(10, (p.magnitude || 2)))} pathOptions={{ color: COLORS.intel, weight: 1.2, fillColor: COLORS.intel, fillOpacity: 0.35 }}>
          <Tooltip>
            <div style={{ fontSize: 11 }}>{p.title}</div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Space (ISS) */}
      {layers.space.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={4} pathOptions={{ color: COLORS.space, weight: 1.5, fillColor: COLORS.space, fillOpacity: 0.6 }}>
          <Tooltip>
            <div style={{ fontSize: 11 }}>{p.title} · {p.altitude_km?.toFixed?.(1)} km</div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Arcs */}
      {arcs.map((seg, i) => (
        <Polyline key={`arc_${i}`} positions={seg} pathOptions={{ color: "#00D4FF", weight: 1.1, opacity: 0.55, dashArray: "4 6" }} />
      ))}
    </MapContainer>
  );
}
