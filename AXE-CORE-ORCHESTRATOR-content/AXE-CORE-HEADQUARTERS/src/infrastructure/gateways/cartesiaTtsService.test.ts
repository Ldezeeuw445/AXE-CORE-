import { beforeEach, describe, expect, it, vi } from 'vitest';

const geheugen = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => geheugen.get(k) ?? null,
  setItem: (k: string, v: string) => { geheugen.set(k, v); },
  removeItem: (k: string) => { geheugen.delete(k); },
  clear: () => geheugen.clear(),
});

const { buildCartesiaSpeechRequest, isCartesiaConfigured } = await import('./cartesiaTtsService');

beforeEach(() => geheugen.clear());

describe('cartesiaTtsService', () => {
  it('is uit zonder sleutel', () => {
    expect(isCartesiaConfigured()).toBe(false);
  });

  it('leest de sleutel uit connections, niet uit deze file', () => {
    localStorage.setItem('axe_llm_connections', JSON.stringify({ cartesia: { key: 'test-key' } }));
    expect(isCartesiaConfigured()).toBe(true);
    expect(buildCartesiaSpeechRequest('Hi').model_id).toBe('sonic-3');
  });

  it('payload noemt sonic-3 en een publiek stem-id, geen geheim', () => {
    const body = buildCartesiaSpeechRequest('Morning, Luka.');
    expect(body.model_id).toBe('sonic-3');
    expect(body.voice.mode).toBe('id');
    expect(body.voice.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toMatch(/sk_|test-key|VITE_/);
  });
});
