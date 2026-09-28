/**
 * De /api-routes van axeheadquarters.com als één Pages-worker (`_worker.js`).
 *
 * Op 28 sep bleek dat Pages de map `functions/` nooit oppikte: de build
 * draaide en de app kwam live, maar elke /api-route gaf de app-pagina terug
 * (GET) of 405 (POST). Waarschijnlijk staat de Root directory in het
 * Pages-scherm niet op deze map -- dan zoekt Pages `functions/` in de root van
 * de repo en vindt niets. Dat scherm is vanuit de repo niet te zien of te
 * zetten.
 *
 * Een `_worker.js` in de output-map werkt wél, welke Root directory er ook
 * staat, want de output-map klopt aantoonbaar (de bundel komt live). Pages
 * negeert `functions/` zodra die er staat. De handlers zelf blijven in
 * `functions/`: dit bestand routeert alleen, er komt geen tweede kopie van
 * wat ze doen. `_routes.json` houdt alles buiten /api bij de gewone
 * statische bestanden.
 */
import { onRequest as axecore } from '../functions/api/proxy/axecore/[[path]]';
import { onRequest as ai } from '../functions/api/proxy/ai/[[path]]';
import { onRequest as exa } from '../functions/api/exa';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  AXE_CORE_API_KEY?: string;
  AXE_CORE_API_URL?: string;
}

/** De segmenten na `prefix`, zoals Pages ze aan een `[[path]]`-route geeft; null als het pad er niet onder valt. */
function onder(pathname: string, prefix: string): string[] | null {
  if (pathname === prefix || pathname === `${prefix}/`) return [];
  if (!pathname.startsWith(`${prefix}/`)) return null;
  return pathname.slice(prefix.length + 1).split('/').filter(Boolean);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    const axePad = onder(pathname, '/api/proxy/axecore');
    if (axePad) return axecore({ request, env, params: { path: axePad } });

    const aiPad = onder(pathname, '/api/proxy/ai');
    if (aiPad) return ai({ request, env, params: { path: aiPad } });

    if (pathname === '/api/exa') return exa({ request, env });

    // Wat functions/ ook deed bij een onbekende route: de statische site.
    return env.ASSETS.fetch(request);
  },
};
