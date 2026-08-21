/**
 * The two Airtop response shapes that break a naive client.
 *
 * Both were found by calling the real API, not by reading the docs:
 *   - DELETE answers 2xx with an EMPTY body, so a JSON parser throws on the
 *     one call whose entire job is cleanup — and a cleanup that throws is how
 *     three forgotten sessions locked the free plan's limit.
 *   - Errors put the useful sentence in errors[0].message; `message` carries a
 *     duller one. The session-limit error is the case that matters: it names
 *     the limit and the fix, and flattening it to "airtop 400" throws that away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function res(status: number, body: string) {
  return Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(body) });
}

describe('airtop client', () => {
  it('treats an empty body as success rather than a parse error', async () => {
    const { airtopEndSession } = await import('./airtopService');
    fetchMock.mockReturnValueOnce(res(204, ''));
    await expect(airtopEndSession('abc')).resolves.toBeUndefined();
  });

  it('surfaces the session-limit sentence, not the status code', async () => {
    const { airtopListSessions } = await import('./airtopService');
    fetchMock.mockReturnValueOnce(res(400, JSON.stringify({
      message: 'bad request',
      errors: [{
        message: 'You have reached your active session limit. You are on the Free plan which supports 3 simultaneous sessions.',
        code: 'BROWSER_SESSION_COUNT_LIMIT_REACHED',
      }],
    })));
    await expect(airtopListSessions()).rejects.toThrow(/3 simultaneous sessions/);
  });

  it('does not offer ended sessions for reuse', async () => {
    const { airtopListSessions } = await import('./airtopService');
    fetchMock.mockReturnValueOnce(res(200, JSON.stringify({
      data: { sessions: [
        { id: 'a', status: 'ended' },
        { id: 'b', status: 'running' },
      ] },
    })));
    const list = await airtopListSessions();
    expect(list.map(s => s.id)).toEqual(['b']);
  });

  it('reports unparseable bodies with their text instead of a bare status', async () => {
    const { airtopListSessions } = await import('./airtopService');
    fetchMock.mockReturnValueOnce(res(502, '<html>gateway timeout</html>'));
    await expect(airtopListSessions()).rejects.toThrow(/gateway timeout/);
  });
});
