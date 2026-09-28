import { describe, it, expect } from 'vitest';
import { startSpraakStroom } from './stroomSpraak';

describe('startSpraakStroom', () => {
  it('speelt de eerste zin voordat de rest binnen is', async () => {
    const gehoord: string[] = [];
    let first = 0;
    const stroom = startSpraakStroom({
      spreek: async (s, onStart) => { onStart?.(); gehoord.push(s); },
      onFirstAudio: () => { first += 1; },
    });
    stroom.voer('Morning, Luka. Companion is');
    await new Promise((r) => setTimeout(r, 30));
    expect(gehoord).toEqual(['Morning, Luka.']);
    expect(first).toBe(1);
    stroom.voer('Morning, Luka. Companion is live. Want a status?');
    stroom.sluit();
    await new Promise((r) => setTimeout(r, 40));
    expect(gehoord[0]).toBe('Morning, Luka.');
    expect(gehoord.length).toBeGreaterThanOrEqual(2);
    expect(first).toBe(1);
  });

  it('stop gooit de wachtrij weg (barge-in)', async () => {
    const gehoord: string[] = [];
    const stroom = startSpraakStroom({
      spreek: async (s) => {
        gehoord.push(s);
        await new Promise((r) => setTimeout(r, 40));
      },
    });
    stroom.voer('One sentence here. Two sentence here. Three sentence here.');
    stroom.stop();
    await new Promise((r) => setTimeout(r, 60));
    expect(gehoord.length).toBeLessThanOrEqual(1);
  });
});
