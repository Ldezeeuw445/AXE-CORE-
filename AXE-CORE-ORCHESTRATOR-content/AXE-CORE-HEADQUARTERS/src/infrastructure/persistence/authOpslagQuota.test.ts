import { describe, it, expect, beforeEach } from 'vitest';
import {
  zetItem,
  ruimCachesVoorAuth,
  AUTH_CACHE_OPOFFERBAAR,
  OPOFFERBAAR,
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
    // Token ~40 tekens; vul de store met RAG tot er geen ruimte meer is.
    const o = opslag(80);
    o.setItem('axe_rag_memory', 'r'.repeat(50));
    const r = zetItem('sb-x-auth-token', '{"access_token":"abc"}', o);
    expect(r.gelukt).toBe(true);
    expect(r.opgeruimd).toContain('axe_rag_memory');
    expect(o.getItem('sb-x-auth-token')).toContain('access_token');
  });
});
