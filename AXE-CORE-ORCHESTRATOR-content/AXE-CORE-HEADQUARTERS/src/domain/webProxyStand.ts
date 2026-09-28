/**
 * Wat de web-proxy (`/api/proxy/axecore`, Cloudflare Pages Functions) werkelijk
 * doet, gelezen uit één antwoord op `/health`.
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
  // De functies draaien niet: Pages serveert de app zelf (GET) of weigert (POST).
  if (contentType.includes('text/html') || status === 405) {
    return { status: 'offline', detail: 'Cloudflare functions not deployed — /api returns the app page' };
  }
  const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : '';
  if (status === 503 && detail.includes('AXE_CORE_API_KEY')) {
    return { status: 'offline', detail: 'AXE_CORE_API_KEY missing in Cloudflare Pages settings' };
  }
  if (status >= 200 && status < 300 && body && typeof body === 'object') {
    return { status: 'online', detail: 'proxy → VPS ok' };
  }
  if (status >= 500) return { status: 'offline', detail: `proxy HTTP ${status}` };
  return { status: 'degraded', detail: `proxy HTTP ${status}` };
}
