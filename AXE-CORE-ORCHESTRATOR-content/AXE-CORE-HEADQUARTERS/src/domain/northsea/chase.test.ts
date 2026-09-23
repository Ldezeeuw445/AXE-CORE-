import { describe, expect, it } from 'vitest';
import { chaseDoel, chaseItems, chaseTellers, isChaseConceptRuis, isDealCode, tijdGeleden, type NorthseaRij } from './chase';

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
    expect(chaseTellers(items)).toEqual({ alle: 2, kritiek: 1, nieuw: 1, akkoord: 0 });
  });

  it('platform- en OTP-concepten tellen niet als Chase', () => {
    expect(isChaseConceptRuis({ titel: 'Re: Welcome to Tradewheel — Verify your email', aan: 'no-reply@tradewheel.com' })).toBe(true);
    expect(isChaseConceptRuis({ titel: 'Re: WhatsApp-verificatiecode: 310-802', aan: 'noreply@support.whatsapp.com' })).toBe(true);
    expect(isChaseConceptRuis({ titel: 'Re: Nieuwe oproep', aan: 'noreply@ai-voicereceptionist.com' })).toBe(true);
    expect(isChaseConceptRuis({ titel: 'Copper cathode qualification', aan: 'sales@harcros.example' })).toBe(false);
    const items = chaseItems({
      ...leeg,
      concepten: [
        { id: 'junk', titel: 'Re: Welcome to Tradewheel — Verify your email', aan: 'no-reply@tradewheel.com', gevoelig: true },
        { id: 'real', titel: 'Re: 100 MT Copper Cathode Trial', aan: 'sales@harcros.example' },
      ],
    }, NU);
    expect(items.map(i => i.id)).toEqual(['concept:real']);
  });

  it('engine reply_needed en overdue wait staan bovenaan met de deal-id', () => {
    const items = chaseItems({
      ...leeg,
      kaart: [
        { id: 'opp-qinzhou', code: 'DEAL-002', product: 'Copper Cathode', koper: 'Preston', leverancier: 'Harcros',
          blokkade_code: 'reply_needed', huidige_blokkade: "The counterparty's latest email has not been answered.",
          beste_actie: "Prepare a reply addressing the counterparty's latest message.", actie_eigenaar: 'axe',
          updated_at: uurGeleden(5) },
        { id: 'opp-ramaax', product: 'Copper Cathode', koper: 'Arpad', leverancier: 'Ramaax',
          blokkade_code: 'awaiting_reply_overdue', huidige_blokkade: 'No reply for 77h after our last email.',
          beste_actie: 'Prepare a follow-up on the open qualification points (requires approval).',
          updated_at: uurGeleden(80) },
        { id: 'opp-noise', product: 'Copper Cathode', blokkade_code: 'seller_unqualified',
          huidige_blokkade: 'Seller legal entity, authority and live allocation are not evidenced.' },
      ],
      taken: [{ id: 't1', titel: 'Resolve current primary blocker', product: 'Copper Cathode', prioriteit: 70 }],
    }, NU);
    expect(items.find(i => i.dealId === 'opp-noise')).toBeUndefined();
    const reply = items.find(i => i.dealId === 'opp-qinzhou');
    const wait = items.find(i => i.dealId === 'opp-ramaax');
    expect(reply).toMatchObject({ kop: 'DEAL-002', kritiek: true, dealId: 'opp-qinzhou' });
    expect(wait).toMatchObject({ stand: 'Follow up required', toon: 'rood', kritiek: true, dealId: 'opp-ramaax' });
    expect(items.slice(0, 2).map(i => i.dealId)).toEqual(['opp-qinzhou', 'opp-ramaax']);
  });

  it('een bounce of concept opent Communications, een taak de Deal Room', () => {
    const items = chaseItems({
      ...leeg,
      bounces: [{ id: 'b1', created_at: uurGeleden(1), deal_id: 'opp-1' }],
      concepten: [{ id: 'c1', titel: 'Term sheet', deal_id: 'opp-2' }],
      taken: [{ id: 't1', titel: 'Chase buyer', code: 'DEAL-002', deal_id: 'opp-3' }],
    }, NU);
    const per = Object.fromEntries(items.map(i => [i.id, i]));
    expect(chaseDoel(per['bounce:b1'])).toEqual({ tab: 'communicatie', dealId: 'opp-1', filter: 'niet_bezorgd' });
    expect(chaseDoel(per['concept:c1'])).toEqual({ tab: 'communicatie', dealId: 'opp-2', filter: 'akkoord' });
    expect(chaseDoel(per['taak:t1'])).toEqual({ tab: 'deals', dealId: 'opp-3' });
  });
});

describe('tijdGeleden', () => {
  it('in de vorm van het ontwerp', () => {
    expect(tijdGeleden(uurGeleden(2), NU)).toBe('2h ago');
    expect(tijdGeleden(uurGeleden(30), NU)).toBe('1d ago');
    expect(tijdGeleden(new Date(NU - 5 * 60_000).toISOString(), NU)).toBe('5m ago');
  });
});
