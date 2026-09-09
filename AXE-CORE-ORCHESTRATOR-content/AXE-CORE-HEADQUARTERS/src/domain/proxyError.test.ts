import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

/**
 * De reden moet ook echt getoond worden.
 *
 * proxyErrorMessage bestond, was getest, en werd door niemand aangeroepen --
 * de twee poorten lazen zelf `e.error`, terwijl de VPS zijn reden in `detail`
 * zet. Gevolg: een geweigerde sleutel en een platte server toonden allebei
 * "Proxy HTTP 502", en dan weet je niet of het aan jou of aan de server ligt.
 *
 * Dit bewaakt de AANSLUITING, niet de functie zelf. Een groene test bewijst
 * dat iets werkt, niet dat iemand het gebruikt.
 */
describe('de poorten gebruiken deze functie ook echt', () => {
  const poorten = [
    'src/infrastructure/gateways/llmGateway.ts',
    'src/infrastructure/gateways/visionGateway.ts',
  ];

  it.each(poorten)('%s roept proxyErrorMessage aan', (pad) => {
    expect(readFileSync(pad, 'utf8')).toContain('proxyErrorMessage(');
  });

  it.each(poorten)('%s leest niet meer alleen e.error', (pad) => {
    // Precies de vorm die de reden weggooide.
    expect(readFileSync(pad, 'utf8')).not.toMatch(/e\.error\s*\?\?\s*`Proxy HTTP/);
  });
});
