import { describe, it, expect } from 'vitest';
import { nieuweMeldingen } from './plannerKoppeling';
import type { PlannerTaak } from '@/infrastructure/gateways/axeCoreApiService';

const taak = (id: string, status: string, meta: PlannerTaak['metadata']): PlannerTaak => ({
  id, title: `taak ${id}`, goal: null, description: null, status, priority: 'medium',
  assignee: meta?.agent ?? null, metadata: meta, result: null, error: null, created_at: '', completed_at: null,
});

describe('wat de bol over de planner meldt', () => {
  it('meldt gepland, wacht op akkoord en klaar — elk één keer', () => {
    const taken = [
      taak('a', 'pending', { agent: 'code-agent', goedkeuring: 'nodig' }),
      taak('b', 'completed', { agent: 'axe-core', goedkeuring: 'niet_nodig' }),
      taak('c', 'pending', { agent: 'axe-algo', goedkeuring: 'niet_nodig' }),
    ];
    const eerst = nieuweMeldingen(taken, {});
    expect(eerst.map(m => m.label)).toEqual([
      'Code Agent vraagt akkoord: taak a', 'AXE Core deed: taak b', 'AXE Algo plant: taak c',
    ]);
    const gezien = Object.fromEntries(eerst.map(m => [m.id, m.stand]));
    expect(nieuweMeldingen(taken, gezien)).toEqual([]);
  });

  it('meldt opnieuw als een taak van stand verandert, en zwijgt over mislukt of afgewezen', () => {
    const gezien = { a: 'gepland' };
    expect(nieuweMeldingen([taak('a', 'completed', { agent: 'axe-core' })], gezien)[0].stand).toBe('klaar');
    expect(nieuweMeldingen([taak('x', 'failed', { agent: 'axe-core' }), taak('y', 'cancelled', { agent: 'axe-core' })], {})).toEqual([]);
  });
});
