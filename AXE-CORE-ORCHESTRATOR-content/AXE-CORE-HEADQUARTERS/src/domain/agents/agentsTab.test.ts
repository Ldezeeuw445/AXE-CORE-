import { describe, it, expect } from 'vitest';
import {
  tierKolommen, namespaceVan, teltMeeOpDezeTab, tellersVoor, aantalWerkend,
  WEERGAVEN, LADE_TABS,
} from './agentsTab';
import { AXE_AGENTS, type AxeAgentId } from './roster';
import type { SchedulePlan, AgentQueue } from './activity';

describe('tierKolommen', () => {
  it('geeft drie kolommen in de volgorde van de roster', () => {
    expect(tierKolommen().map((k) => k.key)).toEqual(['tier1', 'tier2', 'tier3']);
  });

  it('vult ze met de agents die dat tier in roster.ts heeft — 5, 6 en 2', () => {
    const [t1, t2, t3] = tierKolommen();
    expect(t1.leden.map((a) => a.id)).toEqual(['wingman', 'northsea', 'trading', 'developer', 'thinktank']);
    expect(t2.leden.map((a) => a.id)).toEqual(['browser', 'memory', 'task', 'cron', 'finance', 'apps']);
    expect(t3.leden.map((a) => a.id)).toEqual(['intel', 'companion']);
  });

  // AXE stuurt de tiers aan, hij staat er niet in. Stond hij er wel in, dan zou
  // hij in een kolom staan alsof een manager hem aan het werk zet.
  it('laat AXE zelf buiten de kolommen', () => {
    const alle = tierKolommen().flatMap((k) => k.leden.map((a) => a.id));
    expect(alle).not.toContain('axe');
    expect(alle).toHaveLength(AXE_AGENTS.length - 1);
  });

  it('elke kolom draagt zijn eigen motorregel', () => {
    const regels = tierKolommen().map((k) => k.regel);
    expect(new Set(regels).size).toBe(3);
    expect(regels[0]).toMatch(/subscription/i);
    expect(regels[1]).toMatch(/auto-routed/i);
    expect(regels[2]).toMatch(/paid/i);
  });
});

describe('namespaceVan', () => {
  it('vindt de namespaces die al bestonden voor deze tab er was', () => {
    expect(namespaceVan('axe')).toBe('global');
    expect(namespaceVan('trading')).toBe('axe_trader');
    expect(namespaceVan('developer')).toBe('axe_code');
  });

  it('en de standaard axe_<id> voor de rest', () => {
    expect(namespaceVan('cron')).toBe('axe_cron');
    expect(namespaceVan('companion')).toBe('axe_companion');
  });

  // Dit ging eerst mis: `memoryOwners()` is de lijst die deze tab TOONT, en die
  // laat trading eruit. Als naamlijst gebruikt gaf hij Trading dus geen
  // namespace, terwijl die gewoon bestaat -- alleen op een andere tab.
  it('geeft Trading ook een namespace, al telt die op deze tab niet mee', () => {
    expect(namespaceVan('trading')).toBe('axe_trader');
    expect(teltMeeOpDezeTab('axe_trader')).toBe(false);
    expect(teltMeeOpDezeTab('axe_cron')).toBe(true);
    expect(teltMeeOpDezeTab(null)).toBe(false);
  });
});

describe('tellersVoor', () => {
  const plan = (agent: AxeAgentId, key: string): SchedulePlan => ({
    key, agent, name: key, cron: '0 * * * *', nextAt: null, lastAt: null,
    lastStatus: 'ok', failures: 0, state: 'upcoming',
  });
  const queue = (agent: AxeAgentId, total: number, approvals: number): AgentQueue => ({
    agent, total, approvals, tasks: [],
  });

  it('telt schedules, wachtrij en goedkeuringen van die ene agent', () => {
    const t = tellersVoor(
      'cron',
      [plan('cron', 'a'), plan('cron', 'b'), plan('northsea', 'c')],
      [queue('cron', 4, 1), queue('axe', 120, 9)],
      {},
    );
    expect(t.schedules).toBe(2);
    expect(t.queued).toBe(4);
    expect(t.approvals).toBe(1);
  });

  it('is overal nul als er niets van die agent is', () => {
    expect(tellersVoor('apps', [], [], {})).toEqual({ schedules: 0, queued: 0, approvals: 0, episodes: 0 });
  });

  // Dit is de val: AXE's namespace is `global`, en de trading-desk schrijft daar
  // 4.300 rijen in. Zou de kaart `own + desk` tonen, dan claimt AXE andermans
  // geheugen. `own` is wat van hem is.
  it('telt alleen het eigen geheugen, niet wat de desk in die namespace schreef', () => {
    const t = tellersVoor('axe', [], [], { global: { own: 789, desk: 4300 } });
    expect(t.episodes).toBe(789);
  });

  it('een namespace die niet te lezen was telt als nul, niet als NaN', () => {
    const t = tellersVoor('memory', [], [], { axe_memory: { own: null, desk: null } });
    expect(t.episodes).toBe(0);
  });

  it('echte episodes gaan voor de geheugentelling zodra die er zijn', () => {
    const t = tellersVoor('finance', [], [], { axe_finance: { own: 2, desk: 0 } }, { finance: 379 });
    expect(t.episodes).toBe(379);
  });
});

describe('aantalWerkend', () => {
  it('telt alleen wie echt loopt', () => {
    expect(aantalWerkend({ trading: { working: true }, cron: { working: false } })).toBe(1);
    expect(aantalWerkend({})).toBe(0);
  });
});

describe('de twee rijen knoppen', () => {
  it('vier weergaven en vijf ladetabs, met unieke ids', () => {
    expect(WEERGAVEN.map((w) => w.id)).toEqual(['roster', 'activity', 'memory', 'settings']);
    expect(LADE_TABS.map((t) => t.id)).toEqual(['nu', 'activity', 'plans', 'memory', 'settings']);
  });
});
