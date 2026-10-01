/**
 * De ratel onder `agentNaam.ts`.
 *
 * Deze test is het punt van die module. Hij loopt elke spelling langs die
 * érgens in de app een agent aanduidt -- de rosterids, de zaailijst voor
 * `public.agents`, de terugvallijst voor `core_agents` en haar
 * `memory_namespace`-strings, en de namespaces uit de catalogus -- en eist dat
 * elk van die namen thuiskomt bij één rosteragent, of met reden op de lijst
 * staat van wat geen agent is.
 *
 * Zonder deze test is het alternatief wat er stond: per naam repareren zodra
 * iemand merkt dat een agent "nog niet aangesloten" lijkt terwijl zijn code
 * draait. Dat is twee keer gebeurd, en liet elke keer de volgende spelling open.
 */
import { describe, it, expect } from 'vitest';
import { canoniekeAgent, isGeenRosteragent } from './agentNaam';
import { AXE_AGENTS } from './roster';
import { AGENT_CATALOG } from './catalog';
import { AGENT_SEEDS } from './agentRegistry';
import { DEFAULT_AGENTS } from '@/domain/catalogs/defaultAgents';

const ROSTER = AXE_AGENTS.map((a) => a.id);

/** Komt deze naam thuis, of is hij met reden geen agent? */
function thuis(naam: string): boolean {
  return canoniekeAgent(naam) !== null || isGeenRosteragent(naam);
}

describe('elke agent heet één ding', () => {
  it('elke rosteragent vindt zichzelf', () => {
    for (const id of ROSTER) expect(canoniekeAgent(id), id).toBe(id);
  });

  it('elke namespace uit de catalogus komt bij zijn eigen agent uit', () => {
    for (const entry of AGENT_CATALOG.filter((a) => a.kind === 'core')) {
      expect(canoniekeAgent(entry.namespace), `${entry.id} / ${entry.namespace}`).toBe(entry.id);
    }
  });

  it('elke naam uit de zaailijst voor public.agents komt thuis', () => {
    const kwijt = AGENT_SEEDS.map((s) => s.id).filter((id) => !thuis(id));
    expect(kwijt, 'onbekende spelling: zet hem in ONREGELMATIG of in GEEN_ROSTERAGENT').toEqual([]);
  });

  it('elke naam en namespace uit de terugvallijst voor core_agents komt thuis', () => {
    const namen = DEFAULT_AGENTS.flatMap((a) => [a.id, a.name, a.memory_namespace || '']).filter(Boolean);
    const kwijt = namen.filter((n) => !thuis(n));
    expect(kwijt, 'onbekende spelling: zet hem in ONREGELMATIG of in GEEN_ROSTERAGENT').toEqual([]);
  });

  /* De zes die op 1 okt 2026 gemeten null gaven waar hun rostertegenhanger dat
     niet deed. Expliciet, zodat de volgende sessie ziet wat hier kapot was. */
  it('de zes zaai-ids die null gaven, komen nu bij dezelfde agent als hun rosternaam', () => {
    expect(canoniekeAgent('task_agent')).toBe('task');
    expect(canoniekeAgent('memory_agent')).toBe('memory');
    expect(canoniekeAgent('cron_manager')).toBe('cron');
    expect(canoniekeAgent('finance_agent')).toBe('finance');
    expect(canoniekeAgent('thinktank_agent')).toBe('thinktank');
    expect(canoniekeAgent('app_agent_manager')).toBe('apps');
  });

  it('de drie spellingen van dezelfde agent zijn dezelfde agent', () => {
    // roster / zaailijst / terugvallijst / namespace
    expect(canoniekeAgent('developer')).toBe('developer');
    expect(canoniekeAgent('code_agent')).toBe('developer');
    expect(canoniekeAgent('axe-developer')).toBe('developer');
    expect(canoniekeAgent('axe_code')).toBe('developer');

    expect(canoniekeAgent('trading')).toBe('trading');
    expect(canoniekeAgent('axe_algo')).toBe('trading');
    expect(canoniekeAgent('trading-agent')).toBe('trading');
    expect(canoniekeAgent('axe_trader')).toBe('trading');

    expect(canoniekeAgent('axe')).toBe('axe');
    expect(canoniekeAgent('axe-core')).toBe('axe');
    expect(canoniekeAgent('global')).toBe('axe');
  });

  it('wat geen agent is, wordt er geen -- en zegt dat het een besluit is', () => {
    for (const naam of ['eve', 'infrastructure_agent', 'axe_ollama']) {
      expect(canoniekeAgent(naam), naam).toBeNull();
      expect(isGeenRosteragent(naam), naam).toBe(true);
    }
  });

  it('een naam die niemand kent is een gat, niet een besluit', () => {
    expect(canoniekeAgent('zomaar_iets')).toBeNull();
    expect(isGeenRosteragent('zomaar_iets')).toBe(false);
  });

  it('onzin blijft null -- geen gokje', () => {
    for (const naam of ['', '   ', 'zomaar_iets', 'agent', 'manager', 'axe_']) {
      expect(canoniekeAgent(naam), JSON.stringify(naam)).toBeNull();
    }
  });
});
