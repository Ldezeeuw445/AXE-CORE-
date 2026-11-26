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

describe('fase 2: details, apps, posities, vastzetten, vandaag', () => {
  it('apps en posities komen erbij op hun plek, met details', async () => {
    const { aandachtTegels } = await import('./podiumAandacht');
    const t = aandachtTegels({ ...RUST, werkend: 1, werkTitels: ['x'], appsMis: ['Trading OS: Failing', 'AXE Core: Warning'], posities: ['EURUSD long · Demo 1'] });
    expect(t.map((x) => x.id)).toEqual(['apps', 'posities', 'agents']);
    expect(t[0]).toMatchObject({ titel: '2 apps need a look', route: '/apps', details: ['Trading OS: Failing', 'AXE Core: Warning'] });
    expect(t[1]).toMatchObject({ titel: '1 open position', route: '/trading' });
  });

  it('details zijn kort en schoon', async () => {
    const { aandachtTegels, DETAIL_MAX } = await import('./podiumAandacht');
    const [w] = aandachtTegels({ ...RUST, wacht: 9, wachtTitels: Array.from({ length: 9 }, (_, n) => `Dit is: vraag ${n}`) });
    expect(w.details).toHaveLength(DETAIL_MAX);
    expect(w.details[0]).toBe('vraag 0');
    expect(w.details[DETAIL_MAX - 1]).toBe('+4 more in Waiting on you');
  });

  it('tijdens een antwoord alleen vastgezette tegels', async () => {
    const { aandachtTegels, zichtbareTegels } = await import('./podiumAandacht');
    const t = aandachtTegels({ ...RUST, wacht: 1, wachtTitels: ['a'], werkend: 1, werkTitels: ['b'] });
    expect(zichtbareTegels(t, new Set(['wacht']), false)).toHaveLength(2);
    expect(zichtbareTegels(t, new Set(['wacht']), true).map((x) => x.id)).toEqual(['wacht']);
    expect(zichtbareTegels(t, new Set(['northsea']), true)).toEqual([]);
  });

  it('vandaag-strook alleen met metingen', async () => {
    const { vandaagStrook } = await import('./podiumAandacht');
    expect(vandaagStrook({ klaar: null, mislukt: null, volgende: [] })).toBeNull();
    expect(vandaagStrook({ klaar: 68, mislukt: 0, volgende: [{ tijd: '18:00', titel: 'Sweep' }] })).toBe('Today · 68 done · next 18:00 Sweep');
    expect(vandaagStrook({ klaar: 5, mislukt: 2, volgende: [] })).toBe('Today · 5 done · 2 failed');
  });
});
