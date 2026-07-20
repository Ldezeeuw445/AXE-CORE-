import { CityConfig, ChoicePoint, OSINTEvent } from "@/domain/maps3d/types";

export interface ExportData {
  city: CityConfig;
  choicePoints: ChoicePoint[];
  patrolRouteIds: string[];
  closedLoop: boolean;
  events: OSINTEvent[];
}

export async function exportMapToCanvas(mapContainer: HTMLDivElement): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#020204";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(6, 182, 212, 0.08)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 16px monospace";
  ctx.fillText("AXE TACTICAL MAP — SCREENSHOT", 20, 30);
  ctx.fillStyle = "#64748b";
  ctx.font = "10px monospace";
  ctx.fillText(`Generated: ${new Date().toUTCString()}`, 20, 48);

  ctx.fillStyle = "rgba(100, 116, 139, 0.5)";
  ctx.font = "8px monospace";
  ctx.fillText("AXE-CORE- INTELLIGENCE // SCREENSHOT CAPTURE", 20, canvas.height - 10);

  return canvas;
}

export function drawHighResTacticalMap(canvas: HTMLCanvasElement, data: ExportData) {
  const { city, choicePoints, patrolRouteIds, closedLoop, events } = data;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // 1. Clear & Background
  ctx.fillStyle = "#020204";
  ctx.fillRect(0, 0, width, height);

  // 2. Grid lines
  ctx.strokeStyle = "rgba(6, 182, 212, 0.08)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 3. Title
  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 16px monospace";
  ctx.fillText(`AXE TACTICAL MAP — ${city.name.toUpperCase()}`, 20, 30);
  ctx.fillStyle = "#64748b";
  ctx.font = "10px monospace";
  ctx.fillText(`Generated: ${new Date().toUTCString()}`, 20, 48);

  // 4. Waypoints
  if (choicePoints.length > 0) {
    ctx.font = "10px monospace";
    choicePoints.forEach((cp) => {
      const x = 50 + Math.random() * (width - 100);
      const y = 80 + Math.random() * (height - 150);
      ctx.fillStyle = cp.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(cp.label, x + 8, y + 3);
      ctx.fillStyle = "#64748b";
      ctx.font = "8px monospace";
      ctx.fillText(`[${cp.lat.toFixed(4)}, ${cp.lng.toFixed(4)}]`, x + 8, y + 14);
      ctx.font = "10px monospace";
    });
  }

  // 5. Patrol route
  if (patrolRouteIds.length > 1) {
    ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    // Simplified: draw a curved line between random points
    const startX = 80;
    const startY = 120;
    ctx.moveTo(startX, startY);
    for (let i = 1; i < patrolRouteIds.length; i++) {
      ctx.lineTo(startX + i * 60, startY + (i % 2 === 0 ? 40 : -30));
    }
    if (closedLoop) {
      ctx.lineTo(startX, startY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 6. Events
  if (events.length > 0) {
    ctx.font = "9px monospace";
    events.slice(0, 5).forEach((evt, i) => {
      const y = height - 30 - i * 14;
      ctx.fillStyle = evt.severity === "critical" ? "#f87171" : evt.severity === "warning" ? "#fbbf24" : "#22d3ee";
      ctx.fillText(`[${evt.severity.toUpperCase()}] ${evt.title}`, 20, y);
    });
  }

  // 7. Footer
  ctx.fillStyle = "rgba(100, 116, 139, 0.5)";
  ctx.font = "8px monospace";
  ctx.fillText("AXE-CORE- INTELLIGENCE // CLASSIFIED // EYES ONLY", 20, height - 10);
}
