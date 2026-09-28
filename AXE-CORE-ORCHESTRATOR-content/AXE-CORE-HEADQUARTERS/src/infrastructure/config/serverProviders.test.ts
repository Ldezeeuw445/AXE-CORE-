import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function omgeving(antwoord: Response) {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://pqnngpcgbdwxavbatbia.supabase.co');
  vi.stubGlobal('window', {});
  const opslag = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => { opslag.set(k, v); } });
  const f = vi.fn<typeof fetch>(async () => antwoord);
  vi.stubGlobal('fetch', f);
  return { f, opslag };
}

// 28 sep: de lijst werd alleen via de dode Pages-proxy gevuld; op de telefoon
// was hij leeg en vielen Groq en OpenAI uit de chat.
describe('welke providers de VPS zelf bedient', () => {
  it('haalt de lijst via de web-proxy en bewaart hem voor de chat', async () => {
    const { f, opslag } = omgeving(new Response(JSON.stringify({ providers: ['groq', 'openai'], keyless: ['ollama'] }), { headers: { 'Content-Type': 'application/json' } }));
    const { haalServerProviders, SERVER_PROVIDERS_KEY } = await import('./serverProviders');
    expect(await haalServerProviders()).toEqual(['groq', 'openai', 'ollama']);
    expect(String(f.mock.calls[0][0])).toBe('https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/axe-core-proxy/proxy/ai/providers');
    expect(JSON.parse(opslag.get(SERVER_PROVIDERS_KEY)!)).toEqual(['groq', 'openai', 'ollama']);
  });

  it('laat de bewaarde lijst staan als er een app-pagina of fout terugkomt', async () => {
    const { opslag } = omgeving(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }));
    opslag.set('axe_server_providers', '["groq"]');
    const { haalServerProviders } = await import('./serverProviders');
    expect(await haalServerProviders()).toBeNull();
    expect(opslag.get('axe_server_providers')).toBe('["groq"]');
  });
});
