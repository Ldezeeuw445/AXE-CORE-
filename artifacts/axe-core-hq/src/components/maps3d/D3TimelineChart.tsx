import React, { useRef, useEffect } from "react";
import { OSINTEvent } from "@/lib/maps3d/types";
import * as d3 from "d3";

interface D3TimelineChartProps {
  events: OSINTEvent[];
  cityName: string;
}

export function D3TimelineChart({ events, cityName }: D3TimelineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || events.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 600;
    const height = 80;
    const margin = { top: 10, right: 10, bottom: 20, left: 10 };

    svg.attr("width", width).attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Parse timestamps and create x scale
    const parseTime = (d: string) => new Date(d).getTime();
    const times = events.map(e => parseTime(e.timestamp)).filter(t => !isNaN(t));
    if (times.length === 0) return;

    const xExtent = d3.extent(times) as [number, number];
    const xScale = d3.scaleLinear().domain(xExtent).range([0, innerWidth]);

    // Severity color scale
    const colorScale = d3.scaleOrdinal<string, string>()
      .domain(["critical", "warning", "info"])
      .range(["#f87171", "#fbbf24", "#22d3ee"]);

    // Draw timeline axis
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", innerHeight / 2)
      .attr("y2", innerHeight / 2)
      .attr("stroke", "rgba(6, 182, 212, 0.3)")
      .attr("stroke-width", 1);

    // Draw event points
    g.selectAll(".event-dot")
      .data(events)
      .enter()
      .append("circle")
      .attr("class", "event-dot")
      .attr("cx", (d) => {
        const t = parseTime(d.timestamp);
        return isNaN(t) ? innerWidth / 2 : xScale(t);
      })
      .attr("cy", innerHeight / 2)
      .attr("r", (d) => d.severity === "critical" ? 5 : d.severity === "warning" ? 4 : 3)
      .attr("fill", (d) => colorScale(d.severity))
      .attr("opacity", 0.8)
      .append("title")
      .text((d) => `${d.title} [${d.severity}]`);

    // City label
    g.append("text")
      .attr("x", 0)
      .attr("y", innerHeight - 2)
      .attr("fill", "#64748b")
      .attr("font-size", "8px")
      .attr("font-family", "monospace")
      .text(`SECTOR: ${cityName.toUpperCase()} — ${events.length} EVENTS`);

  }, [events, cityName]);

  if (events.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-[10px] text-slate-500 font-mono border border-cyan-950/40 rounded-lg bg-black/40">
        No timeline events to visualize
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <svg ref={svgRef} className="w-full" style={{ height: 80 }} />
    </div>
  );
}
