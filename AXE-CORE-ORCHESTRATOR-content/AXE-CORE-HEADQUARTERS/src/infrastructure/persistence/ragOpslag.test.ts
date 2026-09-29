import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sbInsertRow, embedText, stand } = vi.hoisted(() => {
  const stand = { vector: [] as number[] };
  return {
    stand,
    sbInsertRow: vi.fn<(tabel: string, rij: Record<string, unknown>) => Promise<unknown[]>>(async () => []),
    embedText: vi.fn(async () => stand.vector),
  };
});

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: () => null }));
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({ isAxeApiConfigured: true, sbInsertRow }));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ APP_SOURCE: 'axe-core', AXE_USER_ID: 'luka' }));
vi.mock('@/infrastructure/persistence/embeddingService', () => ({
  embedText,
  embedTextSync: () => new Array(256).fill(0.0625),
  cosineSimilarity: (a: number[], b: number[]) => (a.length === b.length ? 0.9 : 0),
}));

import { saveRagMemory, searchRagMemories } from './ragMemoryService';

beforeEach(() => {
  sbInsertRow.mockClear();
  embedText.mockClear();
});

// 28 sep: de telefoon had alleen de 256-hash, en rag_memories (vector(1024))
// weigerde daarom de hele rij. 744 herinneringen in een etmaal weg.
describe('een herinnering bewaren', () => {
  it('bewaart hem zonder vector als er geen bge-m3 was, in plaats van hem kwijt te raken', async () => {
    stand.vector = new Array(256).fill(0.1);
    await saveRagMemory({ category: 'conversation', content: 'hoi', importance: 5 });
    const rij = sbInsertRow.mock.calls[0][1];
    expect(rij.embedding).toBeNull();
    expect((rij.metadata as Record<string, unknown>).has_embedding).toBe(false);
  });

  it('bewaart een bge-m3-vector gewoon mee', async () => {
    stand.vector = new Array(1024).fill(0.03);
    await saveRagMemory({ category: 'conversation', content: 'hoi', importance: 5 });
    const rij = sbInsertRow.mock.calls[0][1];
    expect(rij.embedding).toHaveLength(1024);
    expect((rij.metadata as Record<string, unknown>).has_embedding).toBe(true);
  });
});

// 29 sep: de zoek-terugval embedde elke geladen herinnering opnieuw, 200 tegelijk.
describe('zoeken zonder de database', () => {
  it('vraagt het model alleen om de vraag, nooit per herinnering', async () => {
    const opgeslagen = [
      // Zoals PostgREST pgvector teruggeeft: tekst, geen array.
      { category: 'conversation', content: 'trading portfolio widget', importance: 6, embedding: JSON.stringify(new Array(1024).fill(0.03)) },
      ...Array.from({ length: 5 }, (_, i) => ({ category: 'conversation', content: `trading notitie ${i}`, importance: 5, embedding: new Array(256).fill(0.1) })),
    ];
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(opgeslagen), setItem: () => {} });
    stand.vector = new Array(1024).fill(0.03);
    const hits = await searchRagMemories('trading portfolio');
    // Twee keer de vraag (vector-zoek en terugval), nul keer een herinnering.
    expect(embedText).toHaveBeenCalledTimes(2);
    expect(embedText.mock.calls.every((c) => (c as unknown[])[0] === 'trading portfolio')).toBe(true);
    // De tekst-vector telt mee; de rest alleen op trefwoorden.
    expect(hits[0].content).toBe('trading portfolio widget');
    vi.unstubAllGlobals();
  });
});
