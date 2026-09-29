import { afterEach, describe, expect, it, vi } from 'vitest';

const PROXY = 'https://pqnngpcgbdwxavbatbia.supabase.co/functions/v1/axe-core-proxy';
const STRATO = `${PROXY}/ollama/api/embeddings`;
const HETZNER = 'https://ollama.axecompanion.com';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Een bge-m3-antwoord: 1024 getallen, niet genormaliseerd (dat doet de app). */
const bgeAntwoord = () =>
  new Response(JSON.stringify({ embedding: Array.from({ length: 1024 }, (_, i) => (i % 7) - 3) }), {
    headers: { 'Content-Type': 'application/json' },
  });

async function laad(opties: {
  tauri?: boolean;
  strato: 'werkt' | 'dood' | (() => Promise<Response>);
  instellingen?: string;
}) {
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
  const opslag = new Map<string, string>([
    ['axe_llm_connections', JSON.stringify({ ollama: { baseUrl: opties.instellingen ?? HETZNER } })],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => opslag.get(k) ?? null,
    setItem: (k: string, v: string) => { opslag.set(k, v); },
    removeItem: (k: string) => { opslag.delete(k); },
  });
  const f = vi.fn<typeof fetch>(async (invoer) => {
    const url = String(invoer);
    if (url.startsWith('http://127.0.0.1')) throw new TypeError('geen lokale Ollama');
    if (url.endsWith('/ollama/api/embeddings')) {
      if (typeof opties.strato === 'function') return opties.strato();
      if (opties.strato === 'werkt') return bgeAntwoord();
    }
    throw new TypeError(`onbereikbaar: ${url}`);
  });
  vi.stubGlobal('fetch', f);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const m = await import('./embeddingService');
  const urls = () => f.mock.calls.map(([u]) => String(u));
  return { f, urls, embedText: m.embedText };
}

// 28 sep: Hetzner weg, de telefoon viel op de 256-hash en rag_memories
// weigerde 744 herinneringen. Nu bge-m3 op Strato.
describe('het geheugen embedt op Strato', () => {
  it('de web-app haalt bge-m3 via axe-core-proxy, niet via Hetzner', async () => {
    const { urls, embedText } = await laad({ strato: 'werkt' });
    expect(await embedText('waar was ik gebleven met trading')).toHaveLength(1024);
    expect(urls()).toContain(STRATO);
    expect(urls().some((u) => u.startsWith(HETZNER))).toBe(false);
  });

  it('de Tauri-app gaat rechtstreeks naar Strato, met de sleutel', async () => {
    const { f, embedText } = await laad({ tauri: true, strato: 'werkt' });
    expect(await embedText('portfolio widget')).toHaveLength(1024);
    const naarStrato = f.mock.calls.find(([u]) => String(u) === 'https://api.axecompanion.com/ollama/api/embeddings');
    expect((naarStrato?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer ingebakken');
  });

  it('wacht niet meer op Hetzner als Strato niet antwoordt', async () => {
    const { urls, embedText } = await laad({ strato: 'dood' });
    expect(await embedText('iets anders')).toHaveLength(256);
    expect(urls().some((u) => u.startsWith(HETZNER))).toBe(false);
  });

  it('een eigen Ollama in Instellingen komt na Strato', async () => {
    const { urls, embedText } = await laad({ strato: 'dood', instellingen: 'http://10.0.0.5:11434' });
    await embedText('iets anders');
    expect(urls().indexOf(STRATO)).toBeLessThan(urls().indexOf('http://10.0.0.5:11434/api/embeddings'));
  });
});

// 29 sep: tientallen tegelijk op een box die al swapte, 60 s per antwoord.
describe('Strato wordt niet overspoeld', () => {
  it('stuurt hoogstens twee embeddings tegelijk', async () => {
    let bezig = 0;
    let hoogste = 0;
    const { embedText } = await laad({
      strato: async () => {
        bezig++;
        hoogste = Math.max(hoogste, bezig);
        await new Promise((r) => setTimeout(r, 20));
        bezig--;
        return bgeAntwoord();
      },
    });
    const vectoren = await Promise.all(Array.from({ length: 7 }, (_, i) => embedText(`herinnering ${i}`)));
    expect(vectoren.every((v) => v.length === 1024)).toBe(true);
    expect(hoogste).toBe(2);
  });

  it('laat Strato even met rust na een mislukking', async () => {
    const { urls, embedText } = await laad({ strato: 'dood' });
    await embedText('eerste');
    await embedText('tweede');
    await embedText('derde');
    expect(urls().filter((u) => u === STRATO)).toHaveLength(1);
  });
});
