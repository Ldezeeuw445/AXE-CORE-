/**
 * Unistroke-alfabet uit com.particlequickactions.GestureTemplates
 * (APK com.axecore.core 0.1.0-mvp, 26 aug 2026).
 *
 * Elke naam is één PIN-teken. De lock-alfabet sluit `circle` uit
 * (te makkelijk te verwarren met 0).
 */
export type GesturePoint = { x: number; y: number };
export type UnistrokeTemplate = { name: string; points: GesturePoint[] };

function p(x: number, y: number): GesturePoint {
  return { x, y };
}

function path(...coords: number[]): GesturePoint[] {
  const out: GesturePoint[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) out.push(p(coords[i], coords[i + 1]));
  return out;
}

function arc(
  cx: number, cy: number, rx: number, ry: number,
  startAngle: number, endAngle: number, steps = 28,
): GesturePoint[] {
  const out: GesturePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = startAngle + (endAngle - startAngle) * t;
    out.push(p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return out;
}

function figureEight(steps = 48): GesturePoint[] {
  const out: GesturePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    out.push(p(50 - 22 * Math.sin(2 * t), 50 - 42 * Math.cos(t)));
  }
  return out;
}

function spiral(turns = 2.5, steps = 60): GesturePoint[] {
  const out: GesturePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * 2 * Math.PI;
    const r = 6 + 40 * t;
    out.push(p(50 + Math.cos(a) * r, 50 + Math.sin(a) * r));
  }
  return out;
}

const TWO_PI = Math.PI * 2;

export const DIGIT_TEMPLATES: UnistrokeTemplate[] = [
  { name: '0', points: arc(50, 50, 30, 42, -Math.PI / 2, -Math.PI / 2 - TWO_PI) },
  { name: '1', points: path(30, 24, 38, 17, 46, 11, 50, 8, 50, 30, 50, 55, 50, 75, 50, 92) },
  { name: '2', points: path(20, 30, 25, 19, 36, 11, 52, 9, 68, 14, 76, 27, 73, 42, 60, 56, 42, 71, 24, 88, 46, 88, 66, 88, 82, 88) },
  { name: '3', points: path(22, 18, 36, 10, 54, 9, 69, 17, 71, 31, 60, 42, 46, 47, 62, 51, 75, 61, 76, 76, 63, 88, 44, 91, 27, 85) },
  { name: '4', points: path(63, 9, 50, 25, 36, 42, 22, 59, 42, 59, 62, 59, 84, 59, 66, 59, 66, 74, 66, 92) },
  { name: '5', points: path(76, 11, 56, 11, 34, 11, 30, 28, 28, 44, 46, 38, 64, 42, 74, 55, 72, 76, 57, 88, 38, 91, 23, 84) },
  { name: '6', points: path(68, 10, 55, 15, 43, 25, 33, 40, 28, 57, 28, 72, 37, 85, 52, 91, 66, 86, 72, 73, 68, 61, 55, 54, 42, 55, 32, 63, 28, 72) },
  { name: '7', points: path(18, 13, 38, 13, 60, 13, 82, 13, 70, 33, 60, 52, 51, 72, 44, 91) },
  { name: '8', points: figureEight() },
  { name: '9', points: path(32, 91, 45, 86, 57, 76, 67, 61, 72, 44, 72, 29, 63, 16, 48, 10, 34, 15, 28, 28, 32, 40, 45, 47, 58, 46, 68, 38, 72, 29) },
];

export const SHAPE_TEMPLATES: UnistrokeTemplate[] = [
  { name: 'circle', points: arc(50, 50, 40, 40, -Math.PI / 2, -Math.PI / 2 - TWO_PI) },
  { name: 'triangle', points: path(50, 8, 66, 38, 84, 70, 92, 88, 66, 88, 34, 88, 8, 88, 25, 62, 40, 32, 50, 8) },
  { name: 'square', points: path(12, 12, 45, 12, 88, 12, 88, 45, 88, 88, 50, 88, 12, 88, 12, 50, 12, 12) },
  { name: 'v', points: path(12, 12, 26, 40, 40, 68, 50, 90, 62, 64, 75, 38, 88, 12) },
  { name: 'caret', points: path(12, 88, 26, 60, 40, 32, 50, 10, 62, 36, 75, 62, 88, 88) },
  { name: 'check', points: path(10, 52, 22, 66, 34, 82, 42, 90, 58, 62, 74, 34, 90, 8) },
  { name: 'zigzag', points: path(8, 78, 28, 22, 48, 78, 68, 22, 88, 78) },
  { name: 'spiral', points: spiral() },
  { name: 'arrowUp', points: path(50, 92, 50, 60, 50, 24, 50, 8, 32, 28, 50, 8, 68, 28) },
  { name: 'arrowDown', points: path(50, 8, 50, 40, 50, 76, 50, 92, 32, 72, 50, 92, 68, 72) },
  { name: 'swipeRight', points: path(8, 50, 30, 50, 55, 50, 78, 50, 92, 50) },
  { name: 'swipeLeft', points: path(92, 50, 70, 50, 45, 50, 22, 50, 8, 50) },
];

export const ALL_TEMPLATES: UnistrokeTemplate[] = [...DIGIT_TEMPLATES, ...SHAPE_TEMPLATES];

/** Lock-alfabet: alles behalve circle (GestureTemplates.getLockAlphabet). */
export function lockAlphabet(): UnistrokeTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.name !== 'circle');
}
