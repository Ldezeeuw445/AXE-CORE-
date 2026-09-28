import { describe, expect, it } from 'vitest';
import { webProxyStand } from './webProxyStand';

describe('de web-proxy los van de VPS gemeten', () => {
  // Gemeten 28 sep op axeheadquarters.com: GET /api/proxy/axecore/health gaf
  // de app-pagina (200, text/html), POST gaf 405. De VPS zelf antwoordde ok.
  it('herkent dat de Cloudflare-functies niet draaien aan de app-pagina', () => {
    const s = webProxyStand({ status: 200, contentType: 'text/html; charset=utf-8', body: null });
    expect(s.status).toBe('offline');
    expect(s.detail).toContain('Cloudflare functions not deployed');
  });

  it('herkent hetzelfde aan een 405', () => {
    expect(webProxyStand({ status: 405, contentType: '', body: null }).status).toBe('offline');
  });

  it('zegt het als de sleutel op Pages ontbreekt', () => {
    const s = webProxyStand({ status: 503, contentType: 'application/json', body: { detail: 'AXE_CORE_API_KEY staat niet ingesteld op deze Pages-omgeving' } });
    expect(s).toEqual({ status: 'offline', detail: 'AXE_CORE_API_KEY missing in Cloudflare Pages settings' });
  });

  it('is groen als de proxy JSON van de VPS doorgeeft', () => {
    expect(webProxyStand({ status: 200, contentType: 'application/json', body: { status: 'ok' } }).status).toBe('online');
  });

  it('meldt een fout van boven als fout, niet als werkend', () => {
    expect(webProxyStand({ status: 502, contentType: 'application/json', body: { detail: 'bad gateway' } }).status).toBe('offline');
  });
});
