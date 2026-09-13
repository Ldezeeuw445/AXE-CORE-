import { describe, it, expect } from 'vitest';
import {
  maandagVan, weekDagen, datumSleutel, minutenVan, blokjesVoor, urenBereik,
  DAG_UREN, type RoosterItem,
} from './weekRooster';

const item = (o: Partial<RoosterItem> & { datum: string; tijd: string }): RoosterItem => ({
  id: o.tijd + o.datum, titel: 't', duurMin: 60, kleur: '#fff', soort: 'x', ...o,
});

describe('maandagVan', () => {
  it('geeft op een maandag diezelfde dag', () => {
    expect(datumSleutel(maandagVan(new Date(2026, 2, 16)))).toBe('2026-03-16');
  });

  it('gaat op ZONDAG zes dagen terug en niet één vooruit', () => {
    // De valkuil: getDay() geeft zondag 0, dus "dag min getDay" springt op
    // zondag naar de maandag ERNA in plaats van ervoor.
    expect(datumSleutel(maandagVan(new Date(2026, 2, 22)))).toBe('2026-03-16');
  });

  it('stapt over een maandgrens heen', () => {
    expect(datumSleutel(maandagVan(new Date(2026, 3, 1)))).toBe('2026-03-30');
  });
});

describe('weekDagen', () => {
  it('geeft zeven dagen, maandag eerst', () => {
    const d = weekDagen(new Date(2026, 2, 18)).map(datumSleutel);
    expect(d).toEqual([
      '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19',
      '2026-03-20', '2026-03-21', '2026-03-22',
    ]);
  });
});

describe('minutenVan', () => {
  it('rekent uren en minuten om', () => {
    expect(minutenVan('09:30')).toBe(570);
    expect(minutenVan('00:00')).toBe(0);
  });

  it('geeft null bij onzin in plaats van NaN', () => {
    // NaN zou stil doorlekken naar een positie en het blokje ergens neerzetten.
    expect(minutenVan('')).toBeNull();
    expect(minutenVan('25:00')).toBeNull();
    expect(minutenVan('09:70')).toBeNull();
    expect(minutenVan('morgen')).toBeNull();
  });
});

describe('de schaal', () => {
  it('begint bij middernacht en eindigt na 23 uur', () => {
    expect(DAG_UREN).toBe(24);
  });

});

describe('blokjesVoor', () => {
  const items = [
    item({ datum: '2026-03-18', tijd: '09:00', duurMin: 180 }),
    item({ datum: '2026-03-18', tijd: '03:00' }),
    item({ datum: '2026-03-19', tijd: '10:00' }),
  ];

  it('rekent de plek en de hoogte in uren uit', () => {
    const b = blokjesVoor(items, '2026-03-18', 8, 19);
    expect(b).toHaveLength(1);
    expect(b[0].vanUur).toBe(1);
    expect(b[0].hoogUur).toBe(3);
  });

  it('laat wat buiten het bereik valt WEG in plaats van bovenaan te plakken', () => {
    // Een afspraak om 03:00 die als 08:00 getekend wordt is erger dan een die
    // je niet ziet: op die tweede kom je niet te laat.
    expect(blokjesVoor(items, '2026-03-18', 8, 19).some(b => b.item.tijd === '03:00')).toBe(false);
  });

  it('maakt een kort blokje minstens een half uur hoog', () => {
    const b = blokjesVoor([item({ datum: 'd', tijd: '09:00', duurMin: 10 })], 'd', 8, 19);
    expect(b[0].hoogUur).toBe(0.5);
  });

  it('tekent niet voorbij de onderkant van het rooster', () => {
    const b = blokjesVoor([item({ datum: 'd', tijd: '18:00', duurMin: 300 })], 'd', 8, 19);
    expect(b[0].vanUur + b[0].hoogUur).toBeLessThanOrEqual(19 - 8);
  });

  it('slaat een onleesbare tijd over zonder om te vallen', () => {
    expect(blokjesVoor([item({ datum: 'd', tijd: 'x' })], 'd', 8, 19)).toEqual([]);
  });
});

describe('urenBereik', () => {
  it('geeft de hele dag, ongeacht wat erin staat', () => {
    // Hij rekte eerst mee met de inhoud. Dan is de rij waar 14:00 staat op
    // maandag een andere dan op dinsdag zodra er ergens een avondafspraak bij
    // komt -- en dat is precies waarom een rooster een VASTE schaal hoort te
    // hebben.
    expect(urenBereik()).toEqual({ van: 0, tot: 24 });
  });
});
