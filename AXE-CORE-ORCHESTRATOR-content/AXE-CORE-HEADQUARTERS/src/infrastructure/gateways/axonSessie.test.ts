import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  axonEmbedUrl,
  leesAxonSessie,
  schrijfAxonSessie,
  type AxonSessie,
} from './axonSessie';

const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

const SESSIE: AxonSessie = {
  access_token: 'tok-a',
  refresh_token: 'tok-r',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  email: 'luka@axecompanion.com',
};

describe('AXON-sessie in HQ', () => {
  it('onthoudt de sessie first-party en bouwt een hash die in de iframe blijft', () => {
    schrijfAxonSessie(SESSIE);
    const gelezen = leesAxonSessie();
    expect(gelezen?.access_token).toBe('tok-a');
    expect(gelezen?.email).toBe('luka@axecompanion.com');
    const url = axonEmbedUrl(gelezen, 'https://app.axon-memory.com/');
    expect(url.startsWith('https://app.axon-memory.com/#')).toBe(true);
    expect(url).toContain('access_token=tok-a');
    expect(url).toContain('refresh_token=tok-r');
    expect(url).toContain('type=recovery');
    expect(url).not.toContain('allow-top-navigation');
  });

  it('zonder sessie blijft de iframe-url de site zelf, geen Custom Tab', () => {
    expect(axonEmbedUrl(null)).toBe('https://app.axon-memory.com/');
  });
});
