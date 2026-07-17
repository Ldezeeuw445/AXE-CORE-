import React, { useRef, useEffect } from "react";
import * as d3 from "d3";
import { ChoicePoint } from "@/lib/maps3d/types";

interface D3PatrolRouteOverlayProps {
  choicePoints: ChoicePoint[];
  patrolRouteIds: string[];
  closedLoop: boolean;
  width: number;
  height: number;
}

export function D3PatrolRouteOverlay({ choicePoints, patrolRouteIds, closedLoop, width, height }: D3PatrolRouteOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || patrolRouteIds.length < 2) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const routePoints = patrolRouteIds
      .map(id => choicePoints.find(cp => cp.id === id))
      .filter(Boolean) as ChoicePoint[];

    if (routePoints.length < 2) return;

    // Map lat/lng to SVG coordinates (simplified projection)
    const lats = routePoints.map(p => p.lat);
    const lngs = routePoints.map(p => p.lng);
    const latExtent = d3.extent(lats) as [number, number];
    const lngExtent = d3.extent(lngs) as [number, number];

    const xScale = d3.scaleLinear().domain(lngExtent).range([20, width - 20]);
    const yScale = d3.scaleLinear().domain(latExtent).range([height - 20, 20]);

    const line = d3.line<ChoicePoint>()
      .x(d => xScale(d.lng))
      .y(d => yScale(d.lat))
      .curve(d3.curveCardinal);

    // Draw patrol route
    svg.append("path")
      .datum(closedLoop ? [...routePoints, routePoints[0]] : routePoints)
      .attr("fill", "none")
      .attr("stroke", "rgba(34, 211, 238, 0.6)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("d", line as any);

    // Draw points
    svg.selectAll(".route-point")
      .data(routePoints)
      .enter()
      .append("circle")
      .attr("class", "route-point")
      .attr("cx", d => xScale(d.lng))
      .attr("cy", d => yScale(d.lat))
      .attr("r", 5)
      .attr("fill", d => d.color)
      .attr("stroke", "#000")
      .attr("stroke-width", 1)
      .append("title")
      .text(d => d.label);

  }, [choicePoints, patrolRouteIds, closedLoop, width, height]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
    />
  );
}
