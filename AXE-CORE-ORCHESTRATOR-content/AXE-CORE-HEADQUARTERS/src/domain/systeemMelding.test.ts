import { describe, it, expect } from 'vitest';
import {
  kiesSysteemMeldingen, BEGINSTAND, DEMPING_MS, VERS_MS, MAX_PER_KEER, type MeldingRij,
} from '@/domain/systeemMelding';

const NU = Date.UTC(2026, 9, 17, 8, 0, 0);

function rij(id: string, title: string, extra: Partial<MeldingRij> = {}): MeldingRij {
  return { id, title, detail: `detail ${id}`, timestamp: NU - 1_000, read: false, ...extra };
}

/** Eerste lading verwerken, zodat de volgende verversing de echte test is. */
function gestart(rijen: MeldingRij[] = []) {
  return kiesSysteemMeldingen(rijen, BEGINSTAND, NU).stand;
}

describe('kiesSysteemMeldingen', () => {
  it('toont niets bij de eerste lading -- 400 oude rijen zijn geen 400 meldingen', () => {
    const uit = kiesSysteemMeldingen([rij('a', 'Cron faalt'), rij('b', 'API offline')], BEGINSTAND, NU);
    expect(uit.tonen).toEqual([]);
    expect(uit.stand.gestart).toBe(true);
  });

  it('meldt een nieuwe ongelezen rij met onderwerp en detail', () => {
    const stand = gestart([rij('a', 'Oud')]);
    const uit = kiesSysteemMeldingen([rij('a', 'Oud'), rij('b', 'NorthSea offline')], stand, NU);
    expect(uit.tonen).toEqual([{ title: 'NorthSea offline', body: 'detail b', id: 'b' }]);
  });

  it('meldt dezelfde rij geen tweede keer bij de volgende verversing', () => {
    let stand = gestart();
    stand = kiesSysteemMeldingen([rij('b', 'X')], stand, NU).stand;
    expect(kiesSysteemMeldingen([rij('b', 'X')], stand, NU + 30_000).tonen).toEqual([]);
  });

  it('slaat gelezen rijen over: op een ander toestel al gezien', () => {
    const stand = gestart();
    expect(kiesSysteemMeldingen([rij('b', 'X', { read: true })], stand, NU).tonen).toEqual([]);
  });

  it('slaat rijen over die ouder zijn dan tien minuten', () => {
    const stand = gestart();
    const oud = rij('b', 'X', { timestamp: NU - VERS_MS - 1 });
    expect(kiesSysteemMeldingen([oud], stand, NU).tonen).toEqual([]);
  });

  it('dempt hetzelfde onderwerp tien minuten, daarna mag het weer', () => {
    let stand = gestart();
    let uit = kiesSysteemMeldingen([rij('1', 'Provider weg')], stand, NU);
    expect(uit.tonen).toHaveLength(1);
    stand = uit.stand;

    const later = NU + 60_000;
    uit = kiesSysteemMeldingen([rij('1', 'Provider weg'), rij('2', 'Provider weg', { timestamp: later })], stand, later);
    expect(uit.tonen).toEqual([]);
    stand = uit.stand;

    const veelLater = NU + DEMPING_MS + 1;
    uit = kiesSysteemMeldingen([rij('3', 'Provider weg', { timestamp: veelLater })], stand, veelLater);
    expect(uit.tonen).toHaveLength(1);
  });

  it('telt een onderwerp binnen één verversing maar één keer', () => {
    const stand = gestart();
    const uit = kiesSysteemMeldingen([rij('1', 'Zelfde'), rij('2', 'Zelfde'), rij('3', 'Zelfde')], stand, NU);
    expect(uit.tonen).toHaveLength(1);
  });

  it('vat samen boven het maximum in plaats van het scherm te vullen', () => {
    const stand = gestart();
    const rijen = ['A', 'B', 'C', 'D', 'E'].map((t, i) => rij(String(i), t, { timestamp: NU - 5_000 + i }));
    const uit = kiesSysteemMeldingen(rijen, stand, NU);
    expect(uit.tonen).toHaveLength(MAX_PER_KEER);
    expect(uit.tonen.slice(0, MAX_PER_KEER - 1).map(m => m.title)).toEqual(['A', 'B']);
    expect(uit.tonen[MAX_PER_KEER - 1].title).toBe('AXE Core: nog 3 meldingen');
    expect(uit.tonen[MAX_PER_KEER - 1].body).toBe('C · D · E');
  });

  it('kort lange teksten af zodat macOS ze niet zelf halverwege afbreekt', () => {
    const stand = gestart();
    const uit = kiesSysteemMeldingen([rij('1', 'T'.repeat(200), { detail: 'd'.repeat(500) })], stand, NU);
    expect(uit.tonen[0].title.length).toBeLessThanOrEqual(80);
    expect(uit.tonen[0].body.length).toBeLessThanOrEqual(240);
  });

  it('vergeet ids die niet meer in de lijst staan', () => {
    let stand = gestart([rij('weg', 'Oud')]);
    stand = kiesSysteemMeldingen([rij('nieuw', 'Nieuw')], stand, NU).stand;
    expect([...stand.gezien]).toEqual(['nieuw']);
  });
});
