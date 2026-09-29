import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sbInsertRow, stand } = vi.hoisted(() => ({
  sbInsertRow: vi.fn<(tabel: string, rij: Record<string, unknown>) => Promise<unknown[]>>(async () => []),
  stand: { vector: [] as number[] },
}));

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: () => null }));
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({ isAxeApiConfigured: true, sbInsertRow }));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ APP_SOURCE: 'axe-core', AXE_USER_ID: 'luka' }));
vi.mock('@/infrastructure/persistence/embeddingService', () => ({
  embedText: async () => stand.vector,
  cosineSimilarity: () => 0,
}));

import { saveRagMemory } from './ragMemoryService';

beforeEach(() => sbInsertRow.mockClear());

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
