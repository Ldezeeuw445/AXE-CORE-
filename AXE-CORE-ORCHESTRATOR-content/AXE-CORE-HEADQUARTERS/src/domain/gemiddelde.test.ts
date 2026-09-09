import { describe, it, expect } from 'vitest';
import { gemiddelde, toonGetal } from './gemiddelde';

describe('gemiddelde', () => {
  it('geeft null als er niets te meten valt', () => {
    // Dit was de bug: 0/0 = NaN, en op het scherm stond "NaNms".
    expect(gemiddelde([])).toBeNull();
  });

  it('rekent normaal met echte waarden', () => {
    expect(gemiddelde([10, 20, 30])).toBe(20);
  });

  it('rondt af, want milliseconden met decimalen zeggen niets extra', () => {
    expect(gemiddelde([10, 11])).toBe(11);
  });

  it('negeert waarden die geen getal zijn in plaats van te vergiftigen', () => {
    // Eén NaN ertussen maakte anders het hele gemiddelde NaN.
    expect(gemiddelde([10, NaN, 20])).toBe(15);
    expect(gemiddelde([Infinity])).toBeNull();
  });

  it('onderscheidt "niets gemeten" van "nul gemeten"', () => {
    expect(gemiddelde([0, 0])).toBe(0);
    expect(gemiddelde([])).toBeNull();
  });
});

describe('toonGetal', () => {
  it('toont een streepje als er niets is', () => {
    expect(toonGetal(null, 'ms')).toBe('—');
  });

  it('toont het getal met zijn eenheid', () => {
    expect(toonGetal(42, 'ms')).toBe('42ms');
  });

  it('toont een gemeten nul als nul, niet als streepje', () => {
    expect(toonGetal(0, 'ms')).toBe('0ms');
  });
});
