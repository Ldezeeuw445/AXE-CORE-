import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";

export default function WorldGlobe3D({ snapshot }) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 460 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const r = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    r.observe(wrapRef.current);
    return () => r.disconnect();
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls?.();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
        controls.enableDamping = true;
      }
      globeRef.current.pointOfView?.({ altitude: 2.2 }, 1200);
    }
  }, []);

  const points = useMemo(() => {
    const out = [];
    const air = (snapshot?.sources?.air?.items || []).filter(x => x.lat && x.lon).slice(0, 250);
    const thermal = (snapshot?.sources?.heatmap?.items || []).filter(x => x.lat && x.lon).slice(0, 300);
    const intel = (snapshot?.sources?.intel?.items || []).filter(x => x.lat && x.lon);
    const vessel = (snapshot?.sources?.vessel?.items || []).filter(x => x.lat && x.lon).slice(0, 200);
    const space = (snapshot?.sources?.space?.items || []).filter(x => x.lat && x.lon);
    air.forEach(p => out.push({ lat: p.lat, lng: p.lon, color: "#00D4FF", size: 0.18, label: p.callsign || p.icao24 }));
    thermal.forEach(p => out.push({ lat: p.lat, lng: p.lon, color: "#FF7A45", size: 0.25, label: `FRP ${p.frp}` }));
    vessel.forEach(p => out.push({ lat: p.lat, lng: p.lon, color: "#7C3AED", size: 0.16, label: `MMSI ${p.mmsi}` }));
    intel.forEach(p => out.push({ lat: p.lat, lng: p.lon, color: "#FF2E63", size: Math.min(1, (p.magnitude || 3) / 5), label: p.title }));
    space.forEach(p => out.push({ lat: p.lat, lng: p.lon, color: "#66E6FF", size: 0.4, label: p.title }));
    return out;
  }, [snapshot]);

  const arcs = useMemo(() => {
    const eq = (snapshot?.sources?.intel?.items || []).filter(x => x.category === "earthquake" && x.lat && x.lon).slice(0, 8);
    const air = (snapshot?.sources?.air?.items || []).filter(x => x.lat && x.lon).slice(0, 8);
    const out = [];
    for (let i = 0; i < Math.min(eq.length, air.length); i++) {
      out.push({
        startLat: eq[i].lat, startLng: eq[i].lon,
        endLat: air[i].lat, endLng: air[i].lon,
        color: ["#00D4FF", "#7C3AED"], stroke: 0.4,
      });
    }
    return out;
  }, [snapshot]);

  return (
    <div ref={wrapRef} className="absolute inset-0" data-testid="map-3d-container">
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere
        atmosphereColor="#00D4FF"
        atmosphereAltitude={0.18}
        globeImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-dark.jpg"
        bumpImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png"
        pointsData={points}
        pointAltitude={(d) => 0.005 + (d.size * 0.02)}
        pointColor={(d) => d.color}
        pointRadius={(d) => 0.2 + (d.size * 0.5)}
        pointLabel={(d) => `<span style='font-family:Inter;font-size:11px;color:#EAF2F7;background:#0B0C0E;padding:4px 6px;border:1px solid rgba(0,212,255,0.3);border-radius:6px'>${d.label || ""}</span>`}
        arcsData={arcs}
        arcColor={(d) => d.color}
        arcStroke={(d) => d.stroke || 0.35}
        arcDashLength={0.6}
        arcDashGap={0.3}
        arcDashAnimateTime={4000}
      />
    </div>
  );
}
