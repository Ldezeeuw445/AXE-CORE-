import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AXON_SITE,
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

const GEHEIM = /access_token|refresh_token|id_token|type=recovery|(?:^|[?#&])code=/i;

describe('AXON-sessie in HQ', () => {
  it('onthoudt de sessie first-party; de iframe krijgt geen tokens in de URL', () => {
    schrijfAxonSessie(SESSIE);
    const gelezen = leesAxonSessie();
    expect(gelezen?.access_token).toBe('tok-a');
    expect(gelezen?.email).toBe('luka@axecompanion.com');
    const url = axonEmbedUrl(gelezen, 'https://app.axon-memory.com/');
    expect(url).toBe(AXON_SITE);
    expect(url).not.toMatch(GEHEIM);
    expect(url.includes('#')).toBe(false);
  });

  it('weiger een vijandige basis: altijd app.axon-memory.com, nooit recovery-hash', () => {
    schrijfAxonSessie(SESSIE);
    expect(axonEmbedUrl(SESSIE, 'https://evil.example/')).toBe(AXON_SITE);
    expect(axonEmbedUrl(SESSIE, 'https://axon-memory.com/')).toBe(AXON_SITE);
    expect(axonEmbedUrl(SESSIE, 'http://app.axon-memory.com/')).toBe(AXON_SITE);
    expect(axonEmbedUrl(null)).toBe(AXON_SITE);
    expect(axonEmbedUrl(SESSIE)).not.toMatch(GEHEIM);
  });
});
