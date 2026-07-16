import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import { OSINTEvent } from "@/lib/maps3d/types";

interface D3HeatmapOverlayProps {
  events: OSINTEvent[];
  width: number;
  height: number;
}

export function D3HeatmapOverlay({ events, width, height }: D3HeatmapOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const colorScale = d3.scaleOrdinal<string, string>()
      .domain(["critical", "warning", "info"])
      .range(["#f87171", "#fbbf24", "#22d3ee"]);

    // Create heatmap cells based on event density
    const gridSize = 30;
    const cols = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);

    const data: { x: number; y: number; value: number; severity: string }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const eventCount = events.filter((_, i) => (i + c * r) % Math.max(1, Math.floor(cols / 2)) === 0).length;
        if (eventCount > 0) {
          const severity = events[Math.floor(Math.random() * events.length)]?.severity || "info";
          data.push({ x: c * gridSize, y: r * gridSize, value: eventCount, severity });
        }
      }
    }

    const maxValue = d3.max(data, d => d.value) || 1;
    const opacityScale = d3.scaleLinear().domain([0, maxValue]).range([0.1, 0.5]);

    svg.selectAll(".heat-cell")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "heat-cell")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", gridSize)
      .attr("height", gridSize)
      .attr("fill", d => colorScale(d.severity))
      .attr("opacity", d => opacityScale(d.value))
      .attr("rx", 4);

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
