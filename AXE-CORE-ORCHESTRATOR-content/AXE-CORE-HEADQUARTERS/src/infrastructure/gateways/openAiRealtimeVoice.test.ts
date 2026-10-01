/**
 * De realtime-sessie haalt zijn inloggegeven centraal op, niet uit de browser.
 *
 * Deze tests gingen tot nu toe uit van een OpenAI-sleutel in `localStorage`
 * waarmee de browser rechtstreeks `api.openai.com` belde. Dat model is op
 * 29 september 2026 verlaten: AXE Core geeft een kortlevend sessiegeheim af,
 * zodat er op geen enkel apparaat een echte sleutel staat. De tests zijn
 * blijven hangen bij het oude ontwerp -- hier beschrijven ze het nieuwe.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createRealtimeClientSecret', () => {
  it('vraagt AXE Core om het geheim, niet OpenAI', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'ek_ephemeral_123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createRealtimeClientSecret } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    await expect(createRealtimeClientSecret()).resolves.toBe('ek_ephemeral_123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/realtime\/client-secret$/);
    expect(url).not.toMatch(/api\.openai\.com/);
    // Geen Authorization met een echte sleutel: die staat hier niet.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization ?? '').not.toMatch(/^Bearer sk-/);
  });

  /* De reden dat dit telt: zonder sleutel moet AXE zéggen wat er mis is. Een
     stille terugval naar een tragere stem is op 29 sep bewust geschrapt. */
  it('geeft de echte reden door als de server er geen heeft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'AXE voice is not configured',
    }));
    const { createRealtimeClientSecret } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    await expect(createRealtimeClientSecret()).rejects.toThrow(/503.*not configured/i);
  });

  it('zegt het ook als de server niets teruggeeft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({}) }));
    const { createRealtimeClientSecret } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    await expect(createRealtimeClientSecret()).rejects.toThrow(/no realtime client secret/i);
  });
});

describe('getOpenAiRealtimeLevel', () => {
  it('is 0 zolang er geen gesprek loopt', async () => {
    const { getOpenAiRealtimeLevel } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    expect(getOpenAiRealtimeLevel()).toBe(0);
  });
});
