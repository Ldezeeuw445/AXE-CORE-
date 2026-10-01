/**
 * Tests voor de globale mic-sneltoets.
 *
 * Twee dingen worden hier vastgelegd:
 *  1. welke accelerator-teksten we accepteren, en hoe ze genormaliseerd worden;
 *  2. dat de sneltoets een SCHAKELAAR is — tweede druk stopt het gesprek.
 */
import { describe, expect, it } from 'vitest';

import {
  SNELTOETS_EVENT,
  STANDAARD_SNELTOETS,
  ontleedSneltoets,
  opentMicVanuitVenster,
  sneltoetsActie,
  type ToetsDruk,
} from './sneltoets';

describe('ontleedSneltoets — geldige invoer', () => {
  it('leest de standaard Option+Space', () => {
    expect(ontleedSneltoets(STANDAARD_SNELTOETS)).toEqual({
      modifiers: ['alt'],
      code: 'Space',
      accelerator: 'Alt+Space',
    });
  });

  it('accepteert Option als naam voor Alt, zoals de Mac hem noemt', () => {
    expect(ontleedSneltoets('Option+Space')?.accelerator).toBe('Alt+Space');
    expect(ontleedSneltoets('Opt+Space')?.accelerator).toBe('Alt+Space');
  });

  it('trekt zich niets aan van hoofdletters of spaties', () => {
    expect(ontleedSneltoets('  alt + space ')?.accelerator).toBe('Alt+Space');
    expect(ontleedSneltoets('ALT+SPACE')?.accelerator).toBe('Alt+Space');
  });

  it('zet modifiers altijd in dezelfde volgorde', () => {
    const a = ontleedSneltoets('Shift+Alt+M');
    const b = ontleedSneltoets('Alt+Shift+M');
    expect(a?.accelerator).toBe('Alt+Shift+KeyM');
    expect(b?.accelerator).toBe('Alt+Shift+KeyM');
    expect(a?.modifiers).toEqual(['alt', 'shift']);
  });

  it('vertaalt letters, cijfers en functietoetsen naar een Code', () => {
    expect(ontleedSneltoets('Cmd+m')?.code).toBe('KeyM');
    expect(ontleedSneltoets('Ctrl+7')?.code).toBe('Digit7');
    expect(ontleedSneltoets('Alt+F5')?.code).toBe('F5');
    expect(ontleedSneltoets('Alt+F24')?.code).toBe('F24');
  });

  it('kent Cmd, Command, Meta en Win als dezelfde modifier', () => {
    for (const naam of ['Cmd', 'Command', 'Meta', 'Win', 'Super']) {
      expect(ontleedSneltoets(`${naam}+Space`)?.modifiers).toEqual(['super']);
    }
  });

  it('leest een pijltoets en Escape via hun alias', () => {
    expect(ontleedSneltoets('Alt+Up')?.code).toBe('ArrowUp');
    expect(ontleedSneltoets('Alt+Esc')?.code).toBe('Escape');
  });
});

describe('ontleedSneltoets — ongeldige invoer', () => {
  it.each([
    ['lege tekst', ''],
    ['alleen spaties', '   '],
    ['kale toets zonder modifier', 'Space'],
    ['alleen modifiers', 'Control+Alt'],
    ['modifier zonder toets', 'Alt+'],
    ['lege tussenruimte', 'Alt++Space'],
    ['dezelfde modifier twee keer', 'Alt+Option+Space'],
    ['twee gewone toetsen', 'Alt+A+B'],
    ['onbekende modifier', 'Hyper+Space'],
    ['onbekende toets', 'Alt+Blub'],
    ['functietoets die niet bestaat', 'Alt+F0'],
    ['functietoets buiten bereik', 'Alt+F25'],
  ])('wijst %s af', (_naam, invoer) => {
    expect(ontleedSneltoets(invoer)).toBeNull();
  });

  it('wijst een kale spatiebalk af, want die zou hem systeembreed afpakken', () => {
    // Zonder modifier zou de sneltoets de spatiebalk uit ELKE app trekken.
    expect(ontleedSneltoets('Space')).toBeNull();
  });
});

describe('sneltoetsActie', () => {
  it('start een gesprek als er nog niets loopt', () => {
    expect(sneltoetsActie(false)).toBe('start');
  });

  it('stopt het gesprek als er al een loopt — de sneltoets is een schakelaar', () => {
    expect(sneltoetsActie(true)).toBe('stop');
  });
});

describe('contract met de Rust-kant', () => {
  it('de eventnaam staat vast, want lib.rs stuurt precies deze', () => {
    expect(SNELTOETS_EVENT).toBe('axe://sneltoets-mic');
  });

  it('de standaard is ontleedbaar', () => {
    expect(ontleedSneltoets(STANDAARD_SNELTOETS)).not.toBeNull();
  });
});

