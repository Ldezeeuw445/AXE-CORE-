import { describe, it, expect } from 'vitest';
import { isKorteOpdracht, moetPlannen, parseBeurtPlan, planPrompt, PLAN_MAX_JOBS } from './beurtPlan';

/** Zoals de lopende taken in de prompt staan; hieruit komen de control-ids. */
const LOPEND = [
  '[j1] Trading Agent - "Check open positions" - running on VPS',
  '[j2] Developer Agent - "Fix the autosync script" - running on Mac mini',
];

describe('parseBeurtPlan', () => {
  it('leest een echt antwoord van gpt-4.1-mini (25 sep, brain dump)', () => {
    const raw = '{"reply":"Ik ga voor je uitzoeken waarom de autosync op de Mac Mini gisteren faalde.","jobs":[{"agent":"developer","title":"Investigate autosync failure","request":"Investigate and report the cause of the autosync failure on the Mac Mini that occurred yesterday."}],"remember":["We moeten de trading desk een keer opschonen."],"reminders":[]}';
    const plan = parseBeurtPlan(raw);
    expect(plan?.jobs).toHaveLength(1);
    expect(plan?.jobs[0].agent).toBe('developer');
    expect(plan?.onthoud).toEqual(['We moeten de trading desk een keer opschonen.']);
    expect(plan?.herinneringen).toEqual([]);
  });

  it('haalt json uit een codeblok en zet een onbekende agent op axe', () => {
    const plan = parseBeurtPlan('```json\n{"reply":"ok","jobs":[{"agent":"hacker","title":"x","request":"do x"}]}\n```');
    expect(plan?.jobs[0].agent).toBe('axe');
  });

  it('geen antwoord of kapotte json is geen plan, dan neemt de oude route het', () => {
    expect(parseBeurtPlan('{"jobs":[]}')).toBeNull();
    expect(parseBeurtPlan('sorry, ik weet het niet')).toBeNull();
    expect(parseBeurtPlan('{"reply": "ok", ')).toBeNull();
  });

  it('een herinnering met datum wordt ISO, zonder geldige datum geen dueAt', () => {
    const plan = parseBeurtPlan('{"reply":"ok","reminders":[{"title":"Bel Jan","due":"2026-09-26T09:00:00+02:00"},{"title":"Iets","due":"morgen"}]}');
    expect(plan?.herinneringen[0]).toEqual({ title: 'Bel Jan', dueAt: '2026-09-26T07:00:00.000Z' });
    expect(plan?.herinneringen[1]).toEqual({ title: 'Iets' });
  });

  it('begrenst het aantal jobs en slaat jobs zonder opdracht over', () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({ agent: 'browser', title: `j${i}`, request: i === 0 ? '' : `do ${i}` }));
    const plan = parseBeurtPlan(JSON.stringify({ reply: 'ok', jobs }));
    expect(plan?.jobs).toHaveLength(PLAN_MAX_JOBS);
    expect(plan?.jobs[0].request).toBe('do 1');
  });
});

describe('parseBeurtPlan, welke computer', () => {
  it('"kijk op de Mac mini waarom autosync faalde" zet de job op mac-mini', () => {
    const raw = '{"reply":"Ik kijk op de Mac mini waarom de autosync faalde.","jobs":[{"agent":"developer","title":"Autosync op de Mac mini","request":"Find out why autosync failed on the Mac mini and report the cause.","device":"mac-mini"}],"remember":[],"reminders":[]}';
    const plan = parseBeurtPlan(raw);
    expect(plan?.jobs[0].device).toBe('mac-mini');
  });

  it('een onbekende machine wordt null, niet de dichtstbijzijnde gok', () => {
    const raw = '{"reply":"ok","jobs":[{"agent":"developer","title":"x","request":"do x","device":"macbook"},{"agent":"developer","title":"y","request":"do y","device":"Mac-Mini"},{"agent":"trading","title":"z","request":"do z"}]}';
    const plan = parseBeurtPlan(raw);
    expect(plan?.jobs.map((j) => j.device)).toEqual([null, null, null]);
  });

  it('de VPS en de iMac komen er ongeschonden door', () => {
    const raw = '{"reply":"ok","jobs":[{"agent":"apps","title":"x","request":"restart the API","device":"vps"},{"agent":"developer","title":"y","request":"build the app","device":"imac"}]}';
    expect(parseBeurtPlan(raw)?.jobs.map((j) => j.device)).toEqual(['vps', 'imac']);
  });
});

