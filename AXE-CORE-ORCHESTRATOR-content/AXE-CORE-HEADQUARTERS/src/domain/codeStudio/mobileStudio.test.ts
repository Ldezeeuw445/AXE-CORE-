import { describe, it, expect } from 'vitest';
import {
  MOBIEL_PANELEN, leesPaneel, TOETSEN, paarInvoeging, APP_SJABLONEN, FEATURE_IDEEEN,
} from './mobileStudio';

// Luka, 9 okt: de code-tab als een echte native mobiele editor, zoals Replit of Emergent.
describe('de code-studio op een telefoon', () => {
  it('heeft vijf panelen, in de volgorde van de onderbalk', () => {
    expect(MOBIEL_PANELEN.map(p => p.id)).toEqual(['agent', 'files', 'code', 'term', 'preview']);
  });

  it('opent op Code, tenzij er een geldige keuze is bewaard', () => {
    expect(leesPaneel(null)).toBe('code');
    expect(leesPaneel('rommel')).toBe('code');
    expect(leesPaneel('preview')).toBe('preview');
  });

  it('elke toets doet precies één ding: een tekst, een paar of een commando', () => {
    for (const t of TOETSEN) {
      const soorten = [t.tekst !== undefined, t.paar !== undefined, t.commando !== undefined].filter(Boolean).length;
      expect(soorten, t.label).toBe(1);
    }
    expect(new Set(TOETSEN.map(t => t.label)).size).toBe(TOETSEN.length);
  });

  it('een paar zet de cursor ertussen; met een selectie wikkelt het de selectie in', () => {
    expect(paarInvoeging(['(', ')'])).toEqual({ tekst: '()', terug: 1 });
    expect(paarInvoeging(['{', '}'], 'x')).toEqual({ tekst: '{x}', terug: 0 });
  });

  it('sjablonen en features hebben een uniek id en een opdracht die de agent kan uitvoeren', () => {
    const alle = [...APP_SJABLONEN, ...FEATURE_IDEEEN];
    expect(new Set(alle.map(b => b.id)).size).toBe(alle.length);
    for (const b of alle) {
      expect(b.opdracht.length, b.id).toBeGreaterThan(40);
      expect(b.titel.length).toBeGreaterThan(1);
    }
    // Wat Luka niet wil dat een bouwstap stilletjes doet: online zetten gebeurt pas na zijn akkoord.
    expect(FEATURE_IDEEEN.find(b => b.id === 'deploy')!.opdracht).toMatch(/do not deploy/i);
    expect(FEATURE_IDEEEN.find(b => b.id === 'payments')!.opdracht).toMatch(/test (mode|keys)/i);
  });
});
