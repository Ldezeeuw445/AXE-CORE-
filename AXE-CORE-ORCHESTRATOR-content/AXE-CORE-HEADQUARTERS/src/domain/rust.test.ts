import { describe, expect, it } from 'vitest';
import { focusKlaarTekst, restTekst, rustOpdracht } from './rust';

describe('Life OS: focus en geluid', () => {
  it('herkent focus aan, met en zonder tijd', () => {
    expect(rustOpdracht('focus')).toEqual({ soort: 'focus-aan', minuten: 25 });
    expect(rustOpdracht('focusmodus aan')).toEqual({ soort: 'focus-aan', minuten: 25 });
    expect(rustOpdracht('focus 50 min')).toEqual({ soort: 'focus-aan', minuten: 50 });
    expect(rustOpdracht('AXE, focus voor 2 uur')).toEqual({ soort: 'focus-aan', minuten: 120 });
    expect(rustOpdracht('niet storen')).toEqual({ soort: 'focus-aan', minuten: 25 });
    expect(rustOpdracht('focus 999 min')).toEqual({ soort: 'focus-aan', minuten: 240 });
  });

  it('herkent uit, stand, muziek en pin', () => {
    expect(rustOpdracht('focus uit')).toEqual({ soort: 'focus-uit' });
    expect(rustOpdracht('stop focus')).toEqual({ soort: 'focus-uit' });
    expect(rustOpdracht('hoe lang nog?')).toEqual({ soort: 'focus-stand' });
    expect(rustOpdracht('speel rustige muziek')).toEqual({ soort: 'muziek-aan' });
    expect(rustOpdracht('rustige muziek')).toEqual({ soort: 'muziek-aan' });
    expect(rustOpdracht('muziek uit')).toEqual({ soort: 'muziek-uit' });
    expect(rustOpdracht('zet mijn geld achter een pin')).toEqual({ soort: 'pin-uitleg' });
  });

  it('laat gewone zinnen met die woorden met rust', () => {
    expect(rustOpdracht('ik kan me niet focussen op die deal')).toBeNull();
    expect(rustOpdracht('focus op NorthSea deze week')).toBeNull();
    expect(rustOpdracht('welke muziek luister jij')).toBeNull();
  });

  it('tijd en eindbericht', () => {
    expect(restTekst(1_000 + 18 * 60_000, 1_000)).toBe('18 min');
    expect(restTekst(65 * 60_000, 0)).toBe('1 u 05 min');
    expect(restTekst(30_000, 0)).toBe('minder dan een minuut');
    expect(focusKlaarTekst(25, 0, 0)).toContain('niets binnen');
    expect(focusKlaarTekst(25, 3, 1)).toContain('3 meldingen en 1 bericht van een taak');
  });
});
