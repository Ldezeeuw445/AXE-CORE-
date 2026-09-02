import { describe, it, expect, vi, beforeEach } from 'vitest';
import { looksLikeAxonKey, axonRemember, axonContextPack, axonTestKey } from './axonMemoryService';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const fail = (status: number, body: unknown) => ({ ok: false, status, text: async () => JSON.stringify(body) });

beforeEach(() => fetchMock.mockReset());

describe('looksLikeAxonKey', () => {
  it('accepts a real key shape', () => {
    expect(looksLikeAxonKey('axon_live_abcd1234EF')).toBe(true);
    expect(looksLikeAxonKey('  axon_test_abcd1234  ')).toBe(true);
  });

  it('rejects the things people paste by mistake', () => {
    // An OpenRouter key went into an Ox Alpha card earlier today for exactly
    // this reason — nothing checked the shape.
    for (const k of ['sk-or-v1-abc', 'Bearer axon_live_x', '', 'axon_live_', 'axon_x_abcd1234']) {
      expect(looksLikeAxonKey(k), k).toBe(false);
    }
  });
});

describe('axonRemember', () => {
  it('posts to the functions host, not the MCP vanity domain', async () => {
    // mcp.axon-memory.com routes five paths and /remember is not one of them.
    fetchMock.mockResolvedValueOnce(ok({ id: 'm1' }));
    await axonRemember({ key: 'axon_live_abcd1234', content: 'hello' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('ktaditgtbubonrahyiig.supabase.co/functions/v1/remember');
    expect(String(url)).not.toContain('mcp.axon-memory.com');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer axon_live_abcd1234');
  });

  it('refuses an empty memory without calling out', async () => {
    const r = await axonRemember({ key: 'axon_live_abcd1234', content: '   ' });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends title and tags only when they carry something', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await axonRemember({ key: 'axon_live_abcd1234', content: 'c', title: '  ', tags: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: 'c', source_label: 'AXE Core' });
  });

  it('always says who is writing', async () => {
    // AXON draws a terrain per source and groups by this label slugified, so
    // "AXE Core" is what puts AXE Core on the map as itself. Unconditional on
    // purpose: a memory that arrives anonymous is filed as "manual" alongside
    // everything else that said nothing, and cannot be told apart later.
    fetchMock.mockResolvedValueOnce(ok({}));
    await axonRemember({ key: 'axon_live_abcd1234', content: 'c' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).source_label).toBe('AXE Core');
  });

  it('sends a label that slugifies to axe-core', () => {
    // Mirrors AXON's own slugFromLabel: lowercase, non-alphanumerics to
    // hyphens, trimmed. If this label ever changes, AXE Core silently moves to
    // a different column on the terrain.
    const slug = 'AXE Core'.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    expect(slug).toBe('axe-core');
  });

  it('surfaces AXON\'s own message rather than a bare status', async () => {
    fetchMock.mockResolvedValueOnce(fail(401, { error: 'invalid token' }));
    expect((await axonRemember({ key: 'axon_live_abcd1234', content: 'c' })).error).toBe('invalid token');
  });

  it('falls back to the status when the body has no message', async () => {
    fetchMock.mockResolvedValueOnce(fail(500, {}));
    expect((await axonRemember({ key: 'axon_live_abcd1234', content: 'c' })).error).toBe('HTTP 500');
  });

  it('reports an unreachable host instead of throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const r = await axonRemember({ key: 'axon_live_abcd1234', content: 'c' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('network down');
  });

  it('refuses when no key is set at all', async () => {
    expect((await axonRemember({ key: '', content: 'c' })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('axonContextPack', () => {
  it('asks for a pack sized to a prompt', async () => {
    fetchMock.mockResolvedValueOnce(ok({ pack: [] }));
    await axonContextPack({ key: 'axon_live_abcd1234', query: 'gold', limitTokens: 800 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('query=gold');
    expect(url).toContain('limit_tokens=800');
  });

  it('omits an empty query rather than sending a blank one', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await axonContextPack({ key: 'axon_live_abcd1234', query: '   ' });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('query=');
  });
});

describe('axonTestKey', () => {
  it('rejects a wrong-looking key before spending a request', async () => {
    const r = await axonTestKey('sk-or-v1-nope');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/axon_live/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the cheapest call it can', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await axonTestKey('axon_live_abcd1234');
    expect(String(fetchMock.mock.calls[0][0])).toContain('limit_tokens=1');
  });
});

describe('what a thrown fetch is reported as', () => {
  it('names CORS instead of repeating WebKit\'s "Load failed"', async () => {
    // Measured 2026-08-27: AXON answers
    // access-control-allow-origin: https://app.axon-memory.com and nothing
    // else, so a perfectly valid key fails exactly like a wrong one. The card
    // said "Load failed" and the first read of it was "but my key is right".
    fetchMock.mockRejectedValueOnce(new TypeError('Load failed'));
    const r = await axonRemember({ key: 'axon_live_abcd1234', content: 'c' });
    expect(r.error).toMatch(/CORS/);
    expect(r.error).toMatch(/[Nn]ot a key problem/);
  });

  it('names Chrome\'s wording too, which differs for the same cause', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await axonRemember({ key: 'axon_live_abcd1234', content: 'c' })).error).toMatch(/CORS/);
  });

  it('separates a timeout from a block — different problems, different fixes', async () => {
    const timeout = new Error('signal timed out');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(timeout);
    const r = await axonRemember({ key: 'axon_live_abcd1234', content: 'c' });
    expect(r.error).toContain('20s');
    expect(r.error).not.toMatch(/CORS/);
  });

  it('still passes through an error it has no better words for', async () => {
    fetchMock.mockRejectedValueOnce(new Error('dns went away'));
    expect((await axonRemember({ key: 'axon_live_abcd1234', content: 'c' })).error).toBe('dns went away');
  });
});
