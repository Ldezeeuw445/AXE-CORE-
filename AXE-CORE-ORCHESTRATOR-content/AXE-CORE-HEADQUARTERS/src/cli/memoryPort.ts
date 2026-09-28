/**
 * Geheugenpoort. De leerlus / RAG is nu de bron.
 * Een toekomstige AXON-backend vervangt alleen deze poort, niet de commando's.
 */

export interface MemoryHit {
  id: string;
  source: 'rag' | 'global' | 'axon';
  content: string;
  score?: number;
  category?: string;
  key?: string;
}

export interface MemoryAddInput {
  text: string;
  key?: string;
  category?: string;
}

export interface MemoryBackend {
  readonly name: 'rag' | 'axon';
  search(query: string, limit: number): Promise<MemoryHit[]>;
  add(input: MemoryAddInput): Promise<{ id: string; key: string }>;
}

export interface MemoryHttp {
  get(path: string, query?: Record<string, string>): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

/** Standaard: bestaande /memory en /cli/memory op de VPS. */
export function ragMemoryBackend(http: MemoryHttp, userId: string): MemoryBackend {
  return {
    name: 'rag',
    async search(query, limit) {
      try {
        const data = await http.get('/cli/memory/search', { q: query, limit: String(limit), user_id: userId });
        const hits = (data as { hits?: MemoryHit[] }).hits;
        if (Array.isArray(hits)) return hits;
      } catch {
        /* val terug op de oudere /memory-lijst */
      }
      const rows = await http.get('/memory', { user_id: userId, limit: String(Math.max(limit, 50)) }) as Array<{
        key?: string; value?: string; category?: string;
      }>;
      const q = query.toLowerCase();
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => `${r.key ?? ''} ${r.value ?? ''}`.toLowerCase().includes(q))
        .slice(0, limit)
        .map((r, i) => ({
          id: r.key ?? String(i),
          source: 'global' as const,
          content: String(r.value ?? ''),
          category: r.category,
          key: r.key,
        }));
    },
    async add(input) {
      try {
        const data = await http.post('/cli/memory/add', { ...input, user_id: userId }) as { id?: string; key?: string };
        if (data?.key || data?.id) return { id: String(data.id ?? data.key), key: String(data.key ?? data.id) };
      } catch {
        /* val terug */
      }
      const key = input.key || `cli/${Date.now()}`;
      await http.post('/memory/upsert', [{
        user_id: userId,
        key,
        value: input.text,
        category: input.category ?? 'cli',
        confidence: 1,
      }]);
      return { id: key, key };
    },
  };
}

/** Placeholder: zelfde contract, andere naam. Nog geen eigen transport. */
export function axonMemoryBackend(http: MemoryHttp, userId: string): MemoryBackend {
  const inner = ragMemoryBackend(http, userId);
  return { name: 'axon', search: inner.search, add: inner.add };
}

export function pickMemoryBackend(name: 'rag' | 'axon', http: MemoryHttp, userId: string): MemoryBackend {
  return name === 'axon' ? axonMemoryBackend(http, userId) : ragMemoryBackend(http, userId);
}
