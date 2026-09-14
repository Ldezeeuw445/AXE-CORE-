import { describe, expect, it } from 'vitest';
import {
  bouwKaart, dealStand, koperskant, leverancierskant, losOp, redenenNietGeplaatst, HUB_DREMPEL,
  type KaartDeal, type Middelpunten,
} from '@/domain/northsea/kaart';

/**
 * De tekst in deze tests komt letterlijk uit AXE Commodities, gemeten op 14
 * september 2026. Niet verzonnen voorbeelden: de regels moeten werken op wat
 * er echt staat, inclusief "(supplier claim)" en "stated on supplier copper page".
 */
const MIDDEN: Middelpunten = new Map<string, [number, number]>([
  ['Germany', [10.4, 51.1]], ['Italy', [12.6, 42.8]], ['Netherlands', [5.3, 52.1]], ['Spain', [-3.7, 40.2]],
  ['Turkey', [35.2, 39.0]], ['United Arab Emirates', [54.3, 23.9]], ['Thailand', [101.0, 15.1]],
  ['China', [103.8, 36.5]], ['Vietnam', [106.3, 16.6]], ['Austria', [14.1, 47.6]], ['Zambia', [27.8, -13.4]],
  ['Dem. Rep. Congo', [23.6, -2.9]], ['Oman', [56.1, 20.6]], ['Russia', [96.7, 61.9]], ['Chile', [-71.4, -37.7]],
  ['United States of America', [-98.6, 39.8]], ['United Kingdom', [-2.6, 53.8]], ['Serbia', [20.8, 44.2]],
]);

describe('een plaatsveld uit de data oplossen', () => {
  it('een haven gaat voor het land eromheen', () => {
    expect(losOp('Hamburg, Germany', MIDDEN).locatie).toMatchObject({ label: 'Hamburg', soort: 'haven' });
    expect(losOp('Qinzhou Port, China', MIDDEN).locatie).toMatchObject({ label: 'Qinzhou', soort: 'haven' });
    expect(losOp('Jebel Ali, Dubai, UAE', MIDDEN).locatie).toMatchObject({ label: 'Jebel Ali', soort: 'haven' });
  });

  it('een los land wordt het land', () => {
    expect(losOp('Germany', MIDDEN).locatie).toMatchObject({ label: 'Germany', soort: 'land' });
  });

  it('kent de schrijfwijzen van Turkije uit de data als één land', () => {
    for (const t of ['Turkey', 'Türkiye', 'Republic of Türkiye']) {
      expect(losOp(t, MIDDEN).locatie?.label).toBe('Turkey');
    }
  });

  it('meerdere mogelijke plaatsen zijn géén plaats', () => {
    for (const t of [
      'Mersin / Jebel Ali',
      'Austria or Italy',
      'Zambia / DRC (supplier claim)',
      'Shanghai or Guangzhou Port, China',
      'Rotterdam / Fujairah / Houston',
      'UAE / Oman / Russia stated on supplier copper page',
      'China / Vietnam / Spain (public RFQ lists multiple destinations; exact destination to confirm)',
    ]) {
      expect(losOp(t, MIDDEN), t).toEqual({ locatie: null, reden: 'meerdere' });
    }
  });

  it('een land naast een gebied is ook onzeker', () => {
    expect(losOp('Germany / Africa', MIDDEN).reden).toBe('meerdere');
  });

  it('een toelichting na een puntkomma is geen tweede plaats', () => {
    expect(losOp('Thailand; exact port unconfirmed', MIDDEN).locatie).toMatchObject({ label: 'Thailand', soort: 'land' });
  });

  it('een gebied is geen punt', () => {
    expect(losOp('Central African copper belt', MIDDEN).reden).toBe('regio');
    expect(losOp('Africa (public listing says sourced from African suppliers; exact producer/origin not identified)', MIDDEN).reden).toBe('regio');
  });

  it('leeg en onbekend houden hun eigen reden', () => {
    expect(losOp(null, MIDDEN).reden).toBe('leeg');
    expect(losOp('   ', MIDDEN).reden).toBe('leeg');
    expect(losOp('Atlantis', MIDDEN).reden).toBe('onbekend');
  });
});

describe('de stand van een deal', () => {
  it('volgt dezelfde definitie van actief als de teller bovenin', () => {
    expect(dealStand({ stage: 'verifying', execution_state: 'matched' })).toBe('actief');
    expect(dealStand({ stage: 'identified', execution_state: 'qualifying' })).toBe('actief');
    expect(dealStand({ stage: 'identified', execution_state: 'awaiting_supplier_reply' })).toBe('actief');
    expect(dealStand({ stage: 'identified', execution_state: 'matched' })).toBe('gematcht');
    expect(dealStand({ stage: 'identified', execution_state: 'discovered' })).toBe('overig');
    expect(dealStand({ stage: 'won' })).toBe('afgerond');
  });

  it('een blokkade gaat voor, hoe ver de deal ook is', () => {
    expect(dealStand({ stage: 'verifying', execution_state: 'qualifying', geblokkeerd: true })).toBe('geblokkeerd');
  });
});

