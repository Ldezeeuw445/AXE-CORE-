import { describe, expect, it, vi } from 'vitest';
import { behandel, jwtInhoud } from './handler';

const EIGENAAR = 'acff7a12-1111-481d-a7a9-cc07583b8069';
const omg = { sleutel: async () => 'vps-sleutel' as string | undefined, vps: 'https://api.axecompanion.com', eigenaren: [EIGENAAR] };

/** Een JWT zoals de gateway hem doorlaat; de handtekening controleert die, niet wij. */
const jwt = (inhoud: object) => `e30.${btoa(JSON.stringify(inhoud)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.x`;
const BASIS = 'https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/axe-core-proxy';

function vps(body: unknown = { status: 'ok' }, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('axe-core-proxy', () => {
  it('stuurt de eigenaar door naar de VPS, met de sleutel en het pad', async () => {
    const f = vps();
    const res = await behandel(new Request(`${BASIS}/memory/stats?user=x`, { headers: { Authorization: `Bearer ${jwt({ sub: EIGENAAR, role: 'authenticated' })}` } }), omg, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.axecompanion.com/memory/stats?user=x');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer vps-sleutel');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  // Dit is het gat dat de Pages-proxy had: de sleutel voor iedereen.
  it('laat de anon-sleutel, een andere gebruiker en geen token niet door', async () => {
    const f = vps();
    const sleutel = vi.fn(async () => 'vps-sleutel');
    for (const auth of [`Bearer ${jwt({ role: 'anon' })}`, `Bearer ${jwt({ sub: 'iemand-anders', role: 'authenticated' })}`, '']) {
      const res = await behandel(new Request(`${BASIS}/internal/exec`, { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: '{}' }), { ...omg, sleutel }, f);
      expect(res.status).toBe(403);
    }
    expect(f).not.toHaveBeenCalled();
    // Voor een vreemde wordt de sleutel niet eens opgehaald.
    expect(sleutel).not.toHaveBeenCalled();
  });

  it('zegt dat de sleutel ontbreekt in plaats van een 401 door te geven', async () => {
    const res = await behandel(new Request(`${BASIS}/health`, { headers: { Authorization: `Bearer ${jwt({ sub: EIGENAAR, role: 'authenticated' })}` } }), { ...omg, sleutel: async () => undefined }, vps());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).toContain('AXE_CORE_API_KEY');
  });

  it('geeft een POST-body en een fout van boven ongewijzigd door', async () => {
    const f = vps({ detail: 'bad' }, 502);
    const res = await behandel(new Request(`${BASIS}/proxy/ai`, { method: 'POST', headers: { Authorization: `Bearer ${jwt({ sub: EIGENAAR, role: 'authenticated' })}`, 'X-AXE-Repo': 'axe-core' }, body: '{"a":1}' }), omg, f);
    expect(res.status).toBe(502);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.axecompanion.com/proxy/ai');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['X-AXE-Repo']).toBe('axe-core');
  });

  it('logt een fout van boven met provider en model, zonder de sleutel', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = vps({ detail: 'groq: 401 invalid api key' }, 502);
    await behandel(new Request(`${BASIS}/proxy/ai`, { method: 'POST', headers: { Authorization: `Bearer ${jwt({ sub: EIGENAAR, role: 'authenticated' })}` }, body: '{"provider":"groq","model":"llama","key":"geheim-providersleutel"}' }), omg, f);
    const regel = String(warn.mock.calls[0][0]);
    expect(JSON.parse(regel)).toMatchObject({ axeProxyFout: '/proxy/ai', status: 502, provider: 'groq', model: 'llama' });
    expect(regel).toContain('invalid api key');
    expect(regel).not.toContain('geheim-providersleutel');
    expect(regel).not.toContain('vps-sleutel');
    warn.mockRestore();
  });

  it('beantwoordt de preflight zonder token', async () => {
    const res = await behandel(new Request(`${BASIS}/health`, { method: 'OPTIONS' }), omg, vps());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
  });

  it('leest geen onzin als JWT', () => {
    expect(jwtInhoud('Bearer geen-jwt')).toBeNull();
    expect(jwtInhoud(null)).toBeNull();
  });
});
