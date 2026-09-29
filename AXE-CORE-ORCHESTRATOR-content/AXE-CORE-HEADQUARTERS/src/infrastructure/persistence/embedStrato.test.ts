import { afterEach, describe, expect, it, vi } from 'vitest';

const PROXY = 'https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/axe-core-proxy';
const HETZNER = 'https://ollama.axecompanion.com';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Een bge-m3-antwoord: 1024 getallen, niet genormaliseerd (dat doet de app). */
const bgeAntwoord = () =>
  new Response(JSON.stringify({ embedding: Array.from({ length: 1024 }, (_, i) => (i % 7) - 3) }), {
    headers: { 'Content-Type': 'application/json' },
  });

async function laad(opties: { tauri?: boolean; strato: 'werkt' | 'dood' }) {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://pqnngpcgbdwxavbatbia.supabase.co');
  vi.stubEnv('VITE_AXE_CORE_API_KEY', 'ingebakken');
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    ...(opties.tauri ? { __TAURI_INTERNALS__: {} } : {}),
  });
  // Instellingen wijzen nog naar Hetzner, zoals op de telefoon.
  const opslag = new Map<string, string>([['axe_llm_connections', JSON.stringify({ ollama: { baseUrl: HETZNER } })]]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => opslag.get(k) ?? null,
    setItem: (k: string, v: string) => { opslag.set(k, v); },
    removeItem: (k: string) => { opslag.delete(k); },
  });
  const f = vi.fn<typeof fetch>(async (invoer) => {
    const url = String(invoer);
    if (url.startsWith('http://127.0.0.1')) throw new TypeError('geen lokale Ollama');
    if (url.endsWith('/ollama/api/embeddings') && opties.strato === 'werkt') return bgeAntwoord();
    throw new TypeError(`onbereikbaar: ${url}`);
  });
  vi.stubGlobal('fetch', f);
  const m = await import('./embeddingService');
  return { f, embedText: m.embedText };
}

// 28 sep: Hetzner weg, de telefoon viel op de 256-hash en rag_memories
// weigerde 744 herinneringen. Nu bge-m3 op Strato.
describe('het geheugen embedt op Strato', () => {
  it('de web-app haalt bge-m3 via axe-core-proxy, niet via Hetzner', async () => {
    const { f, embedText } = await laad({ strato: 'werkt' });
    const v = await embedText('waar was ik gebleven met trading');
    expect(v).toHaveLength(1024);
    const urls = f.mock.calls.map(([u]) => String(u));
    expect(urls).toContain(`${PROXY}/ollama/api/embeddings`);
    expect(urls.some((u) => u.startsWith(HETZNER))).toBe(false);
  });

  it('de Tauri-app gaat rechtstreeks naar Strato, met de sleutel', async () => {
    const { f, embedText } = await laad({ tauri: true, strato: 'werkt' });
    expect(await embedText('portfolio widget')).toHaveLength(1024);
    const naarStrato = f.mock.calls.find(([u]) => String(u) === 'https://api.axecompanion.com/ollama/api/embeddings');
    expect((naarStrato?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer ingebakken');
  });

  it('zonder Strato probeert hij Instellingen en valt pas daarna op de hash', async () => {
    const { f, embedText } = await laad({ strato: 'dood' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await embedText('iets anders')).toHaveLength(256);
    const urls = f.mock.calls.map(([u]) => String(u));
    expect(urls.indexOf(`${PROXY}/ollama/api/embeddings`)).toBeLessThan(urls.indexOf(`${HETZNER}/api/embeddings`));
  });
});
