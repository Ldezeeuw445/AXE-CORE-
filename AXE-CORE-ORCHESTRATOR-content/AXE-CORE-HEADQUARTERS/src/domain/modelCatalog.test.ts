import { describe, it, expect } from 'vitest';
import { MODEL_CATALOG, modelsFor, catalogPairs } from './modelCatalog';
import { PROVIDERS, type ProviderId } from './providers';

describe('MODEL_CATALOG', () => {
  it('only lists providers that exist', () => {
    // A catalog entry for a provider the app cannot dispatch to is a dead menu
    // item — the failure `stealth/ox-alpha` already caused once.
    const known = new Set(PROVIDERS.map(p => p.id as string));
    for (const id of Object.keys(MODEL_CATALOG)) expect(known.has(id), id).toBe(true);
  });

  it('says what each model is for', () => {
    // 417 names with no guidance is a worse interface than no dropdown.
    for (const [id, entries] of Object.entries(MODEL_CATALOG)) {
      for (const e of entries ?? []) {
        expect(e.note.length, `${id}/${e.model}`).toBeGreaterThan(5);
        expect(e.model.trim(), `${id}`).toBe(e.model);
      }
    }
  });

  it('stays short enough to choose from without scrolling', () => {
    for (const [id, entries] of Object.entries(MODEL_CATALOG)) {
      expect((entries ?? []).length, id).toBeLessThanOrEqual(6);
      expect((entries ?? []).length, id).toBeGreaterThan(0);
    }
  });

  it('has no duplicate model within a provider', () => {
    for (const [id, entries] of Object.entries(MODEL_CATALOG)) {
      const models = (entries ?? []).map(e => e.model);
      expect(new Set(models).size, id).toBe(models.length);
    }
  });

  it('gives both OpenRouter seats the same menu', () => {
    // Two cards exist so a different model can sit on each; a shorter menu on
    // one of them sends you back to typing slugs.
    expect(modelsFor('openrouter')).toEqual(modelsFor('openrouter2'));
  });
});

describe('modelsFor', () => {
  it('returns nothing for a provider with no curated list', () => {
    expect(modelsFor('openhands' as ProviderId)).toEqual([]);
  });
});

describe('catalogPairs', () => {
  it('flattens only the providers asked for', () => {
    const pairs = catalogPairs(['google']);
    expect(pairs.length).toBe(modelsFor('google').length);
    expect(pairs.every(p => p.provider === 'google')).toBe(true);
  });

  it('keeps the note with the pair, so the picker can show it', () => {
    expect(catalogPairs(['anthropic'])[0].note).toBeTruthy();
  });

  it('is empty for an empty selection', () => {
    expect(catalogPairs([])).toEqual([]);
  });
});
