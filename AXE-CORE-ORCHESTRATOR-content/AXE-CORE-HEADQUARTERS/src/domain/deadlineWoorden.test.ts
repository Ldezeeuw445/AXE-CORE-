import { describe, it, expect } from 'vitest';
import { wanneer } from './deadlineWoorden';

/** Vaste "nu": 17 maart 2026, 12:00. Anders is de test afhankelijk van wanneer
 *  hij draait, en dat is precies het soort test dat 's nachts omvalt. */
const NU = new Date(2026, 2, 17, 12, 0).getTime();
const dag = (d: number, uur = 9) => new Date(2026, 2, d, uur).getTime();

describe('wanneer', () => {
  it('zegt vandaag, ook als het uur al voorbij is', () => {
    // Om 09:00 vandaag met 12:00 op de klok: nog steeds vandaag, niet te laat.
    // Op de dag zelf is een deadline geen overschrijding.
    expect(wanneer(dag(17), NU)).toEqual({ tekst: 'vandaag', telaat: false });
  });

  it('zegt morgen', () => {
    expect(wanneer(dag(18), NU).tekst).toBe('morgen');
  });

  it('telt dagen vooruit', () => {
    expect(wanneer(dag(22), NU).tekst).toBe('over 5 dagen');
  });

  it('zegt gisteren en niet "1 dagen te laat"', () => {
    expect(wanneer(dag(16), NU)).toEqual({ tekst: 'gisteren', telaat: true });
  });

  it('telt hoe lang iets al te laat is', () => {
    expect(wanneer(dag(14), NU)).toEqual({ tekst: '3 dagen te laat', telaat: true });
  });

  it('kijkt naar de DAG en niet naar het aantal uren', () => {
    // 23:59 vanavond en 00:01 vannacht liggen twee minuten uit elkaar maar zijn
    // "vandaag" en "morgen". Op uren rekenen zou allebei "over 0 dagen" geven.
    expect(wanneer(new Date(2026, 2, 17, 23, 59).getTime(), NU).tekst).toBe('vandaag');
    expect(wanneer(new Date(2026, 2, 18, 0, 1).getTime(), NU).tekst).toBe('morgen');
  });
});
