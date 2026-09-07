/**
 * De productieversie van ontwerpData.
 *
 * In een echte bouw wordt ontwerpData hierheen omgeleid (zie vite.config.ts).
 * Reden: de verzonnen rijen worden op modulniveau opgebouwd met een
 * functieaanroep, en daarvan kan Rollup niet bewijzen dat hij bijwerkingsvrij
 * is -- dus liet hij ze staan. Gemeten, niet aangenomen: de strings
 * "Voorbeeld agent" en "voorbeeld-geheugen" stonden gewoon in dist/public.
 *
 * Snoeien op vertrouwen werkte dus niet. Omleiden wel: er valt niets weg te
 * halen als er nooit iets binnenkomt.
 */
export function rijenVoor(): never[] {
  return [];
}

export function ontwerpClient(): unknown {
  // Onbereikbaar: de enige aanroeper zit achter import.meta.env.DEV.
  throw new Error('ontwerpClient bestaat niet in een productiebouw');
}
