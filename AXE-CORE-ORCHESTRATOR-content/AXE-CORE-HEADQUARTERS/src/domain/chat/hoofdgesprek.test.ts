import { describe, it, expect } from 'vitest';
import {
  AXE_HOOFDGESPREK_ID, begroeting, betekenisvol, isHoofdgesprek, magBegroeten, terugkomstBlok,
} from './hoofdgesprek';
import { verwerkExterneRijen } from './gesprekSync';

const NU = new Date(2026, 9, 7, 9, 30).getTime();
const UUR = 60 * 60_000;

describe('het eeuwige AXE-gesprek', () => {
  it('heeft één vaste id, die door de UUID-controle komt', () => {
    expect(AXE_HOOFDGESPREK_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(isHoofdgesprek(AXE_HOOFDGESPREK_ID)).toBe(true);
    expect(isHoofdgesprek('ander')).toBe(false);
  });

  it('opnieuw openen is geen nieuw begin: geen tweede begroeting op dezelfde dag', () => {
    const gesprek = [{ role: 'axe' as const, text: 'Goedemorgen, Luka. Developer is klaar.', timestamp: NU - 5 * UUR }];
    expect(magBegroeten(gesprek, NU)).toBe(false);
  });

  it('geen begroeting midden in een lopend gesprek', () => {
    const gesprek = [{ role: 'user' as const, text: 'hoe gaat het?', timestamp: NU - 20 * 60_000 }];
    expect(magBegroeten(gesprek, NU)).toBe(false);
  });

  it('wel na een nacht stilte', () => {
    const gisteren = [{ role: 'axe' as const, text: 'Goedenavond, Luka.', timestamp: NU - 14 * UUR }];
    expect(magBegroeten(gisteren, NU)).toBe(true);
  });

  it('zonder nieuws en zonder briefje zegt AXE niets (geen "AXE is online")', () => {
    expect(begroeting(9, null, null)).toBeNull();
    expect(begroeting(9, '', { summary: 'Nothing significant happened since you were last here.', counts: {} })).toBeNull();
  });

  it('echte gebeurtenissen gaan voor in de begroeting', () => {
    const sinds = { summary: 'Milestones completed: developer 2. 1 approval(s) waiting for you.', counts: { milestones_completed: 2, approvals_waiting: 1 } };
    expect(betekenisvol(sinds)).toBe(true);
    expect(begroeting(9, 'Drie taken vandaag.', sinds)).toBe(
      'Goedemorgen, Luka. Milestones completed: developer 2. 1 approval(s) waiting for you. Drie taken vandaag.');
    expect(terugkomstBlok(sinds)).toContain('real agent events');
    expect(terugkomstBlok({ summary: 'x', counts: {} })).toBe('');
  });

  it('in het hoofdgesprek hoort alles erbij en springt niets weg', () => {
    const uit = verwerkExterneRijen(AXE_HOOFDGESPREK_ID, [], [
      { conversationId: 'oud-gesprek', role: 'user', text: 'vanaf de oude app', timestamp: 5, device: 'ipad' },
    ], 'mini');
    expect(uit).toEqual({ actie: 'toevoegen', berichten: [{ role: 'user', text: 'vanaf de oude app', timestamp: 5 }] });
  });
});
