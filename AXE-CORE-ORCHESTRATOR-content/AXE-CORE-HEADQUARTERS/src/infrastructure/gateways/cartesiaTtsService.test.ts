import { describe, expect, it, beforeEach } from 'vitest';
import { buildCartesiaSpeechRequest, isCartesiaConfigured } from './cartesiaTtsService';

describe('cartesiaTtsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is uit zonder sleutel', () => {
    expect(isCartesiaConfigured()).toBe(false);
  });

  it('leest de sleutel uit connections, niet uit deze file', () => {
    localStorage.setItem('axe_llm_connections', JSON.stringify({ cartesia: { key: 'test-key' } }));
    expect(isCartesiaConfigured()).toBe(true);
    const src = `${buildCartesiaSpeechRequest('Hi').model_id}`;
    expect(src).toBe('sonic-3');
  });

  it('payload noemt sonic-3 en een publiek stem-id, geen geheim', () => {
    const body = buildCartesiaSpeechRequest('Morning, Luka.');
    expect(body.model_id).toBe('sonic-3');
    expect(body.voice.mode).toBe('id');
    expect(body.voice.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toMatch(/sk_|test-key|VITE_/);
  });
});
