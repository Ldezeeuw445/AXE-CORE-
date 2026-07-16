import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import { OSINTEvent } from "@/lib/maps3d/types";

interface D3RiskHeatmapOverlayProps {
  events: OSINTEvent[];
  width: number;
  height: number;
}

export function D3RiskHeatmapOverlay({ events, width, height }: D3RiskHeatmapOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Filter critical and warning events
    const riskEvents = events.filter(e => e.severity === "critical" || e.severity === "warning");
    if (riskEvents.length === 0) return;

    const colorMap: Record<string, string> = {
      critical: "#f87171",
      warning: "#fbbf24",
      info: "#22d3ee"
    };

    // Generate pseudo-random positions for risk zones
    const riskZones = riskEvents.map((evt, i) => ({
      x: 50 + (i * 70) % (width - 100),
      y: 50 + (i * 50) % (height - 100),
      radius: evt.severity === "critical" ? 40 : 25,
      color: colorMap[evt.severity] || "#22d3ee",
      severity: evt.severity,
      title: evt.title
    }));

    // Draw radial gradients for risk zones
    const defs = svg.append("defs");

    riskZones.forEach((zone, i) => {
      const gradientId = `risk-gradient-${i}`;
      const radialGradient = defs.append("radialGradient")
        .attr("id", gradientId)
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%");

      radialGradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", zone.color)
        .attr("stop-opacity", 0.4);

      radialGradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", zone.color)
        .attr("stop-opacity", 0);
    });

    svg.selectAll(".risk-zone")
      .data(riskZones)
      .enter()
      .append("circle")
      .attr("class", "risk-zone")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.radius)
      .attr("fill", (d, i) => `url(#risk-gradient-${i})`)
      .append("title")
      .text(d => `${d.title} [${d.severity.toUpperCase()}]`);

  }, [events, width, height]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    />
  );
}
