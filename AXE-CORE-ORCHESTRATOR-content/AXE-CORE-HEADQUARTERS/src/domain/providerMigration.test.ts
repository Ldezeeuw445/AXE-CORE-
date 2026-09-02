/**
 * The Ox Alpha seat became a second OpenRouter one, and neither the key nor the
 * cascade may notice.
 */
import { describe, it, expect } from 'vitest';
import { PROVIDERS, migrateModel, type ProviderId } from './providers';

const byId = (id: string) => PROVIDERS.find(p => p.id === id);

describe('the second OpenRouter seat', () => {
  it('exists and points at OpenRouter', () => {
    const p = byId('openrouter2');
    expect(p).toBeDefined();
    expect(p!.baseUrl).toBe('https://openrouter.ai/api');
    expect(p!.format).toBe('openai');
  });

  it('defaults to a slug that actually exists', () => {
    // stealth/ox-alpha is absent from openrouter.ai/api/v1/models — verified
    // 2026-08-27 across all 417 entries. A default nobody can call is worse
    // than no card.
    expect(byId('openrouter2')!.defaultModel).toBe('openrouter/auto');
  });

  it('is a separate seat from the first, not a rename of it', () => {
    // Two cards is the whole point: one model each, both in the cascade.
    expect(byId('openrouter')).toBeDefined();
    expect(byId('openrouter')!.id).not.toBe(byId('openrouter2')!.id);
  });

  it('carries the dead Ox Alpha model forward to a live one', () => {
    expect(migrateModel('openrouter2', 'stealth/ox-alpha')).toBe('openrouter/auto');
  });

  it('leaves a valid model alone', () => {
    for (const m of ['openrouter/free', 'anthropic/claude-sonnet-5', 'openai/gpt-5.6-luna-pro']) {
      expect(migrateModel('openrouter2', m), m).toBe(m);
    }
  });

  it('no longer has an Ox Alpha provider at all', () => {
    expect(PROVIDERS.some(p => (p.id as string) === 'oxalpha')).toBe(false);
  });

  it('both seats are dispatchable the same way', () => {
    const a = byId('openrouter')!, b = byId('openrouter2')!;
    expect(a.format).toBe(b.format);
    expect(a.needsKey).toBe(b.needsKey);
  });
});

describe('provider ids stay unique', () => {
  it('has no duplicates after the rename', () => {
    const ids = PROVIDERS.map(p => p.id as ProviderId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
