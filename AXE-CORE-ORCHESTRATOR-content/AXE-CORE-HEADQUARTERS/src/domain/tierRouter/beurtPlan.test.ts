import { describe, it, expect } from 'vitest';
import { isKorteOpdracht, moetPlannen, parseBeurtPlan, planPrompt, PLAN_MAX_JOBS } from './beurtPlan';

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
