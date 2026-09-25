import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Groq's free Whisper quota runs out (429) or the endpoint has a bad day
 * (5xx) — before this, that failed the whole voice turn even when Luka also
 * has an OpenAI key configured. transcribeAudio() now retries once with
 * OpenAI whisper-1 in exactly those two cases, and only those two: a bad
 * request (400) or a missing fallback key must still fail loudly instead of
 * silently trying a key that was never meant to be used here.
 */

const store: Record<string, string> = {};

function setConn(id: string, key: string): void {
  const conns = JSON.parse(store.axe_llm_connections ?? '{}') as Record<string, { key: string }>;
  conns[id] = { key };
  store.axe_llm_connections = JSON.stringify(conns);
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('transcribeAudio — Groq to OpenAI whisper-1 fallback', () => {
  it('retries with OpenAI whisper-1 when Groq returns 429', async () => {
    setConn('groq', 'groq-key');
    setConn('openai', 'openai-key');
    const { transcribeAudio } = await import('@/infrastructure/gateways/whisperService');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'hallo axe' }) });
    vi.stubGlobal('fetch', fetchMock);

    const text = await transcribeAudio(new Blob(['x'], { type: 'audio/webm' }));

    expect(text).toBe('hallo axe');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('groq.com');
    expect(String(fetchMock.mock.calls[1][0])).toContain('api.openai.com');
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer openai-key',
    });
  });

  it('retries with OpenAI whisper-1 when Groq returns a 5xx', async () => {
    setConn('groq', 'groq-key');
    setConn('openai', 'openai-key');
    const { transcribeAudio } = await import('@/infrastructure/gateways/whisperService');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'server text' }) });
    vi.stubGlobal('fetch', fetchMock);

    const text = await transcribeAudio(new Blob(['x'], { type: 'audio/webm' }));
    expect(text).toBe('server text');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on a non-retryable Groq error (400)', async () => {
    setConn('groq', 'groq-key');
    setConn('openai', 'openai-key');
    const { transcribeAudio } = await import('@/infrastructure/gateways/whisperService');

    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad request' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(transcribeAudio(new Blob(['x'], { type: 'audio/webm' }))).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the Groq error when there is no OpenAI key to fall back to', async () => {
    setConn('groq', 'groq-key');
    const { transcribeAudio } = await import('@/infrastructure/gateways/whisperService');

    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(transcribeAudio(new Blob(['x'], { type: 'audio/webm' }))).rejects.toThrow(/HTTP 429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
