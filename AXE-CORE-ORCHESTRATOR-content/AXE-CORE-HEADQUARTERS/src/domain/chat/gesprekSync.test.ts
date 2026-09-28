import { describe, it, expect } from 'vitest';
import { verwerkExterneRijen, type ExterneRij } from './gesprekSync';

const rij = (p: Partial<ExterneRij>): ExterneRij => ({
  conversationId: 'A', role: 'user', text: 'hoi', timestamp: 10_000, device: 'imac', ...p,
});

describe('één gesprek over alle apparaten', () => {
  it('een bericht van de iMac verschijnt op de Mac mini', () => {
    const uit = verwerkExterneRijen('A', [{ role: 'axe', text: 'eerder', timestamp: 1_000 }], [rij({})], 'mini');
    expect(uit).toEqual({ actie: 'toevoegen', berichten: [{ role: 'user', text: 'hoi', timestamp: 10_000 }] });
  });

  it('eigen berichten komen niet dubbel terug', () => {
    expect(verwerkExterneRijen('A', [], [rij({ device: 'mini' })], 'mini')).toEqual({ actie: 'niets' });
  });

  it('een oud bericht zonder apparaat dat er al staat, telt niet', () => {
    const gesprek = [{ role: 'user' as const, text: 'hoi', timestamp: 10_500 }];
    expect(verwerkExterneRijen('A', gesprek, [rij({ device: undefined })], 'mini')).toEqual({ actie: 'niets' });
  });

  it('ging Luka elders verder in een nieuwer gesprek, dan volgt dit apparaat', () => {
    const uit = verwerkExterneRijen('A', [{ role: 'user', text: 'x', timestamp: 5_000 }],
      [rij({ conversationId: 'B', timestamp: 9_000 }), rij({ conversationId: 'C', timestamp: 12_000 })], 'mini');
    expect(uit).toEqual({ actie: 'wissel', naar: 'C' });
  });

  it('een ouder gesprek elders trekt je niet weg', () => {
    const uit = verwerkExterneRijen('A', [{ role: 'user', text: 'x', timestamp: 50_000 }],
      [rij({ conversationId: 'B', timestamp: 9_000 })], 'mini');
    expect(uit).toEqual({ actie: 'niets' });
  });
});
