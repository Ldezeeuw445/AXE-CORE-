/**
 * De baan van de deeltjes die uit de bol naar een deel van het scherm vliegen.
 * Puur rekenwerk, zodat het zonder browser te testen is.
 */
export interface Rechthoek { x: number; y: number; b: number; h: number }
export interface Punt2 { x: number; y: number }

/** Een punt op de rand van de rechthoek, met iets lucht eromheen. */
export function randPunt(r: Rechthoek, t: number, lucht = 6): Punt2 {
  const x0 = r.x - lucht, y0 = r.y - lucht, b = r.b + 2 * lucht, h = r.h + 2 * lucht;
  const omtrek = 2 * (b + h);
  let d = (((t % 1) + 1) % 1) * omtrek;
  if (d < b) return { x: x0 + d, y: y0 };
  d -= b;
  if (d < h) return { x: x0 + b, y: y0 + d };
  d -= h;
  if (d < b) return { x: x0 + b - d, y: y0 + h };
  d -= b;
  return { x: x0, y: y0 + h - d };
}

/** Is deze rechthoek echt in beeld en groot genoeg om naar toe te vliegen? */
export function isZichtbaar(r: Rechthoek, venster: { b: number; h: number }): boolean {
  if (r.b < 8 || r.h < 8) return false;
  return r.x + r.b > 0 && r.y + r.h > 0 && r.x < venster.b && r.y < venster.h;
}

/** Het eerste doel dat zichtbaar is, of null. `vind` levert per doel de rechthoek. */
export function kiesDoel(
  doelen: readonly string[],
  vind: (doel: string) => Rechthoek | null,
  venster: { b: number; h: number },
): { doel: string; rect: Rechthoek } | null {
  for (const doel of doelen) {
    const rect = vind(doel);
    if (rect && isZichtbaar(rect, venster)) return { doel, rect };
  }
  return null;
}

/** Zachte in-uit: 0..1 → 0..1. */
export function zacht(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Een gebogen weg van a naar b, met een zijwaartse bocht per deeltje. */
export function boog(a: Punt2, b: Punt2, t: number, bocht: number): Punt2 {
  const u = zacht(t);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bocht, cy = my + (dx / len) * bocht;
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * cx + u * u * b.x, y: v * v * a.y + 2 * v * u * cy + u * u * b.y };
}
