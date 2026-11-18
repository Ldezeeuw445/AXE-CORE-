import { describe, expect, it } from 'vitest';
import { gelukt, klik, leegStand, mislukt, ververs, type InboxItem } from './optimistisch';

function item(id: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    bron: 'northsea',
    app: 'NorthSea',
    wie: 'NorthSea Manager',
    wat: `Mail ${id}`,
    waarom: 'Needs a look.',
    sinds: '2026-11-17T10:00:00Z',
    kanHierBeslissen: true,
    managerId: 'northseamgr',
    category: 'chase',
    ...extra,
  };
}

describe('optimistische inbox: een klik is meteen weg, een refresh zet hem niet terug', () => {
  it('approve haalt de rij meteen uit pending, nog vóór het netwerk', () => {
    const voor = leegStand([item('a'), item('b')]);
    const na = klik(voor, 'a', 'approve');
    expect(na.pending.map((i) => i.id)).toEqual(['b']);
    expect(na.inFlight.a).toBe('approve');
  });

  it('een tweede klik op dezelfde rij is een no-op, geen dubbele actie', () => {
    const een = klik(leegStand([item('a')]), 'a', 'approve');
    const twee = klik(een, 'a', 'approve');
    expect(twee).toBe(een);
  });

  it('ververs terwijl de klik onderweg is, brengt de rij niet terug', () => {
    const bezig = klik(leegStand([item('a'), item('b')]), 'a', 'approve');
    const na = ververs(bezig, { pending: [item('a'), item('b')], auto: [] });
    expect(na.pending.map((i) => i.id)).toEqual(['b']);
    expect(na.inFlight.a).toBe('approve');
  });

  it('gelukt: rij blijft weg, ook als de server hem nog even teruggeeft', () => {
    const klaar = gelukt(klik(leegStand([item('a')]), 'a', 'approve'), 'a');
    expect(klaar.inFlight.a).toBeUndefined();
    expect(ververs(klaar, { pending: [item('a')], auto: [] }).pending).toEqual([]);
  });

  it('mislukt: rij komt terug, klaar voor een nieuwe tik', () => {
    const a = item('a');
    const terug = mislukt(klik(leegStand([a, item('b')]), 'a', 'approve'), 'a', a);
    expect(terug.pending.map((i) => i.id)).toEqual(['a', 'b']);
    expect(terug.inFlight.a).toBeUndefined();
    const opnieuw = klik(terug, 'a', 'reject');
    expect(opnieuw.inFlight.a).toBe('reject');
  });

  it('bulk-approve zet alle gekozen rijen tegelijk weg', () => {
    const voor = leegStand([item('a'), item('b'), item('c')]);
    const na = ['a', 'c'].reduce((s, id) => klik(s, id, 'approve'), voor);
    expect(na.pending.map((i) => i.id)).toEqual(['b']);
  });
});