describe('parseBeurtPlan, lopend werk besturen', () => {
  it('"stop die trading-taak maar, en hoe staat de autosync ervoor?" wordt twee controls', () => {
    const raw = '{"reply":"Trading-taak staat stil; de autosync loopt nog.","jobs":[],"controls":[{"action":"cancel","job":"j1"},{"action":"status","job":"j2"}],"remember":[],"reminders":[]}';
    const plan = parseBeurtPlan(raw, LOPEND);
    expect(plan?.controls).toEqual([
      { action: 'cancel', job: 'j1' },
      { action: 'status', job: 'j2' },
    ]);
    expect(plan?.jobs).toEqual([]);
  });

  it('"laat hem in plaats daarvan de logs van vannacht pakken" houdt de instructie vast', () => {
    const raw = '{"reply":"Ik stuur hem bij.","controls":[{"action":"redirect","job":"j2","instruction":"Read last night\'s autosync logs instead of the script."}]}';
    expect(parseBeurtPlan(raw, LOPEND)?.controls[0]).toEqual({
      action: 'redirect',
      job: 'j2',
      instruction: "Read last night's autosync logs instead of the script.",
    });
  });

  it('een control naar een taak die niet loopt valt weg, en zo ook een verzonnen actie', () => {
    const raw = '{"reply":"ok","controls":[{"action":"cancel","job":"j9"},{"action":"sabotage","job":"j1"},{"action":"approve","job":"j1"}]}';
    expect(parseBeurtPlan(raw, LOPEND)?.controls).toEqual([{ action: 'approve', job: 'j1' }]);
  });

  it('zonder lopende lijst kent het plan geen enkele taak, dus geen controls', () => {
    const raw = '{"reply":"ok","controls":[{"action":"cancel","job":"j1"}]}';
    expect(parseBeurtPlan(raw)?.controls).toEqual([]);
  });
});

describe('moetPlannen', () => {
  it('korte losse vraag blijft op de snelle route', () => {
    expect(moetPlannen('hoe laat is het', 1, 2)).toBe(false);
  });
  it('meerdere stukken, echt werk of een lange beurt gaan door het plan', () => {
    expect(moetPlannen('doe a en doe b', 2, 2)).toBe(true);
    expect(moetPlannen('fix de build', 1, 3)).toBe(true);
    expect(moetPlannen('ik zat net te denken, we moeten de trading desk een keer opschonen, maar eerst wil ik weten waarom', 1, 2)).toBe(true);
  });
});

describe('planPrompt', () => {
  it('noemt wat al loopt, zodat het niet opnieuw start', () => {
    expect(planPrompt(new Date('2026-09-25T02:00:00Z'), ['Check VPS health'])).toMatch(/Already running.*Check VPS health/);
  });

  it('vraagt om een machine en om greep op lopend werk, met de id tussen haken', () => {
    const p = planPrompt(new Date('2026-09-25T02:00:00Z'), LOPEND);
    expect(p).toMatch(/"device": string\|null/);
    expect(p).toMatch(/"vps".*"mac-mini".*"imac"/);
    expect(p).toMatch(/"controls": \[\{"action": string, "job": string/);
    expect(p).toMatch(/\[j1\] Trading Agent/);
    expect(p).toMatch(/status .*cancel .*redirect .*approve .*reject .*overview/);
  });
});

describe('isKorteOpdracht', () => {
  it('een korte losse opdracht mag zonder plan één taak worden', () => {
    expect(isKorteOpdracht('check hoeveel schijf de VPS nog heeft')).toBe(true);
  });
  it('een lang verhaal nooit (25 sep: één gesprek werd 25 agent-taken)', () => {
    const verhaal = 'ja nee maar weet je, ik zat vandaag echt te balen, alles liep vast en dat is gewoon kut, maar daar kan je niks aan doen, maar goed het is wat het is en morgen weer een dag';
    expect(isKorteOpdracht(verhaal)).toBe(false);
  });
});
