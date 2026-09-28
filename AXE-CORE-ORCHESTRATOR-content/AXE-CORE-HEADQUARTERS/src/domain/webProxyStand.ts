/**
 * Wat de web-proxy werkelijk doet, gelezen uit één antwoord op `/health`.
 * Sinds 28 sep is dat axe-core-proxy op Supabase; daarvoor /api op Cloudflare
 * Pages, en van die tijd is de app-pagina-herkenning hieronder.
 *
 * Op 28 sep stond "Strato" in de telefoon-app op offline terwijl de VPS
 * kerngezond was. De web-app praat niet rechtstreeks met de VPS maar via deze
 * proxy, en de Pages-functies draaiden niet: elke /api-route gaf bij GET de
 * app-pagina (HTML, 200) en bij POST 405. De widget las die HTML als JSON,
 * struikelde, en meldde de VPS als onbereikbaar. Twee dingen die los van elkaar
 * stuk kunnen gaan, horen twee regels te hebben -- met bij rood wat je doet.
 */

export type ProxyStand = { status: 'online' | 'degraded' | 'offline'; detail: string };

export function webProxyStand(antwoord: { status: number; contentType: string; body: unknown }): ProxyStand {
  const { status, contentType, body } = antwoord;
  // Geen proxy achter het adres: de host serveert de app zelf (GET) of weigert (POST).
  if (contentType.includes('text/html') || status === 405) {
    return { status: 'offline', detail: 'no proxy at this address — it returns the app page' };
  }
  const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : '';
  if (status === 503 && detail.includes('AXE_CORE_API_KEY')) {
    return { status: 'offline', detail: 'AXE_CORE_API_KEY missing in the Supabase secrets' };
  }
  // axe-core-proxy laat alleen de eigenaar door: 401 zonder geldige sessie, 403 voor een ander.
  if (status === 401 || status === 403) {
    return { status: 'offline', detail: 'not signed in as the AXE CORE owner' };
  }
  if (status >= 200 && status < 300 && body && typeof body === 'object') {
    return { status: 'online', detail: 'proxy → VPS ok' };
  }
  if (status >= 500) return { status: 'offline', detail: `proxy HTTP ${status}` };
  return { status: 'degraded', detail: `proxy HTTP ${status}` };
}