describe('de eindpunten van een deal', () => {
  const basis: KaartDeal = { id: 'd1', stage: 'identified', execution_state: 'qualifying' };

  it('neemt de laadhaven voor de herkomst', () => {
    const e = leverancierskant({ ...basis, laadhaven: 'Mersin', herkomst: 'Turkey' }, MIDDEN);
    expect(e).toMatchObject({ bron: 'laadhaven', locatie: { label: 'Mersin' } });
  });

  it('valt terug op de vestiging, en zegt dat', () => {
    const e = leverancierskant({ ...basis, leverancier_stad: 'Bor', leverancier_land: 'Serbia' }, MIDDEN);
    expect(e).toMatchObject({ bron: 'vestiging', locatie: { label: 'Bor' } });
  });

  it('een onzekere herkomst schuift door naar de vestiging in plaats van te gokken', () => {
    const e = leverancierskant({ ...basis, herkomst: 'Zambia / DRC', leverancier_stad: 'Bor', leverancier_land: 'Serbia' }, MIDDEN);
    expect(e.bron).toBe('vestiging');
  });

  it('noemt de ergste reden als niets te plaatsen is', () => {
    const e = koperskant({ ...basis, bestemming: 'Austria or Italy' }, MIDDEN);
    expect(e).toEqual({ locatie: null, reden: 'meerdere' });
  });
});

describe('de kaart als geheel', () => {
  const deals: KaartDeal[] = [
    { id: 'a', stage: 'identified', execution_state: 'qualifying', laadhaven: 'Mersin', bestemming: 'Hamburg, Germany' },
    { id: 'b', stage: 'identified', execution_state: 'matched', herkomst: 'Serbia', bestemming: 'Hamburg, Germany' },
    { id: 'c', stage: 'identified', execution_state: 'matched', geblokkeerd: true, herkomst: 'Chile', bestemming: 'Hamburg, Germany' },
    { id: 'd', stage: 'identified', execution_state: 'qualifying', herkomst: 'Zambia / DRC (supplier claim)', bestemming: 'Italy' },
    { id: 'e', stage: 'identified', execution_state: 'discovered', leverancier_stad: 'Dubai', leverancier_land: 'United Arab Emirates', koper_land: 'Germany' },
  ];
  const kaart = bouwKaart(deals, MIDDEN);

  it('tekent alleen wat aan beide kanten eenduidig is', () => {
    expect(kaart.routes.map(r => r.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('telt wat er niet op staat, met de reden', () => {
    expect(kaart.nietGeplaatst).toHaveLength(1);
    expect(kaart.nietGeplaatst[0]).toMatchObject({ kant: 'leverancier', reden: 'meerdere' });
    expect(redenenNietGeplaatst(kaart.nietGeplaatst)).toEqual([{ reden: 'meerdere', aantal: 1 }]);
  });

  it('een route vanaf een vestiging telt als benaderd, een land uit de deal niet', () => {
    // "Serbia → Hamburg" is wat de deal zegt; "vestiging in Dubai → Duitsland" niet.
    const benaderd = Object.fromEntries(kaart.routes.map(r => [r.id, r.benaderd]));
    expect(benaderd).toEqual({ a: false, b: false, c: false, e: true });
  });

  it('een plaats met genoeg deals wordt een knooppunt', () => {
    const hamburg = kaart.punten.find(p => p.locatie.label === 'Hamburg')!;
    expect(hamburg.deals).toBe(3);
    expect(HUB_DREMPEL).toBeLessThanOrEqual(3);
    expect(hamburg.hub).toBe(true);
    expect(hamburg.perStand).toMatchObject({ actief: 1, gematcht: 1, geblokkeerd: 1 });
  });

  it('een vestiging als tegenpartij telt geen deal mee', () => {
    const dubai = kaart.punten.find(p => p.locatie.label === 'Dubai')!;
    expect(dubai.tegenpartij).toBe(true);
    // Dubai is ook het vertrekpunt van deal e, dus precies één deal -- niet twee.
    expect(dubai.deals).toBe(1);
  });

  it('de tellers van de legenda kloppen met de standen', () => {
    expect(kaart.tellers).toEqual({ actief: 2, gematcht: 1, geblokkeerd: 1, afgerond: 0, overig: 1 });
    // Deal c is geblokkeerd maar gematcht, niet actief.
    expect(kaart.geblokkeerdActief).toBe(0);
  });

  it('telt apart hoeveel geblokkeerde deals óók actief zijn', () => {
    // Anders zegt de desk "24 actief" en de legenda "2", en lijkt een van beide fout.
    const k = bouwKaart([
      { id: 'x', stage: 'verifying', execution_state: 'qualifying', geblokkeerd: true, herkomst: 'Chile', bestemming: 'Germany' },
      { id: 'y', stage: 'identified', execution_state: 'matched', geblokkeerd: true, herkomst: 'Chile', bestemming: 'Germany' },
    ], MIDDEN);
    expect(k.tellers.geblokkeerd).toBe(2);
    expect(k.geblokkeerdActief).toBe(1);
  });

  it('een land met veel deals is geen knooppunt', () => {
    // Een ster op het middelpunt van een land (de Australische woestijn) misleidt.
    const k = bouwKaart(['1', '2', '3'].map(id => ({ id, stage: 'identified', execution_state: 'qualifying', herkomst: 'Chile', bestemming: 'Italy' })), MIDDEN);
    const italie = k.punten.find(p => p.locatie.label === 'Italy')!;
    expect(italie.deals).toBe(3);
    expect(italie.hub).toBe(false);
  });
});
