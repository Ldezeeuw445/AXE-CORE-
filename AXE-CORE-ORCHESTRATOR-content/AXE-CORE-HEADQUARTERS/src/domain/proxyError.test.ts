import { describe, it, expect } from 'vitest';
import { proxyErrorMessage } from './proxyError';

describe('proxyErrorMessage', () => {
  it("reads FastAPI's detail — the shape every proxy error actually has", () => {
    // Measured against /proxy/ai with a wrong key. This exact body was being
    // discarded in favour of "Proxy HTTP 502".
    expect(proxyErrorMessage({ detail: 'Invalid token (request id: 2026...)' }, 502))
      .toBe('Invalid token (request id: 2026...)');
  });

  it('still reads a plain error string', () => {
    expect(proxyErrorMessage({ error: 'rate limited' }, 429)).toBe('rate limited');
  });

  it('reaches into a nested OpenAI-style error', () => {
    expect(proxyErrorMessage({ error: { message: 'model not found' } }, 404)).toBe('model not found');
  });

  it('reads a bare message field', () => {
    expect(proxyErrorMessage({ message: 'upstream timeout' }, 504)).toBe('upstream timeout');
  });

  it('prefers detail when several are present', () => {
    // The proxy raised it; the rest may be an upstream body it passed along.
    expect(proxyErrorMessage({ detail: 'from the proxy', error: 'from upstream' }, 502))
      .toBe('from the proxy');
  });

  it('names the status when there is nothing usable', () => {
    for (const body of [null, undefined, {}, 'plain text', 42, { detail: '   ' }, { error: {} }]) {
      expect(proxyErrorMessage(body, 502), JSON.stringify(body)).toBe('Proxy HTTP 502');
    }
  });

  it('does not show a validation array as if it were a sentence', () => {
    // FastAPI's 422 detail is a list of objects. "[object Object]" is worse
    // than naming the status.
    expect(proxyErrorMessage({ detail: [{ loc: ['body'], msg: 'field required' }] }, 422))
      .toBe('Proxy HTTP 422');
  });

  it('trims, so a padded message does not render with a gap', () => {
    expect(proxyErrorMessage({ detail: '  Invalid token  ' }, 502)).toBe('Invalid token');
  });
});
