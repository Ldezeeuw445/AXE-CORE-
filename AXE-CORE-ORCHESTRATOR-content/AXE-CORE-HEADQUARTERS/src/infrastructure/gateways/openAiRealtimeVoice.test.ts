import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('isOpenAiRealtimeConfigured', () => {
  it('is false with no local OpenAI key', async () => {
    const { isOpenAiRealtimeConfigured } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    expect(isOpenAiRealtimeConfigured()).toBe(false);
  });

  it('is true once whisperService\'s own key slot has an OpenAI key', async () => {
    setConn('openai', 'sk-test');
    const { isOpenAiRealtimeConfigured } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    expect(isOpenAiRealtimeConfigured()).toBe(true);
  });
});

describe('createRealtimeClientSecret', () => {
  it('refuses to call OpenAI at all with no key configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { createRealtimeClientSecret } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    await expect(createRealtimeClientSecret()).rejects.toThrow(/no openai key/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the standard key and returns the ephemeral value, never the standard key itself', async () => {
    setConn('openai', 'sk-standard');
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'ek_ephemeral_123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createRealtimeClientSecret, OPENAI_REALTIME_MODEL } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    const secret = await createRealtimeClientSecret();

    expect(secret).toBe('ek_ephemeral_123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-standard');
    const body = JSON.parse(String(init.body));
    expect(body.session.model).toBe(OPENAI_REALTIME_MODEL);
  });

  it('accepts the older {client_secret:{value}} response shape too', async () => {
    setConn('openai', 'sk-standard');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ client_secret: { value: 'ek_legacy_shape' } }),
    }));
    const { createRealtimeClientSecret } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    await expect(createRealtimeClientSecret()).resolves.toBe('ek_legacy_shape');
  });

  it('surfaces a real HTTP failure instead of swallowing it', async () => {
    setConn('openai', 'sk-standard');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    }));
    const { createRealtimeClientSecret } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    await expect(createRealtimeClientSecret()).rejects.toThrow(/401/);
  });
});

describe('getOpenAiRealtimeLevel', () => {
  it('is 0 before any call has connected', async () => {
    const { getOpenAiRealtimeLevel } = await import('@/infrastructure/gateways/openAiRealtimeVoice');
    expect(getOpenAiRealtimeLevel()).toBe(0);
  });
});
