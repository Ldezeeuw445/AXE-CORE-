import { describe, it, expect } from 'vitest';
import { standTekst, standKleur } from '@/domain/providerCardStand';

/**
 * Elke kaart moet in elke stand even groot blijven en hetzelfde zeggen.
 *
 * De valkuil is dat "geen sleutel" en "mislukt" allebei als iets roods gaan
 * ogen, want dan lijkt een provider die je nooit hebt ingesteld op een
 * provider die stuk is. Dat verschil is precies wat je wil zien op een scherm
 * met achttien kaarten.
 */
describe('wat een kaart zegt', () => {
  it('een dienst zonder sleutel is niet mislukt', () => {
    expect(standTekst('idle', false)).toBe('No key');
    expect(standKleur('idle', false)).not.toBe('var(--m-broken)');
  });

  it('ingesteld maar nooit getest heet Ready, niet Connected', () => {
    // Connected zou beweren dat er iets gemeten is. Dat is niet zo.
    expect(standTekst('idle', true)).toBe('Ready');
  });

  it('alleen een geslaagde test is Connected', () => {
    expect(standTekst('ok', true)).toBe('Connected');
    expect(standKleur('ok', true)).toBe('var(--m-happened)');
  });

  it('mislukt is rood, en dat is de enige rode stand', () => {
    expect(standKleur('fail', true)).toBe('var(--m-broken)');
    for (const stand of ['idle', 'testing', 'ok'] as const) {
      expect(standKleur(stand, true)).not.toBe('var(--m-broken)');
      expect(standKleur(stand, false)).not.toBe('var(--m-broken)');
    }
  });

  it('elke stand heeft een tekst -- nooit een leeg hoekje', () => {
    for (const stand of ['idle', 'testing', 'ok', 'fail'] as const) {
      for (const ingesteld of [true, false]) {
        expect(standTekst(stand, ingesteld).length).toBeGreaterThan(0);
      }
    }
  });
});
