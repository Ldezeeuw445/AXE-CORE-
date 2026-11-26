import { beforeEach, describe, expect, it, vi } from 'vitest';

const opslag: Array<{ key: string; value: string; metadata?: unknown }> = [];
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  memList: vi.fn(async () => opslag.map((r) => ({ ...r }))),
  memUpsert: vi.fn(async (rijen: Array<{ key: string; value: string; metadata?: unknown }>) => {
    for (const r of rijen) {
      const i = opslag.findIndex((x) => x.key === r.key);
      if (i >= 0) opslag[i] = r; else opslag.push(r);
    }
    return rijen;
  }),
}));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'luka' }));

import { _resetStem, stemBeurt, stemContext } from './stem';

const tekst = (n: number) => `Tekst ${n}: kort en direct, zoals ik altijd schrijf naar leveranciers en kopers in de haven van Rotterdam.`;

describe('Jouw stem I/O', () => {
  beforeEach(() => { opslag.length = 0; _resetStem(); });

  it('gewone chat raakt het geheugen niet', async () => {
    expect(await stemBeurt('wat is het weer morgen')).toBeNull();
    expect(stemContext('schrijf een mail')).toBe('');
  });

  it('bewaart tot vijf en zet ze in de prompt bij "in mijn stem"', async () => {
    expect(await stemBeurt(`leer mijn stem: ${tekst(1)}`)).toContain('1 van je teksten');
    for (let i = 2; i <= 5; i++) await stemBeurt(`leer mijn stem: ${tekst(i)}`);
    expect(opslag.map((r) => r.key).sort()).toEqual(['stem:1', 'stem:2', 'stem:3', 'stem:4', 'stem:5']);
    await stemBeurt(`leer mijn stem: ${tekst(6)}`);
    expect(opslag).toHaveLength(5);
    expect(opslag.some((r) => r.value === tekst(6))).toBe(true);
    expect(stemContext('schrijf een post in mijn stem')).toContain('Tekst 6');
    expect(await stemBeurt('mijn stem')).toContain('uit 5 teksten');
  });

  it('te kort wordt niet bewaard', async () => {
    expect(await stemBeurt('leer mijn stem: hoi')).toContain('te kort');
    expect(opslag).toHaveLength(0);
  });
});

describe('heeftStem', () => {
  it('volgt de cache', async () => {
    opslag.length = 0; _resetStem();
    const { heeftStem } = await import('./stem');
    expect(heeftStem()).toBe(false);
    await stemBeurt(`leer mijn stem: ${tekst(1)}`);
    expect(heeftStem()).toBe(true);
  });
});
