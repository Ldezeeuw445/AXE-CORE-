import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import * as d3 from "d3";
import type { ChoicePoint } from "@/domain/maps3d/types";

interface D3HeatmapOverlayProps {
  points: ChoicePoint[];
  enabled: boolean;
}

export function D3HeatmapOverlay({ points, enabled }: D3HeatmapOverlayProps) {
  const map = useMap();
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map || !enabled || points.length === 0 || typeof google === "undefined" || !google.maps) {
      if (overlayRef.current) {
        overlayRef.current.setMap(null);
        overlayRef.current = null;
      }
      return;
    }

    if (overlayRef.current) {
      overlayRef.current.setMap(null);
    }

    class HeatmapOverlay extends google.maps.OverlayView {
      private container: HTMLDivElement;

      constructor() {
        super();
        this.container = document.createElement("div");
        this.container.style.position = "absolute";
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.container.style.pointerEvents = "none";
      }

      onAdd() {
        const panes = this.getPanes();
        panes?.overlayLayer.appendChild(this.container);
      }

      draw() {
        const projection = this.getProjection();
        if (!projection) return;

        this.container.innerHTML = "";

        const parent = this.container.parentElement;
        if (!parent) return;
        const width = parent.clientWidth || 800;
        const height = parent.clientHeight || 600;

        const svg = d3
          .select(this.container)
          .append("svg")
          .attr("width", "100%")
          .attr("height", "100%")
          .style("position", "absolute")
          .style("top", 0)
          .style("left", 0);

        const defs = svg.append("defs");

        const filterLarge = defs.append("filter").attr("id", "d3-heatmap-blur-large");
        filterLarge.append("feGaussianBlur").attr("stdDeviation", "25");

        const filterMed = defs.append("filter").attr("id", "d3-heatmap-blur-med");
        filterMed.append("feGaussianBlur").attr("stdDeviation", "12");

        const filterSmall = defs.append("filter").attr("id", "d3-heatmap-blur-small");
        filterSmall.append("feGaussianBlur").attr("stdDeviation", "5");

        const pixelPoints = points.map((p) => {
          const latLng = new google.maps.LatLng(p.lat, p.lng);
          const pixel = projection.fromLatLngToDivPixel(latLng);
          return {
            x: pixel?.x ?? 0,
            y: pixel?.y ?? 0,
            color: p.color || "#22d3ee",
            label: p.label,
          };
        });

        const glowGroup = svg.append("g").style("mix-blend-mode", "screen");

        const gradientLayers = [
          { r: 80, opacity: 0.08, filter: "url(#d3-heatmap-blur-large)" },
          { r: 45, opacity: 0.16, filter: "url(#d3-heatmap-blur-med)" },
          { r: 20, opacity: 0.35, filter: "url(#d3-heatmap-blur-small)" },
          { r: 8, opacity: 0.7, filter: "none" },
        ];

        pixelPoints.forEach((point) => {
          gradientLayers.forEach((layer) => {
            glowGroup
              .append("circle")
              .attr("cx", point.x)
              .attr("cy", point.y)
              .attr("r", layer.r)
              .attr("fill", point.color)
              .style("opacity", layer.opacity)
              .style("filter", layer.filter);
          });
        });

        if (pixelPoints.length >= 2) {
          try {
            const densityData = d3
              .contourDensity<any>()
              .x((d) => d.x)
              .y((d) => d.y)
              .size([width, height])
              .bandwidth(35)
              .thresholds(8)(pixelPoints);

            const contourGroup = svg.append("g").style("mix-blend-mode", "screen").style("opacity", "0.55");

            contourGroup
              .selectAll("path")
              .data(densityData)
              .enter()
              .append("path")
              .attr("d", d3.geoPath())
              .attr("fill", "none")
              .attr("stroke", points[0].color || "#22d3ee")
              .attr("stroke-width", 0.75)
              .attr("stroke-dasharray", "3 4")
              .style("opacity", (d, i) => 0.15 + (i / densityData.length) * 0.45);
          } catch (err) {
            console.warn("D3 contour generation skipped:", err);
          }
        }
      }

      onRemove() {
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
        this.container.innerHTML = "";
      }
    }

    const overlay = new HeatmapOverlay();
    overlayRef.current = overlay;
    overlay.setMap(map);

    return () => {
      overlay.setMap(null);
      if (overlayRef.current === overlay) {
        overlayRef.current = null;
      }
    };
  }, [map, enabled, points]);

  return null;
}
