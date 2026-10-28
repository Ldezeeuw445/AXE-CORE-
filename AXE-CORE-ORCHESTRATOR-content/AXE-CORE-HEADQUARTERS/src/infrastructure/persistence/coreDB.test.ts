import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ sessieClient: vi.fn() }));

import { sessieClient } from '@/infrastructure/supabase/supabaseClient';
import { loadLogs, loadMemories, logMessage, saveMemory } from './coreDB';

const sessie = vi.mocked(sessieClient);

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

function tabel(rijen: unknown[] = []) {
  const insert = vi.fn(async () => ({ data: rijen[0] ?? null, error: null }));
  const chain = {
    insert: vi.fn(() => ({ select: () => ({ single: insert }) })),
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: rijen, error: null })),
  };
  return chain;
}

describe('coreDB wacht op een sessie', () => {
  beforeEach(() => {
    sessie.mockReset();
    localStorage.clear();
  });

  it('schrijft niet naar core_memory of core_system_logs zonder sessie', async () => {
    sessie.mockResolvedValue(null);
    const memory = tabel();
    await saveMemory('geheim');
    await logMessage('info', 'test', 'geen sessie');
    expect(memory.insert).not.toHaveBeenCalled();
    const logs = await loadLogs();
    expect(logs).toEqual([]);
  });

  it('leest en schrijft wel met een sessie', async () => {
    const memory = tabel([{ id: '1', content: 'ok', tags: [], importance: 5, source: 't', created_at: '2026-01-01' }]);
    const logs = tabel([{ id: 'l', level: 'info', source: 't', message: 'x', metadata: {}, created_at: '2026-01-01' }]);
    sessie.mockResolvedValue({
      from: (naam: string) => (naam === 'core_memory' ? memory : logs),
    } as never);
    const saved = await saveMemory('ok', ['a'], 5, 't');
    expect(saved?.content).toBe('ok');
    expect(memory.insert).toHaveBeenCalled();
    const loaded = await loadMemories(10);
    expect(loaded.some((e) => e.content === 'ok')).toBe(true);
    await logMessage('info', 't', 'x');
    expect(logs.insert).toHaveBeenCalled();
  });
});
