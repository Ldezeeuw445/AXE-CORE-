import { beforeEach, describe, expect, it } from 'vitest';
import { MODELLEN_SLEUTEL } from '@/domain/motorModellen';
import { leesModellen, zetModel } from './motorModellenOpslag';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
  globalThis.window = { dispatchEvent: () => true } as unknown as Window & typeof globalThis;
});

describe('zetModel', () => {
  it('schrijft de keuze weg zodat leesModellen hem teruggeeft', () => {
    expect(leesModellen()).toEqual({});
    const uit = zetModel('claude', 'sonnet');
    expect(uit).toEqual({ claude: 'sonnet' });
    expect(leesModellen()).toEqual({ claude: 'sonnet' });
    expect(JSON.parse(localStorage.getItem(MODELLEN_SLEUTEL) ?? '{}')).toEqual({ claude: 'sonnet' });
  });

  it('leeg model haalt de pin weg', () => {
    zetModel('codex', 'o3');
    zetModel('codex', '  ');
    expect(leesModellen()).toEqual({});
  });
});
