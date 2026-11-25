import { beforeEach, describe, expect, it, vi } from 'vitest';

const kv = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => kv.get(k) ?? null,
  setItem: (k: string, v: string) => { kv.set(k, v); },
  clear: () => kv.clear(),
});

const opslag: Array<{ key: string; value: string }> = [];
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  memList: vi.fn(async () => opslag.map((r) => ({ ...r }))),
  memUpsert: vi.fn(async (rijen: Array<{ key: string; value: string }>) => {
    for (const r of rijen) {
      const i = opslag.findIndex((x) => x.key === r.key);
      if (i >= 0) opslag[i] = r; else opslag.push(r);
    }
    return rijen;
  }),
}));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'luka' }));

import { _resetProfiel, interviewBeurt, profielContext } from './profiel';

describe('Interview I/O', () => {
  beforeEach(() => { opslag.length = 0; localStorage.clear(); _resetProfiel(); });

  it('gewone chat raakt het geheugen niet', async () => {
    expect(await interviewBeurt('wat is het weer morgen')).toBeNull();
  });

  it('bewaart antwoorden en zet ze in de prompt', async () => {
    expect(await interviewBeurt('interview me')).toContain('Vraag 1 van 10');
    expect(await interviewBeurt('Ik bouw AXE CORE')).toContain('Vraag 2 van 10');
    expect(opslag).toEqual([expect.objectContaining({ key: 'profiel:werk', value: 'Ik bouw AXE CORE' })]);
    expect(profielContext()).toContain('Werk: Ik bouw AXE CORE');
    expect(await interviewBeurt('stop interview')).toContain('gepauzeerd');
    expect(await interviewBeurt('wat is het weer')).toBeNull();
    expect(await interviewBeurt('ga verder met het interview')).toContain('Vraag 2 van 10');
  });
});
