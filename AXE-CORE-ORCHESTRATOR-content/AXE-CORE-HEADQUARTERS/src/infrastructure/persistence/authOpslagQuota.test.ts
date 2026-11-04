import { describe, it, expect } from 'vitest';
import {
  zetItem,
  ruimCachesVoorAuth,
  AUTH_CACHE_OPOFFERBAAR,
  OPOFFERBAAR,
  BESCHERMDE_OPSLAG_SLEUTELS,
  BESCHERMDE_OPSLAG_PREFIXEN,
} from '@/infrastructure/persistence/veiligeOpslag';

function opslag(maxTekens = Infinity): Storage {
  const bak = new Map<string, string>();
  const grootte = () => [...bak.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k: string) => bak.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const zonder = grootte() - (bak.has(k) ? k.length + (bak.get(k)?.length ?? 0) : 0);
      if (zonder + k.length + v.length > maxTekens) {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      bak.set(k, v);
    },
    removeItem: (k: string) => { bak.delete(k); },
    clear: () => bak.clear(),
    key: (i: number) => [...bak.keys()][i] ?? null,
    get length() { return bak.size; },
  } as Storage;
}

describe('auth session past na volle cache', () => {
  it('ruimCachesVoorAuth wist RAG/embed caches maar geen auth-token', () => {
    const o = opslag();
    o.setItem('axe_rag_memory', 'x'.repeat(1000));
    o.setItem('axe_embed_cache_v1', 'y'.repeat(1000));
    o.setItem('sb-pqnngpcgbdwxavbatbia-auth-token', '{"access_token":"t"}');
    const weg = ruimCachesVoorAuth(o);
    expect(weg).toEqual(expect.arrayContaining(['axe_rag_memory', 'axe_embed_cache_v1']));
    expect(o.getItem('sb-pqnngpcgbdwxavbatbia-auth-token')).toBeTruthy();
    expect(AUTH_CACHE_OPOFFERBAAR).toContain('axe_rag_memory');
    expect(OPOFFERBAAR).toContain('axe_embed_cache_v1');
  });

  it('zetItem maakt ruimte via RAG-cache zodat een auth-token landt', () => {
    const o = opslag(80);
    o.setItem('axe_rag_memory', 'r'.repeat(50));
    const r = zetItem('sb-x-auth-token', '{"access_token":"abc"}', o);
    expect(r.gelukt).toBe(true);
    expect(r.opgeruimd).toContain('axe_rag_memory');
    expect(o.getItem('sb-x-auth-token')).toContain('access_token');
  });

  it('wist nooit axe_conv_v2_* gesprekken bij quota-opruiming', () => {
    // chatPersistence.ts: localStorage is de primaire store voor gesprekken.
    const o = opslag();
    const convKey = 'axe_conv_v2_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    o.setItem(convKey, JSON.stringify([{ role: 'user', content: 'bewaar dit' }]));
    o.setItem('axe_rag_memory', 'r'.repeat(200));
    o.setItem('axe_embed_cache_v1', 'e'.repeat(200));
    ruimCachesVoorAuth(o);
    expect(o.getItem(convKey)).toContain('bewaar dit');
    expect(BESCHERMDE_OPSLAG_PREFIXEN.some((p) => convKey.startsWith(p))).toBe(true);
    expect(OPOFFERBAAR.some((k) => k.startsWith('axe_conv_v2_'))).toBe(false);
  });

  it('wist nooit axe_custom_skills bij quota-opruiming', () => {
    const o = opslag();
    o.setItem('axe_custom_skills', JSON.stringify([{ id: 's1', name: 'mijn skill' }]));
    o.setItem('axe_rag_memory', 'r'.repeat(200));
    ruimCachesVoorAuth(o);
    expect(o.getItem('axe_custom_skills')).toContain('mijn skill');
    expect(OPOFFERBAAR).not.toContain('axe_custom_skills');
    expect(AUTH_CACHE_OPOFFERBAAR).not.toContain('axe_custom_skills');
    expect(BESCHERMDE_OPSLAG_SLEUTELS).toContain('axe_custom_skills');
  });

  it('zetItem offert geen gesprekken of skills om ruimte te maken', () => {
    // Eerst vullen zonder limiet, daarna een krappe cap via proxy zodat
    // alleen de auth-write QuotaExceeded raakt (niet de seed).
    const o = opslag();
    const convKey = 'axe_conv_v2_11111111-2222-3333-4444-555555555555';
    o.setItem(convKey, 'c'.repeat(40));
    o.setItem('axe_custom_skills', 's'.repeat(40));
    o.setItem('axe_embed_cache_v1', 'e'.repeat(40));
    o.setItem('axe_rag_memory', 'r'.repeat(40));
    const maxTekens = 200; // genoeg voor bestaande data, te krap voor +auth
    const capped: Storage = {
      getItem: (k) => o.getItem(k),
      removeItem: (k) => o.removeItem(k),
      clear: () => o.clear(),
      key: (i) => o.key(i),
      get length() { return o.length; },
      setItem: (k, v) => {
        const keys = Array.from({ length: o.length }, (_, i) => o.key(i)!).filter(Boolean);
        const grootte = keys.reduce((n, kk) => n + kk.length + (o.getItem(kk)?.length ?? 0), 0);
        const zonder = grootte - (o.getItem(k) ? k.length + (o.getItem(k)?.length ?? 0) : 0);
        if (zonder + k.length + v.length > maxTekens) {
          const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError';
          throw e;
        }
        o.setItem(k, v);
      },
    };
    const r = zetItem('sb-y-auth-token', '{"access_token":"z"}', capped);
    expect(o.getItem(convKey)).toBeTruthy();
    expect(o.getItem('axe_custom_skills')).toBeTruthy();
    expect(r.opgeruimd ?? []).not.toContain(convKey);
    expect(r.opgeruimd ?? []).not.toContain('axe_custom_skills');
  });
});
