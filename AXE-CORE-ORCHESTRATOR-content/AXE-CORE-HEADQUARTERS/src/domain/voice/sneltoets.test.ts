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
  sneltoetsActie,
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
