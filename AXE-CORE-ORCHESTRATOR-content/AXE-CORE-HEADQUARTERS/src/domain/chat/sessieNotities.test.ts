import { describe, expect, it } from 'vitest';
import type { Beurt } from './hoofdgesprek';
import {
  SESSIE_STILTE_MS,
  isNoteerbaar,
  leesNotitie,
  notitiesBlok,
  sessieSleutel,
  simpeleNotitie,
  splitsSessies,
  startUitSleutel,
  teNoteren,
} from './sessieNotities';

const MIN = 60_000;
const T0 = Date.parse('2026-11-22T09:00:00Z');
const b = (role: Beurt['role'], text: string, m: number): Beurt => ({ role, text, timestamp: T0 + m * MIN });

const draad: Beurt[] = [
  b('user', 'Maak de notch mooier', 0),
  b('axe', 'Ik pas de kaarten aan', 1),
  b('user', 'En de halo groter', 10),
  b('axe', 'Gedaan', 11),
  // 2 uur stil
  b('user', 'Hoe staat de VPS?', 130),
  b('axe', 'Alles groen', 131),
];

describe('splitsSessies', () => {
  it('knipt op stiltes en sorteert', () => {
    const s = splitsSessies([...draad].reverse());
    expect(s).toHaveLength(2);
    expect(s[0].beurten).toHaveLength(4);
    expect(s[1].start).toBe(T0 + 130 * MIN);
  });

  it('negeert lege berichten', () => {
    expect(splitsSessies([b('user', '   ', 0)])).toEqual([]);
  });
});

describe('teNoteren', () => {
  it('alleen afgeronde, noteerbare sessies zonder notitie, nieuwste eerst', () => {
    const nu = T0 + 140 * MIN; // tweede sessie nog bezig
    const open = teNoteren(draad, new Set(), nu);
    expect(open).toHaveLength(1);
    expect(open[0].start).toBe(T0);

    const later = T0 + 131 * MIN + SESSIE_STILTE_MS;
    expect(teNoteren(draad, new Set(), later).map((s) => s.start)).toEqual([T0 + 130 * MIN, T0]);
    const bekend = new Set([sessieSleutel({ start: T0 })]);
    expect(teNoteren(draad, bekend, later)).toHaveLength(1);
  });

  it('een sessie zonder antwoord van AXE is niet noteerbaar', () => {
    expect(isNoteerbaar(splitsSessies([b('user', 'hallo', 0)])[0])).toBe(false);
  });
});

describe('sessieSleutel', () => {
  it('is stabiel per minuut en terug te lezen', () => {
    const k = sessieSleutel({ start: T0 + 25_000 });
    expect(k).toBe('sessie:2026-11-22T09:00');
    expect(startUitSleutel(k)).toBe(T0);
    expect(startUitSleutel('iets:anders')).toBeNull();
  });
});

describe('leesNotitie', () => {
  it('haalt de drie regels eruit, ook met opmaak', () => {
    const t = leesNotitie('Hier is de notitie:\n- **Gevraagd:** notch mooier\n- Veranderd: kaarten zonder rand\n- Gestopt bij: halo testen');
    expect(t).toBe('Gevraagd: notch mooier\nVeranderd: kaarten zonder rand\nGestopt bij: halo testen');
  });

  it('null als het geen notitie is', () => {
    expect(leesNotitie('Sorry, dat kan ik niet.')).toBeNull();
  });

  it('vult een ontbrekende Veranderd-regel aan', () => {
    expect(leesNotitie('Gevraagd: x\nGestopt bij: y')).toBe('Gevraagd: x\nVeranderd: niets\nGestopt bij: y');
  });
});

describe('simpeleNotitie', () => {
  it('eerste en laatste vraag', () => {
    const t = simpeleNotitie(splitsSessies(draad)[0]);
    expect(t).toContain('Gevraagd: Maak de notch mooier');
    expect(t).toContain('Gestopt bij: En de halo groter');
  });
});

describe('notitiesBlok', () => {
  it('leeg zonder notities', () => {
    expect(notitiesBlok([], T0)).toBe('');
  });

  it('de laatste zes, oud naar nieuw', () => {
    const notities = Array.from({ length: 8 }, (_, i) => ({
      key: `sessie:${i}`,
      start: T0 - (8 - i) * 60 * MIN,
      tekst: `Gevraagd: ding ${i}`,
    }));
    const blok = notitiesBlok(notities, T0);
    expect(blok).toContain('laatste 6 sessies');
    expect(blok).not.toContain('ding 1\n');
    expect(blok.indexOf('ding 2')).toBeLessThan(blok.indexOf('ding 7'));
  });
});
