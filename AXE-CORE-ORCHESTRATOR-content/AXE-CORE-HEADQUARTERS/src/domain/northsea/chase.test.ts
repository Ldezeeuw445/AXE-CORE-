import { describe, expect, it } from 'vitest';
import { chaseItems, chaseTellers, isDealCode, tijdGeleden, type NorthseaRij } from './chase';

const NU = Date.parse('2026-09-14T12:00:00Z');
const leeg = { acties: [] as NorthseaRij[], taken: [] as NorthseaRij[], concepten: [] as NorthseaRij[], bounces: [] as NorthseaRij[] };
const uurGeleden = (u: number) => new Date(NU - u * 3_600_000).toISOString();

describe('isDealCode', () => {
  it('herkent codes en geen prioriteiten die in hetzelfde veld staan', () => {
    for (const c of ['DEAL-001', 'DEAL-001-FALLBACK-A', 'EU-500-TRIAL-SUPPLIER-C']) expect(isDealCode(c)).toBe(true);
    for (const c of ['high', 'medium', 'secondary', '', null]) expect(isDealCode(c)).toBe(false);
  });
});

describe('chaseItems', () => {
  it('een bounce is kritiek en vraagt een ander contact', () => {
    const [i] = chaseItems({ ...leeg, bounces: [{ id: 'b1', created_at: uurGeleden(30), aan: ['info@thairiceandfood.com'] }] }, NU);
    expect(i).toMatchObject({ kop: 'Email Failure', regel: 'info@thairiceandfood.com bounced', stand: 'Find alternative contact', toon: 'rood', kritiek: true, nieuw: false });
  });

  it('een generieke taaktitel wordt de blokkade of de partijen, met de dealcode als kop', () => {
    const [a, b] = chaseItems({ ...leeg, taken: [
      { id: 't1', titel: 'Resolve current primary blocker', code: 'DEAL-002', blokkade: 'Awaiting Harcros response', prioriteit: 80, created_at: uurGeleden(2) },
      { id: 't2', titel: 'Resolve current primary blocker', code: 'high', koper: 'Arpad G.', leverancier: 'A42C Ltd', product: 'Copper Cathodes', prioriteit: 70, volgende: 'Await supplier reply', created_at: uurGeleden(50) },
    ] }, NU);
    expect(a).toMatchObject({ kop: 'DEAL-002', regel: 'Awaiting Harcros response', toon: 'groen', nieuw: true });
    expect(b).toMatchObject({ kop: 'Copper Cathodes', regel: 'Arpad G. ↔ A42C Ltd', stand: 'Await supplier reply' });
  });

  it('volgorde van de regels: verlopen > akkoord > wachten, en prioriteit 90+ is kritiek', () => {
    const items = chaseItems({ ...leeg, acties: [
      { id: 'w', titel: 'Review reply', status: 'waiting', prioriteit: 50 },
      { id: 'a', titel: 'Sign off', akkoord_nodig: true, prioriteit: 60 },
      { id: 'v', titel: 'Chase buyer', due_at: uurGeleden(1), akkoord_nodig: true, prioriteit: 40 },
      { id: 'p', titel: 'Qualify', prioriteit: 95 },
    ] }, NU);
    const per = Object.fromEntries(items.map(i => [i.id, i]));
    expect(per['actie:v']).toMatchObject({ stand: 'Follow up required', toon: 'rood', kritiek: true });
    expect(per['actie:a']).toMatchObject({ stand: 'Approval required', toon: 'amber', kritiek: false });
    expect(per['actie:w']).toMatchObject({ stand: 'Waiting for reply', toon: 'amber' });
    expect(per['actie:p'].kritiek).toBe(true);
    expect(items.slice(0, 2).map(i => i.kritiek)).toEqual([true, true]);
  });

  it('een concept is klaar, en een gevoelig concept vraagt aandacht', () => {
    const items = chaseItems({ ...leeg, concepten: [{ id: 'c1', titel: 'Term sheet' }, { id: 'c2', titel: 'Banking', gevoelig: true }] }, NU);
    expect(items.find(i => i.id === 'concept:c1')).toMatchObject({ stand: 'Draft ready', toon: 'groen' });
    expect(items.find(i => i.id === 'concept:c2')).toMatchObject({ stand: 'Draft ready · sensitive', toon: 'amber' });
  });

  it('telt alle, kritiek en nieuw', () => {
    const items = chaseItems({ ...leeg, bounces: [{ id: 'b', created_at: uurGeleden(1) }], acties: [{ id: 'x', created_at: uurGeleden(40) }] }, NU);
    expect(chaseTellers(items)).toEqual({ alle: 2, kritiek: 1, nieuw: 1 });
  });
});

describe('tijdGeleden', () => {
  it('in de vorm van het ontwerp', () => {
    expect(tijdGeleden(uurGeleden(2), NU)).toBe('2h ago');
    expect(tijdGeleden(uurGeleden(30), NU)).toBe('1d ago');
    expect(tijdGeleden(new Date(NU - 5 * 60_000).toISOString(), NU)).toBe('5m ago');
  });
});