/* ── De vensterkant van de sneltoets (1 okt 2026) ────────────────────────────
   Toegevoegd omdat de mic in de web-app en de PWA alleen op Home te openen was,
   en zelfs dat niet: App.tsx riep useKeyboardShortcuts zonder handler aan, dus
   de tak die de kop van dat bestand beschrijft ("Spacebar on Home = toggle
   microphone") was dood. */
/* Gevonden 1 okt 2026 bij het schrijven van opentMicVanuitVenster: deze lezer
   kon zijn eigen uitvoer niet teruglezen. `accelerator` is wat we opslaan en wat
   Rust registreert, en voor een letter is dat 'Alt+KeyM' -- dat gaf null. Alleen
   de standaard (Alt+Space) round-tripte, en daarom viel het niet op. */
describe('ontleedSneltoets leest zijn eigen uitvoer terug', () => {
  for (const tekst of ['Alt+Space', 'Alt+M', 'Control+Shift+KeyM', 'Super+Digit1', 'Alt+F5', 'Control+Alt+Shift+Super+KeyZ']) {
    it(`round-trip: ${tekst}`, () => {
      const eerste = ontleedSneltoets(tekst);
      expect(eerste, tekst).not.toBeNull();
      const tweede = ontleedSneltoets(eerste!.accelerator);
      expect(tweede, `${tekst} -> ${eerste!.accelerator}`).toEqual(eerste);
    });
  }
});

describe('opentMicVanuitVenster', () => {
  const druk = (over: Partial<ToetsDruk> = {}): ToetsDruk => ({
    code: 'Space', alt: false, ctrl: false, shift: false, meta: false, inVeld: false, ...over,
  });

  it('⌥Space opent de mic op elke tab in de web-app', () => {
    expect(opentMicVanuitVenster(druk({ alt: true }), { opHome: false, inTauri: false })).toBe(true);
    expect(opentMicVanuitVenster(druk({ alt: true }), { opHome: true, inTauri: false })).toBe(true);
  });

  /* Het venster mag hem in Tauri NIET pakken: Rust registreert dezelfde
     aanslag globaal, en twee schakelaars op één druk betekent openen en meteen
     weer sluiten. */
  it('⌥Space laat het venster in Tauri met rust -- Rust vangt hem al af', () => {
    expect(opentMicVanuitVenster(druk({ alt: true }), { opHome: true, inTauri: true })).toBe(false);
    expect(opentMicVanuitVenster(druk({ alt: true }), { opHome: false, inTauri: true })).toBe(false);
  });

  it('een kale spatie werkt alleen op Home -- elders is dat de paginascroll', () => {
    expect(opentMicVanuitVenster(druk(), { opHome: true, inTauri: false })).toBe(true);
    expect(opentMicVanuitVenster(druk(), { opHome: false, inTauri: false })).toBe(false);
    // En op Home blijft hij ook in Tauri werken: Rust claimt alleen ⌥Space.
    expect(opentMicVanuitVenster(druk(), { opHome: true, inTauri: true })).toBe(true);
  });

  it('typen gaat voor: een spatie in een veld is een spatie', () => {
    expect(opentMicVanuitVenster(druk({ inVeld: true }), { opHome: true, inTauri: false })).toBe(false);
    expect(opentMicVanuitVenster(druk({ alt: true, inVeld: true }), { opHome: false, inTauri: false })).toBe(false);
  });

  it('een extra modifier is een andere sneltoets', () => {
    for (const extra of [{ ctrl: true }, { shift: true }, { meta: true }]) {
      expect(opentMicVanuitVenster(druk({ alt: true, ...extra }), { opHome: false, inTauri: false }), JSON.stringify(extra)).toBe(false);
    }
  });

  it('een andere toets doet niets', () => {
    expect(opentMicVanuitVenster(druk({ code: 'KeyM', alt: true }), { opHome: true, inTauri: false })).toBe(false);
    expect(opentMicVanuitVenster(druk({ code: 'Enter' }), { opHome: true, inTauri: false })).toBe(false);
  });

  it('volgt de ingestelde sneltoets, niet een tweede keer Alt+Space in code', () => {
    const opties = { opHome: false, inTauri: false, sneltoets: 'Control+Shift+KeyM' };
    expect(opentMicVanuitVenster(druk({ code: 'KeyM', ctrl: true, shift: true }), opties)).toBe(true);
    expect(opentMicVanuitVenster(druk({ alt: true }), opties)).toBe(false);
  });

  it('een onbruikbare instelling laat de kale spatie op Home staan', () => {
    // ontleedSneltoets wijst een kale toets af; dan is er geen modifier-vorm,
    // maar Home mag niet stilvallen.
    const opties = { opHome: true, inTauri: false, sneltoets: 'Space' };
    expect(opentMicVanuitVenster(druk(), opties)).toBe(true);
    expect(opentMicVanuitVenster(druk({ alt: true }), opties)).toBe(false);
  });
});
