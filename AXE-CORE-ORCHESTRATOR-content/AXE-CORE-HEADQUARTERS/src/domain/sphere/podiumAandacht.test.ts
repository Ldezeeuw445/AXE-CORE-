import { describe, expect, it } from 'vitest';
import { aandachtSleutel, aandachtTegels, tegelsZichtbaar, type AandachtInvoer } from './podiumAandacht';

const RUST: AandachtInvoer = {
  werkend: 0, werkTitels: [], wacht: 0, wachtTitels: [], concepten: [], afspraak: null,
  dienstenDown: [], toestellenOffline: [], vpsWeg: false,
};

describe('podium in rust: aandachtstegels', () => {
  it('niks aan de hand = rustig leeg', () => {
    expect(aandachtTegels(RUST)).toEqual([]);
    expect(aandachtTegels({ ...RUST, concepten: null })).toEqual([]);
  });

  it('volgorde: storing, wacht, NorthSea, afspraak, agents', () => {
    const t = aandachtTegels({
      werkend: 2, werkTitels: ['Herstart de worker', 'Mail check'],
      wacht: 3, wachtTitels: ['Copper Cathode'],
      concepten: ['Term sheet EN590'],
      afspraak: { tijd: '14:00', titel: 'Call met Jan', minutenTot: 40 },
      dienstenDown: ['axe-task-worker'], toestellenOffline: [], vpsWeg: false,
    });
    expect(t.map((x) => x.id)).toEqual(['storing', 'wacht', 'northsea', 'afspraak', 'agents']);
    expect(t[0]).toMatchObject({ titel: 'Something is down', regel: 'axe-task-worker down', route: '/apps', toon: 'fout' });
    expect(t[1]).toMatchObject({ titel: '3 waiting for your OK', route: '/wacht' });
    expect(t[2].titel).toBe('1 NorthSea draft to approve');
    expect(t[3]).toMatchObject({ titel: 'In 40 min', regel: 'Call met Jan', route: '/calendar' });
    expect(t[4]).toMatchObject({ titel: '2 agents working', regel: 'Herstart de worker · Mail check' });
  });

  it('alleen een toestel offline is zacht en gaat naar Devices', () => {
    const [s] = aandachtTegels({ ...RUST, toestellenOffline: ['Mac mini'] });
    expect(s).toMatchObject({ titel: '1 device offline', route: '/devices', toon: 'let-op' });
  });

  it('afspraak alleen binnen twee uur', () => {
    expect(aandachtTegels({ ...RUST, afspraak: { tijd: '18:00', titel: 'x', minutenTot: 200 } })).toEqual([]);
    expect(aandachtTegels({ ...RUST, afspraak: { tijd: '12:00', titel: 'x', minutenTot: 0 } })[0].titel).toBe('Now');
  });

  it('lange lijsten worden kort met een teller', () => {
    const [w] = aandachtTegels({ ...RUST, wacht: 4, wachtTitels: ['a', 'b', 'c', 'd'] });
    expect(w.regel).toBe('a · b · +2');
    expect(aandachtTegels({ ...RUST, wacht: 1, wachtTitels: ['Dit is: een shell-commando'] })[0].regel).toBe('een shell-commando');
  });

  it('tegels wijken voor een antwoord en de sleutel is stabiel', () => {
    expect(tegelsZichtbaar(true, 3)).toBe(false);
    expect(tegelsZichtbaar(false, 0)).toBe(false);
    expect(tegelsZichtbaar(false, 2)).toBe(true);
    const t = aandachtTegels({ ...RUST, werkend: 1, werkTitels: ['x'] });
    expect(aandachtSleutel(t)).toBe(aandachtSleutel(aandachtTegels({ ...RUST, werkend: 1, werkTitels: ['x'] })));
  });
});

describe('antwoord maakt plaats voor de tegels', () => {
  it('blijft tijdens praten en een minuut daarna, weggeklikt is weg', async () => {
    const { antwoordBlijft } = await import('./podiumAandacht');
    expect(antwoordBlijft({ voiceStatus: 'speaking', laatsteAxeTs: 0, nu: 999_999 })).toBe(true);
    expect(antwoordBlijft({ voiceStatus: 'idle', laatsteAxeTs: 1000, nu: 30_000 })).toBe(true);
    expect(antwoordBlijft({ voiceStatus: 'idle', laatsteAxeTs: 1000, nu: 62_000 })).toBe(false);
    expect(antwoordBlijft({ voiceStatus: 'idle', laatsteAxeTs: 1000, nu: 2000, weggelegdTs: 1000 })).toBe(false);
    expect(antwoordBlijft({ voiceStatus: 'idle', laatsteAxeTs: 5000, nu: 6000, weggelegdTs: 1000 })).toBe(true);
  });
});
