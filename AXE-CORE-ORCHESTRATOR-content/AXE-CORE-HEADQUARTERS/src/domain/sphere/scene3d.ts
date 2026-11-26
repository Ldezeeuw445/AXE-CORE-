/**
 * Een 3D-scène uit Spline in het vak (26 nov, Luka: "realistisch, echte goeie beelden").
 *
 * Spline bouwt scènes in zijn eigen editor (via de Spline-MCP, met Luka's account);
 * een gepubliceerde scène heeft een publiek adres. Alleen die adressen mogen in het
 * vak, zodat er nooit een willekeurige site in een frame op Home komt.
 */
const SPLINE = /^https:\/\/(?:my\.spline\.design\/[A-Za-z0-9_-]+\/?|prod\.spline\.design\/[A-Za-z0-9_-]+\/scene\.splinecode)(?:\?[^\s#]*)?$/;

export function isSplineUrl(url: unknown): url is string {
  return typeof url === 'string' && SPLINE.test(url.trim());
}

/** my.spline.design is een viewerpagina (iframe); .splinecode heeft de viewer nodig. */
export function splineVorm(url: string): 'pagina' | 'scene' {
  return /\.splinecode(?:\?|$)/.test(url) ? 'scene' : 'pagina';
}
