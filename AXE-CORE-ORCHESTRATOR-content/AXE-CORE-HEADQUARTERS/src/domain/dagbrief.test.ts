import { describe, expect, it } from 'vitest';
import { eigenaarActiesUit, maakDagbrief, wieVan, type BriefInvoer } from './dagbrief';

const leeg: BriefInvoer = { sinds: '2026-10-28T13:00:00Z', commits: [], prs: [], taken: [], meldingen: [], gezondheid: null, bronFouten: [] };
const commit = (titel: string, body = '', auteur = 'Luka De Zeeuw', repo = 'AXE Core') => ({
  repo, sha: 'abc', titel, body, auteur, datum: '2026-10-29T10:00:00Z', url: 'https://github.com/x',
});

describe('wieVan', () => {
  it('herkent elke helper aan zijn eigen spoor', () => {
    expect(wieVan(commit('Macs ruimen zelf op', 'Claude-Session: https://claude.ai/code/session_1'))).toBe('claude');
    expect(wieVan(commit('fix(risk): P0 guard', '', 'Grok Bot'))).toBe('grok');
    expect(wieVan(commit('Home rails', 'Co-authored-by: Cursor <cursoragent@cursor.com>'))).toBe('cursor');
    expect(wieVan({ titel: 'Unify shell', head: 'chatgpt/shell-spatial-unification' })).toBe('chatgpt');
    expect(wieVan(commit('Build next step: AXON Memory', 'AXE build loop, task 2a1f'))).toBe('bouwlus');
    expect(wieVan({ titel: 'A1: a wordt 2', head: 'dax/abc123-taak' })).toBe('dax');
    expect(wieVan(commit('docs: kleine fix'))).toBe('luka');
  });

  it('een naam in de tekst maakt iemand nog geen auteur', () => {
    // De Daily Brief-commit zelf noemt "Grok Bot, Cursor" en is van Claude.
    expect(wieVan(commit('Daily Brief', 'per helper (Claude, Grok Bot, Cursor)\n\nClaude-Session: https://claude.ai/code/s'))).toBe('claude');
    expect(wieVan(commit('Uitleg over Grok Bot', 'zoals Grok Bot dat doet'))).toBe('luka');
  });
});

describe('eigenaarActiesUit', () => {
  it('neemt de laatste eigenaar-melding en zijn genummerde regels', () => {
    const m = [
      { type: 'warning', createdAt: '2026-10-28T09:00:00Z', message: 'Owner actions: 1 open\n1. oud' },
      { type: 'warning', createdAt: '2026-10-29T09:00:00Z', message: 'Owner actions: 2 open\n1. New GitHub key on the VPS (401). Run zet_github_token.sh\n2. Copper Cathode: yes or no' },
    ];
    expect(eigenaarActiesUit(m)).toEqual(['New GitHub key on the VPS (401). Run zet_github_token.sh', 'Copper Cathode: yes or no']);
  });
});

describe('maakDagbrief', () => {
  it('zonder iets is alles groen en zegt hij dat eerlijk', () => {
    const b = maakDagbrief(leeg);
    expect(b.kleur).toBe('groen');
    expect(b.secties[0]).toMatchObject({ id: 'voor-jou', kleur: 'groen' });
  });

  it('wat op Luka wacht komt bovenaan, geel; een mislukte taak maakt de kop rood', () => {
    const b = maakDagbrief({
      ...leeg,
      meldingen: [{ type: 'warning', createdAt: '2026-10-29T09:00:00Z', message: 'Owner actions: 1 open\n1. New GitHub key' }],
      prs: [{ repo: 'AXE Companion', nummer: 131, titel: 'fix(risk): P0 guard', body: "NIET mergen zonder Luka's akkoord", staat: 'open', draft: false, head: 'fix/risk', url: 'u', bijgewerkt: '2026-10-29T09:06:00Z' }],
      taken: [
        { titel: 'DAX build: next task in AXE-CORE-', status: 'failed', assignee: 'developer', requestedBy: 'dax-bouw', bijgewerkt: '2026-10-29T07:20:00Z' },
        { titel: 'DAX build: next task in AXE-CORE-', status: 'failed', assignee: 'developer', requestedBy: 'dax-bouw', bijgewerkt: '2026-10-29T11:20:00Z' },
      ],
    });
    expect(b.kleur).toBe('rood');
    const jou = b.secties[0];
    expect(jou.regels.map(r => r.kleur)).toEqual(['geel', 'geel', 'rood']);
    expect(jou.regels[1].tekst).toContain('#131');
    const problemen = b.secties.find(s => s.id === 'problemen')!;
    expect(problemen.regels[0].tekst).toBe('DAX build: next task in AXE-CORE- (2x)');
  });

  it('één sectie per helper, met per repo wat er landde', () => {
    const b = maakDagbrief({
      ...leeg,
      commits: [
        commit('Macs ruimen zelf op', 'Claude-Session: s1'),
        commit('Eigen apps in hun eigen shell', 'Claude-Session: s1'),
        commit('fix(chart): account-pill', '', 'Grok Bot', 'AXE Companion'),
      ],
    });
    const claude = b.secties.find(s => s.id === 'wie-claude')!;
    expect(claude.regels[0]).toMatchObject({ tekst: 'AXE Core: 2 changes landed', kleur: 'groen' });
    expect(claude.regels[0].detail).toContain('Eigen apps in hun eigen shell');
    expect(b.secties.find(s => s.id === 'wie-grok')!.regels[0].tekst).toBe('AXE Companion: 1 change landed');
    expect(b.secties.some(s => s.id === 'wie-cursor')).toBe(false);
  });

  it('deploys zijn groen, een rollback rood, en een onleesbare bron staat er zelf in', () => {
    const b = maakDagbrief({
      ...leeg,
      meldingen: [
        { type: 'success', createdAt: '2026-10-29T12:41:00Z', message: 'AXE Core API updated on the VPS (45f7709b): dax_bouw.py' },
        { type: 'error', createdAt: '2026-10-29T13:00:00Z', message: 'AXE Core API update 1234 rolled back: /health answered 502.' },
      ],
      bronFouten: ['Trading OS: private repo, GitHub key needed'],
    });
    const live = b.secties.find(s => s.id === 'live')!;
    expect(live.regels.map(r => r.kleur)).toEqual(['rood', 'groen']);
    expect(b.secties.find(s => s.id === 'problemen')!.regels.at(-1)!.tekst).toContain('Trading OS');
  });
});
