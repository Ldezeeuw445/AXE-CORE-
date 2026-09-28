/**
 * Wat hier bewezen wordt: praten OVER een lopende taak start er geen nieuwe,
 * en er wordt nooit gegokt welke taak Luka bedoelt. Bij twijfel blijft
 * `jobIds` leeg — dat is de test die telt.
 */
import { describe, it, expect } from 'vitest';
import { herkenBesturing } from './jobBesturing';
import type { AxeJob } from './axeJobRegels';

const job = (over: Partial<AxeJob> = {}): AxeJob => ({
  id: 'j1',
  title: 'scan the market',
  agent: 'trading',
  state: 'running',
  startedAt: 1,
  sourceText: 'scan the market',
  ...over,
});

const trading = job({ id: 't1', agent: 'trading', title: 'scan the market', sourceText: 'scan the market' });
const northsea = job({
  id: 'n1',
  agent: 'northsea',
  title: 'check the northsea deals',
  sourceText: 'check the northsea deals',
});
const bouwen = job({
  id: 'd1',
  agent: 'developer',
  title: 'build the app',
  sourceText: 'build the app',
});

describe('status opvragen', () => {
  it('"wat doet de trading agent?" vraagt de lopende taak op, start er geen nieuwe', () => {
    const r = herkenBesturing('wat doet de trading agent?', [trading]);
    expect(r?.actie).toBe('status');
    expect(r?.jobIds).toEqual(['t1']);
    expect(r?.twijfel).toBeUndefined();
  });

  it('kiest de juiste van twee lopende taken', () => {
    const r = herkenBesturing('wat doet de trading agent?', [northsea, trading]);
    expect(r?.actie).toBe('status');
    expect(r?.jobIds).toEqual(['t1']);
  });

  it('werkt ook in het Engels', () => {
    const r = herkenBesturing("what's northsea doing?", [northsea, trading]);
    expect(r?.actie).toBe('status');
    expect(r?.jobIds).toEqual(['n1']);
  });

  it('"hoe staat het ermee" met precies een taak pakt die taak', () => {
    const r = herkenBesturing('hoe staat het ermee?', [northsea]);
    expect(r?.actie).toBe('status');
    expect(r?.jobIds).toEqual(['n1']);
  });
});

