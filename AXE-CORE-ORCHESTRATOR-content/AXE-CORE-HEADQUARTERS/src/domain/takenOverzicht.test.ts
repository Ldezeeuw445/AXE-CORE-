import { describe, it, expect } from 'vitest';
import { groepeerPlanner, plannerStatusNL, STATUS_NL, verdeelSecties, wieBezig, type OverzichtTaak } from './takenOverzicht';

const NU = new Date('2026-11-04T15:00:00').getTime();
const t = (id: string, status: OverzichtTaak['status'], extra: Partial<OverzichtTaak> = {}): OverzichtTaak =>
  ({ id, title: id, status, assignee: 'Code Agent', createdAt: NU - 1000, ...extra });

describe('verdeelSecties', () => {
  it('wacht = geblokkeerd, bezig = in-progress, klaar alleen als hij vandaag klaar ging', () => {
    const s = verdeelSecties([
      t('a', 'blocked'), t('b', 'in-progress'), t('c', 'done', { klaarOp: NU - 3600_000 }),
      t('d', 'done', { klaarOp: NU - 2 * 86400_000 }), t('e', 'done'), t('f', 'todo'),
    ], NU);
    expect(s.wacht.map((x) => x.id)).toEqual(['a']);
    expect(s.bezig.map((x) => x.id)).toEqual(['b']);
    expect(s.klaarVandaag.map((x) => x.id)).toEqual(['c']);
  });
  it('leeg blijft leeg (niets verzonnen)', () => {
    expect(verdeelSecties([], NU)).toEqual({ wacht: [], bezig: [], klaarVandaag: [] });
  });
});

describe('wieBezig', () => {
  it('telt per eigenaar', () => {
    expect(wieBezig([t('a', 'in-progress'), t('b', 'in-progress'), t('c', 'in-progress', { assignee: 'AXE Core' })]))
      .toBe('Code Agent (2), AXE Core');
  });
});

describe('groepeerPlanner', () => {
  const r = (id: string, title: string, app: string, created: string, extra: Record<string, unknown> = {}) =>
    ({ id, title, status: 'pending', created_at: created, metadata: { app }, ...extra });
  it('voegt dubbele regels per project samen met een teller en houdt de nieuwste', () => {
    const g = groepeerPlanner([
      r('1', 'Build next step: AXON Memory', 'axon', '2026-11-04T10:00:00Z'),
      r('2', 'Build next step:  AXON memory', 'axon', '2026-11-04T12:00:00Z'),
      r('3', 'Build next step: AXON Memory', 'axon', '2026-11-04T11:00:00Z'),
      r('4', 'Build next step: AXON Memory', 'companion', '2026-11-04T11:00:00Z'),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ aantal: 3, ids: ['1', '2', '3'] });
    expect(g[0].laatste.id).toBe('2');
  });
  it('een taak die op akkoord wacht blijft los', () => {
    const g = groepeerPlanner([
      r('1', 'Send mail', 'x', '2026-11-04T10:00:00Z', { metadata: { app: 'x', goedkeuring: 'nodig' } }),
      r('2', 'Send mail', 'x', '2026-11-04T10:00:00Z', { metadata: { app: 'x', goedkeuring: 'nodig' } }),
    ]);
    expect(g).toHaveLength(2);
  });
  it('andere status = andere regel', () => {
    const g = groepeerPlanner([
      r('1', 'A', 'x', '2026-11-04T10:00:00Z'), r('2', 'A', 'x', '2026-11-04T10:00:00Z', { status: 'running' }),
    ]);
    expect(g).toHaveLength(2);
  });
});

describe('Nederlands', () => {
  it('statussen in gewone woorden', () => {
    expect(Object.values(STATUS_NL)).toEqual(['Open', 'Bezig', 'Klaar', 'Wacht op jou']);
    expect(plannerStatusNL('completed')).toBe('Klaar');
    expect(plannerStatusNL('running')).toBe('Bezig');
    expect(plannerStatusNL('failed')).toBe('Mislukt');
    expect(plannerStatusNL('pending', true)).toBe('Wacht op jou');
    expect(plannerStatusNL('pending')).toBe('Gepland');
  });
});
