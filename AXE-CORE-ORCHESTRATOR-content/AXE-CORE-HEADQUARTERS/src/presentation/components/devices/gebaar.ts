/**
 * Gebaren op de telefoon. Los van React, zodat een swipe omhoog te meten is
 * zonder een browser: de home-indicator sluit een app als je hem omhoog
 * veegt, niet alleen als je erop tikt.
 */

export interface Punt { x: number; y: number }

/** Omhoog: genoeg verticale weg, en meer verticaal dan horizontaal. */
export function isSwipeOmhoog(van: Punt, naar: Punt, drempel = 48): boolean {
  const dy = van.y - naar.y;
  const dx = Math.abs(naar.x - van.x);
  return dy >= drempel && dy > dx;
}
