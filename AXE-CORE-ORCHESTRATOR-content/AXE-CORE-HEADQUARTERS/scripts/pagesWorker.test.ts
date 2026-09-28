import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './pagesWorker';

const assets = { fetch: vi.fn(async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })) };
const env = (extra: Partial<Env> = {}): Env => ({ ASSETS: assets, ...extra });

function vpsAntwoordt(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => { vi.unstubAllGlobals(); assets.fetch.mockClear(); });

describe('de Pages-worker voor /api', () => {
  // 28 sep: /api/proxy/axecore/health gaf de app-pagina, dus "Strato offline".
  it('stuurt /api/proxy/axecore/* met de sleutel door naar de VPS', async () => {
    const vps = vpsAntwoordt({ status: 'ok' });
    const res = await worker.fetch(new Request('https://axeheadquarters.com/api/proxy/axecore/tasks/recent?limit=5'), env({ AXE_CORE_API_KEY: 'sleutel' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    const [url, init] = vps.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.axecompanion.com/tasks/recent?limit=5');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sleutel');
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it('zegt dat de sleutel ontbreekt in plaats van de app-pagina te geven', async () => {
    const res = await worker.fetch(new Request('https://axeheadquarters.com/api/proxy/axecore/health'), env());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).toContain('AXE_CORE_API_KEY');
  });

  it('geeft een POST-body door naar /proxy/ai en /proxy/exa', async () => {
    const vps = vpsAntwoordt({ ok: true });
    await worker.fetch(new Request('https://axeheadquarters.com/api/proxy/ai/providers', { method: 'POST', body: '{"a":1}' }), env({ AXE_CORE_API_KEY: 'sleutel' }));
    await worker.fetch(new Request('https://axeheadquarters.com/api/exa', { method: 'POST', body: '{"q":"x"}' }), env({ AXE_CORE_API_KEY: 'sleutel' }));
    const calls = vps.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => url)).toEqual(['https://api.axecompanion.com/proxy/ai/providers', 'https://api.axecompanion.com/proxy/exa']);
    expect(calls.map(([, init]) => init.body)).toEqual(['{"a":1}', '{"q":"x"}']);
    // Sinds 14 sep eist de VPS de sleutel hier ook; zonder gaf elke chat 401.
    expect(calls.map(([, init]) => (init.headers as Record<string, string>).Authorization)).toEqual(['Bearer sleutel', 'Bearer sleutel']);
  });

  it('dekt de kale route net als [[path]]', async () => {
    const vps = vpsAntwoordt({ ok: true });
    await worker.fetch(new Request('https://axeheadquarters.com/api/proxy/ai', { method: 'POST', body: '{}' }), env());
    expect((vps.mock.calls[0] as unknown as [string])[0]).toBe('https://api.axecompanion.com/proxy/ai');
  });

  it('laat al het andere bij de statische site', async () => {
    const vps = vpsAntwoordt({});
    for (const pad of ['/', '/mobile', '/api/onbekend', '/api/proxy/axecorex']) {
      await worker.fetch(new Request(`https://axeheadquarters.com${pad}`), env());
    }
    expect(assets.fetch).toHaveBeenCalledTimes(4);
    expect(vps).not.toHaveBeenCalled();
  });
});
