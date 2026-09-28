import { afterEach, describe, expect, it, vi } from 'vitest';

const PROXY = 'https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/axe-core-proxy';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function laad(opties: { prod: boolean; tauri?: boolean }) {
  vi.resetModules();
  vi.stubEnv('PROD', opties.prod);
  vi.stubEnv('DEV', !opties.prod);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://pqnngpcgbdwxavbatbia.supabase.co');
  vi.stubEnv('VITE_AXE_CORE_API_KEY', 'ingebakken');
  vi.stubGlobal('window', opties.tauri ? { __TAURI_INTERNALS__: {} } : {});
  return import('./apiUrl');
}

// 28 sep: de Pages-proxy draaide niet meer en liet iedereen door; de web-app
// gaat nu via axe-core-proxy op Supabase.
describe('welke weg de AXE API neemt', () => {
  it('de gebouwde web-app gaat via axe-core-proxy, ook voor AI en zoeken', async () => {
    const m = await laad({ prod: true });
    expect(m.WEB_AXE_PROXY).toBe(PROXY);
    expect(m.axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore')).toBe(PROXY);
    expect(m.aiProxyUrl()).toBe(`${PROXY}/proxy/ai`);
    expect(m.exaProxyUrl()).toBe(`${PROXY}/proxy/exa`);
  });

  it('Tauri blijft rechtstreeks naar de VPS gaan', async () => {
    const m = await laad({ prod: true, tauri: true });
    expect(m.axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore')).toBe('https://api.axecompanion.com');
    expect(m.aiProxyUrl()).toBe('https://api.axecompanion.com/proxy/ai');
  });

  it('dev blijft via de Vite-proxy gaan', async () => {
    const m = await laad({ prod: false });
    expect(m.axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore')).toBe('/proxy/axecore');
  });
});
