import { describe, expect, it } from 'vitest';
import { claudeLive, klok, leesStand, type ClaudeStand } from './claudeLive';

const stand = (extra: Partial<ClaudeStand> = {}): ClaudeStand => ({
  sessies: {
    a: { id: 'a', project: 'AXE', vraag: 'fix de notch', begon: 100, bijgewerkt: 160, klaar: false,
      stappen: [
        { tool: 'Read', soort: 'lezen', wat: 'Read Notch.tsx', staat: 'klaar', t: 110 },
        { tool: 'Edit', soort: 'bewerken', wat: 'Edit Notch.tsx', staat: 'bezig', t: 150 },
      ] },
    b: { id: 'b', project: 'NorthSea', vraag: 'oud', begon: 10, bijgewerkt: 20, klaar: false, stappen: [] },
  },
  ...extra,
});

describe('Claude live in de notch (18 nov)', () => {
  it('volgt de laatste sessie en zegt wat hij nu doet', () => {
    const l = claudeLive(stand(), 165);
    expect(l).toMatchObject({ sessieId: 'a', nu: 'Edit Notch.tsx', vorige: 'Read Notch.tsx', soort: 'bewerken', toestand: 'bezig', seconden: 65 });
    expect(klok(65)).toBe('1:05');
  });
  it('een sessie die op Luka wacht gaat voor', () => {
    const s = stand();
    s.sessies!.b = { ...s.sessies!.b, bijgewerkt: 164, wacht: true, melding: 'Mag ik git push doen?' };
    expect(claudeLive(s, 165)).toMatchObject({ sessieId: 'b', toestand: 'wacht', nu: 'Mag ik git push doen?' });
  });
  it('klaar blijft even staan en verdwijnt dan', () => {
    const s = stand();
    s.sessies!.a = { ...s.sessies!.a, klaar: true, eind: 170 };
    delete s.sessies!.b;
    expect(claudeLive(s, 172)?.nu).toBe('Klaar');
    expect(claudeLive(s, 200)).toBeNull();
  });
  it('kapotte of lege stand = niets', () => {
    expect(claudeLive(leesStand('geen json'), 1)).toBeNull();
    expect(claudeLive(leesStand(null), 1)).toBeNull();
  });
});