describe('afbreken', () => {
  it('"stop de northsea taak" annuleert precies die ene taak', () => {
    const r = herkenBesturing('stop de northsea taak', [northsea, trading]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual(['n1']);
    expect(r?.twijfel).toBeUndefined();
  });

  it('"stop" met twee lopende taken vraagt na en annuleert niets', () => {
    const r = herkenBesturing('stop', [northsea, trading]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual([]);
    expect(r?.twijfel).toBeTruthy();
    // De vraag moet de kandidaten noemen, anders kan Luka niet kiezen.
    expect(r?.twijfel).toContain('NorthSea');
    expect(r?.twijfel).toContain('Trading');
  });

  it('"stop" met een lopende taak mag wel', () => {
    const r = herkenBesturing('stop', [northsea]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual(['n1']);
  });

  it('"laat maar" is ook afbreken', () => {
    const r = herkenBesturing('laat maar', [northsea]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual(['n1']);
  });

  it('een genoemde agent die niet loopt levert een vraag op, geen annulering', () => {
    const r = herkenBesturing('stop de trading agent', [northsea]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual([]);
    expect(r?.twijfel).toBeTruthy();
  });

  it('kiest op apparaatnaam', () => {
    const imac = job({ id: 'i1', agent: 'developer', title: 'build the app on the iMac', sourceText: 'build the app on the iMac' });
    const r = herkenBesturing('cancel the job on the imac', [imac, trading]);
    expect(r?.jobIds).toEqual(['i1']);
  });

  it('kiest op volgorde: "stop die laatste"', () => {
    const r = herkenBesturing('stop die laatste', [northsea, trading]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual(['t1']);
  });

  it('"stop alles" is expliciet en pakt alles', () => {
    const r = herkenBesturing('stop alles', [northsea, trading]);
    expect(r?.actie).toBe('cancel');
    expect(r?.jobIds).toEqual(['n1', 't1']);
  });

  it('raakt een taak die al klaar is nooit aan', () => {
    const klaar = job({ id: 'oud', state: 'done', agent: 'northsea', title: 'check the northsea deals' });
    const r = herkenBesturing('stop', [klaar, bouwen]);
    expect(r?.jobIds).toEqual(['d1']);
  });

  it('"stop loss op 1.05" is handelstaal, geen annulering', () => {
    expect(herkenBesturing('stop loss op 1.05 zetten', [trading])).toBeNull();
  });

  it('zonder lopende taken valt er niets af te breken', () => {
    expect(herkenBesturing('stop', [])).toBeNull();
  });
});

describe('bijsturen', () => {
  it('"doe het op de iMac in plaats daarvan" stuurt bij met de instructie erin', () => {
    const r = herkenBesturing('doe het op de iMac in plaats daarvan', [bouwen]);
    expect(r?.actie).toBe('redirect');
    expect(r?.jobIds).toEqual(['d1']);
    expect(r?.instructie).toContain('iMac');
  });

  it('bijsturen met twee lopende taken vraagt eerst welke', () => {
    const r = herkenBesturing('doe het op de iMac in plaats daarvan', [bouwen, trading]);
    expect(r?.actie).toBe('redirect');
    expect(r?.jobIds).toEqual([]);
    expect(r?.twijfel).toBeTruthy();
    expect(r?.instructie).toContain('iMac');
  });

  it('Engels: "actually use the vps"', () => {
    const r = herkenBesturing('actually use the vps', [bouwen]);
    expect(r?.actie).toBe('redirect');
    expect(r?.jobIds).toEqual(['d1']);
    expect(r?.instructie).toContain('vps');
  });
});

describe('goedkeuren en weigeren', () => {
  const wacht1 = job({ id: 'w1', state: 'waiting', agent: 'developer', title: 'deploy the api' });
  const wacht2 = job({ id: 'w2', state: 'waiting', agent: 'northsea', title: 'send the offer' });

  it('"ja doe maar" met twee wachtende keurt niets goed', () => {
    const r = herkenBesturing('ja doe maar', [wacht1, wacht2]);
    expect(r?.jobIds).toEqual([]);
    expect(r?.twijfel).toBeTruthy();
  });

  it('"ja doe maar" met precies een wachtende keurt die goed', () => {
    const r = herkenBesturing('ja doe maar', [wacht1, trading]);
    expect(r?.actie).toBe('approve');
    expect(r?.jobIds).toEqual(['w1']);
  });

  it('"nee" met een wachtende is weigeren', () => {
    const r = herkenBesturing('nee', [wacht1]);
    expect(r?.actie).toBe('reject');
    expect(r?.jobIds).toEqual(['w1']);
  });

  it('"ja doe maar" zonder wachtende goedkeuring is gewoon praten', () => {
    expect(herkenBesturing('ja doe maar', [trading])).toBeNull();
    expect(herkenBesturing('nee', [trading])).toBeNull();
  });
});

describe('overzicht', () => {
  it('"wat loopt er?" geeft het overzicht', () => {
    const r = herkenBesturing('wat loopt er?', [northsea, trading]);
    expect(r?.actie).toBe('overview');
    expect(r?.jobIds).toEqual(['n1', 't1']);
  });

  it('"what\'s running" ook', () => {
    expect(herkenBesturing("what's running?", [trading])?.actie).toBe('overview');
  });

  it('overzicht mag ook als er niets loopt', () => {
    const r = herkenBesturing('wat loopt er?', []);
    expect(r?.actie).toBe('overview');
    expect(r?.jobIds).toEqual([]);
  });
});

describe('gewone zinnen blijven van de taken af', () => {
  const zinnen = [
    'wat is het weer vandaag?',
    'schrijf een rapport over koper',
    'hoe laat is het?',
    'kun je de markt even analyseren',
    'maak een grafiek van de omzet',
    'hoe staat het met de koperprijs deze week',
    'ik ga even koffie halen',
  ];
  for (const zin of zinnen) {
    it(`"${zin}" geeft null`, () => {
      expect(herkenBesturing(zin, [northsea, trading])).toBeNull();
    });
  }

  it('lege invoer geeft null', () => {
    expect(herkenBesturing('', [trading])).toBeNull();
    expect(herkenBesturing('   ', [trading])).toBeNull();
  });
});
