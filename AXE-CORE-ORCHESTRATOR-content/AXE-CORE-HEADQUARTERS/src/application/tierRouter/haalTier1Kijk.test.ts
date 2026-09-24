import { describe, it, expect } from 'vitest';
import { haalTier1Kijk } from './haalTier1Kijk';

describe('haalTier1Kijk', () => {
  it('haalt geen data voor een groet', async () => {
    let geroepen = 0;
    const kijk = await haalTier1Kijk('greeting', {
      awareness: async () => {
        geroepen += 1;
        return { openTasks: 9, overdueTasks: 2 };
      },
    });
    expect(kijk).toEqual({ openTasks: 0, overdueTasks: 0, titels: [], agenda: [] });
    expect(geroepen).toBe(0);
  });

  it('timeout laat T1 niet hangen', async () => {
    const kijk = await haalTier1Kijk('tasks', {
      timeoutMs: 20,
      awareness: () => new Promise(() => { /* hangt */ }),
      taken: () => new Promise(() => { /* hangt */ }),
    });
    expect(kijk.openTasks).toBe(0);
    expect(kijk.titels).toEqual([]);
  });

  it('gebruikt aangeleverde taken en agenda', async () => {
    const kijk = await haalTier1Kijk('priorities', {
      awareness: async () => ({ openTasks: 2, overdueTasks: 1 }),
      taken: async () => ['Call buyer'],
      agenda: async () => ['Stand-up'],
    });
    expect(kijk.titels).toEqual(['Call buyer']);
    expect(kijk.agenda).toEqual(['Stand-up']);
    expect(kijk.overdueTasks).toBe(1);
  });
});
