import { describe, expect, it } from 'vitest';
import { eerstvolgende, groetVoor, homeStand, nieuwePeeks, PEEK_RIJ_MAX, zetInRij, type NotchMoment } from './notchPeeks';

const leeg: NotchMoment = { goedkeuringen: [], claude: null, taken: [] };
const claude = (toestand: 'bezig' | 'wacht' | 'klaar', extra: Partial<NonNullable<NotchMoment['claude']>> = {}) =>
  ({ sessieId: 's', toestand, project: 'AXE', vraag: 'bouw peeks', nu: 'Edit Notch.tsx', toestemming: false, ...extra });

describe('peeks in de notch (18 nov)', () => {
  it('eerste meting geeft niets: bij opstarten is niet alles nieuws', () => {
    expect(nieuwePeeks(null, { ...leeg, goedkeuringen: [{ id: 'a', titel: 'x' }] })).toEqual([]);
  });

  it('nieuwe goedkeuring → één peek naar de goedkeuringen; meer tegelijk → één samengevatte', () => {
    const een = nieuwePeeks(leeg, { ...leeg, goedkeuringen: [{ id: 'a', titel: 'Mail aan Shell' }] });
    expect(een).toEqual([{ id: 'g-a', soort: 'goedkeuring', titel: 'Wacht op jou', tekst: 'Mail aan Shell', tab: 'approvals' }]);
    const twee = nieuwePeeks(leeg, { ...leeg, goedkeuringen: [{ id: 'a', titel: 'x' }, { id: 'b', titel: 'y' }] });
    expect(twee).toHaveLength(1);
    expect(twee[0].tekst).toBe('2 nieuwe goedkeuringen');
  });

  it('Claude van bezig naar klaar → peek; toestemmingsvraag niet (die opent de notch al)', () => {
    expect(nieuwePeeks({ ...leeg, claude: claude('bezig') }, { ...leeg, claude: claude('klaar') })[0])
      .toMatchObject({ soort: 'claude-klaar', titel: 'Claude klaar · AXE', tekst: 'bouw peeks', tab: 'claude' });
    expect(nieuwePeeks({ ...leeg, claude: claude('bezig') }, { ...leeg, claude: claude('wacht', { toestemming: true }) })).toEqual([]);
    expect(nieuwePeeks({ ...leeg, claude: claude('bezig') }, { ...leeg, claude: claude('wacht', { nu: 'Kies een optie' }) })[0].titel)
      .toBe('Claude wacht op jou');
  });

  it('een andere Claude-sessie is geen overgang', () => {
    expect(nieuwePeeks({ ...leeg, claude: claude('bezig') }, { ...leeg, claude: claude('klaar', { sessieId: 't' }) })).toEqual([]);
  });

  it('een taak die uit de bezig-lijst verdwijnt is afgerond; van status wisselen niet', () => {
    const p = nieuwePeeks({ ...leeg, taken: ['Offerte Shell · running', 'Mail · queued'] }, { ...leeg, taken: ['Mail · running'] });
    expect(p).toEqual([{ id: 't-Offerte Shell', soort: 'taak-klaar', titel: 'Afgerond', tekst: 'Offerte Shell', tab: 'home' }]);
  });

  it('de rij dubbelt niet en wordt nooit lang', () => {
    const p = (id: string) => ({ id, soort: 'taak-klaar' as const, titel: 'Afgerond', tekst: id, tab: 'home' as const });
    expect(zetInRij([p('a')], [p('a'), p('b')]).map((x) => x.id)).toEqual(['a', 'b']);
    expect(zetInRij([], ['a', 'b', 'c', 'd', 'e'].map(p))).toHaveLength(PEEK_RIJ_MAX);
  });
});

describe('Home in de notch', () => {
  it('groet per dagdeel', () => {
    expect([3, 9, 14, 21].map(groetVoor)).toEqual(['Goedenacht', 'Goedemorgen', 'Goedemiddag', 'Goedenavond']);
  });

  it('rustig als er niets is, met de juiste plek als er wel iets is', () => {
    const nu = new Date(2026, 10, 18, 23, 5);
    const rust = homeStand(nu, leeg, null);
    expect(rust.datum).toBe('woensdag 18 november · 23:05');
    expect(rust.regels.every((r) => r.rustig)).toBe(true);
    const druk = homeStand(nu, { goedkeuringen: [{ id: 'a', titel: 'Mail aan Shell' }], claude: claude('bezig'), taken: ['Offerte · running'] },
      { naam: 'Call Rotterdam', at: new Date(2026, 10, 19, 9, 30).toISOString() });
    expect(druk.regels.map((r) => r.sleutel)).toEqual(['wacht', 'claude', 'taken', 'volgende']);
    expect(druk.regels[0]).toMatchObject({ tekst: 'Mail aan Shell', rustig: false, tab: 'approvals' });
    expect(druk.regels[2].tekst).toBe('1 bezig · Offerte');
    expect(druk.regels[3].tekst).toBe('morgen 09:30 · Call Rotterdam');
  });

  it('zonder verbinding zegt Home niet dat alles loopt', () => {
    expect(homeStand(new Date(), leeg, null, false).regels[0].tekst).toBe('Onbekend — geen verbinding met AXE');
  });

  it('eerstvolgende slaat het verleden over', () => {
    const nu = new Date('2026-11-18T22:00:00Z');
    expect(eerstvolgende([
      { naam: 'oud', at: '2026-11-18T21:00:00Z' },
      { naam: 'later', at: '2026-11-19T08:00:00Z' },
      { naam: 'eerst', at: '2026-11-18T23:00:00Z' },
    ], nu)?.naam).toBe('eerst');
  });
});
