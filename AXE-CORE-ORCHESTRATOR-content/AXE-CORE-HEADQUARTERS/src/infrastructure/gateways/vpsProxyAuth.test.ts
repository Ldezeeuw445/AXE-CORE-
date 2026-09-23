/**
 * Elke aanroeper van de VPS-proxies stuurt zijn Bearer mee.
 *
 * Sinds 14 september 2026 staan /proxy/ai, /proxy/exa en /proxy/fish-tts
 * achter AUTH (zie backend/axe_api/test_proxy_auth.py). Een aanroeper die de
 * header vergeet, krijgt in de verpakte Tauri-app een 401/403 -- en dan is
 * chat stuk in precies de app die Luka gebruikt. Daarom één test per
 * aanroeper, in de omgeving van die app: PROD, __TAURI_INTERNALS__ en een
 * ingebakken VITE_AXE_CORE_API_KEY.
 *
 * En de andere kant: buiten de verpakte app gaat de sleutel nergens heen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/persistence/userSettingsService', () => ({
  loadSetting: vi.fn(async () => null),
  saveSetting: vi.fn(async () => undefined),
}));

const SLEUTEL = 'test-axe-core-sleutel';
const VPS = 'https://api.axecompanion.com';

type Aanroep = { url: string; headers: Record<string, string> };
let aanroepen: Aanroep[] = [];

function geheugenOpslag(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

function omgeving(opts: { tauri: boolean }) {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_AXE_CORE_API_KEY', SLEUTEL);
  // audioUnlock hangt bij het importeren luisteraars aan window.
  const luisteraars = { addEventListener: () => undefined, removeEventListener: () => undefined };
  vi.stubGlobal('window', opts.tauri ? { __TAURI_INTERNALS__: {}, ...luisteraars } : luisteraars);
  vi.stubGlobal('localStorage', geheugenOpslag());
  aanroepen = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    aanroepen.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response(JSON.stringify({ text: 'hallo', results: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
}

const naarVps = () => aanroepen.filter(a => a.url.startsWith(`${VPS}/proxy/`));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('verpakte Tauri-app: elke proxy-aanroeper stuurt de Bearer mee', () => {
  beforeEach(() => omgeving({ tauri: true }));

  it('llmGateway.callProvider → /proxy/ai', async () => {
    const { callProvider } = await import('@/infrastructure/gateways/llmGateway');
    await callProvider({ provider: 'openai', key: '', model: 'gpt-4o-mini' } as never, [
      { role: 'user', content: 'hoi' },
    ]);
    expect(naarVps().map(a => a.url)).toEqual([`${VPS}/proxy/ai`]);
    expect(naarVps()[0].headers.Authorization).toBe(`Bearer ${SLEUTEL}`);
  });

  it('visionGateway.callVision → /proxy/ai', async () => {
    const { callVision } = await import('@/infrastructure/gateways/visionGateway');
    await callVision([{ provider: 'openai', key: '', model: 'gpt-4o' } as never], {
      prompt: 'wat zie je', imageBase64: 'AAAA',
    });
    expect(naarVps().map(a => a.url)).toEqual([`${VPS}/proxy/ai`]);
    expect(naarVps()[0].headers.Authorization).toBe(`Bearer ${SLEUTEL}`);
  });

  it('exaSearchService.exaSearch → /proxy/exa', async () => {
    const { exaSearch } = await import('@/infrastructure/gateways/exaSearchService');
    await exaSearch('goud vandaag');
    expect(naarVps().map(a => a.url)).toEqual([`${VPS}/proxy/exa`]);
    expect(naarVps()[0].headers.Authorization).toBe(`Bearer ${SLEUTEL}`);
  });

  it('exaSearchService.testExaKey → /proxy/exa', async () => {
    const { testExaKey } = await import('@/infrastructure/gateways/exaSearchService');
    await testExaKey('');
    expect(naarVps().map(a => a.url)).toEqual([`${VPS}/proxy/exa`]);
    expect(naarVps()[0].headers.Authorization).toBe(`Bearer ${SLEUTEL}`);
  });

  it('fishAudioService.speakWithFishAudio → /proxy/fish-tts', async () => {
    const { speakWithFishAudio } = await import('@/infrastructure/gateways/fishAudioService');
    // Afspelen bestaat niet in node; het gaat hier alleen om de aanvraag.
    await speakWithFishAudio('hallo', undefined, () => undefined);
    expect(naarVps().map(a => a.url)).toEqual([`${VPS}/proxy/fish-tts`]);
    expect(naarVps()[0].headers.Authorization).toBe(`Bearer ${SLEUTEL}`);
  });

  it('perplexityResearchService.testPerplexityOpServer → /research/perplexity', async () => {
    const { testPerplexityOpServer } = await import('@/infrastructure/gateways/perplexityResearchService');
    await testPerplexityOpServer();
    const research = aanroepen.filter(a => a.url === `${VPS}/research/perplexity`);
    expect(research.length).toBeGreaterThan(0);
    expect(research[0].headers.Authorization).toBe(`Bearer ${SLEUTEL}`);
  });
});

describe('buiten de verpakte app gaat de sleutel nergens heen', () => {
  beforeEach(() => omgeving({ tauri: false }));

  it('web-build: chat gaat naar de eigen /api/proxy/ai, zonder Bearer', async () => {
    const { callProvider } = await import('@/infrastructure/gateways/llmGateway');
    await callProvider({ provider: 'openai', key: '', model: 'gpt-4o-mini' } as never, [
      { role: 'user', content: 'hoi' },
    ]);
    expect(aanroepen.map(a => a.url)).toEqual(['/api/proxy/ai']);
    expect(aanroepen[0].headers.Authorization).toBeUndefined();
  });

  it('vpsAuthHeaders geeft alleen iets voor een adres óp de VPS', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const { vpsAuthHeaders } = await import('@/infrastructure/config/apiUrl');
    expect(vpsAuthHeaders(`${VPS}/proxy/ai`)).toEqual({ Authorization: `Bearer ${SLEUTEL}` });
    expect(vpsAuthHeaders('/api/proxy/ai')).toEqual({});
    expect(vpsAuthHeaders('https://www.axeheadquarters.com/api/proxy/ai')).toEqual({});
    // Een host die toevallig met hetzelfde begint, is een andere host.
    expect(vpsAuthHeaders(`${VPS}.aanvaller.example/proxy/ai`)).toEqual({});
  });
});
