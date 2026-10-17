import { describe, expect, it } from 'vitest';
import {
  STILTE_MS, WAKE_SLEUTEL, isWakeZin, magLuisterenStarten, stilteVerlopen, wakeAanVan,
} from './luisterBeleid';

describe('luisterBeleid', () => {
  it('start nooit vanzelf, wel op mic-tik of sneltoets', () => {
    expect(magLuisterenStarten('auto')).toBe(false);
    expect(magLuisterenStarten('wake')).toBe(false);
    expect(magLuisterenStarten('wake', true)).toBe(true);
    expect(magLuisterenStarten('mic-tik')).toBe(true);
    expect(magLuisterenStarten('sneltoets')).toBe(true);
    expect(magLuisterenStarten('clap')).toBe(true);
  });

  it('wake is standaard uit, alleen een echte ja zet hem aan', () => {
    expect(wakeAanVan(undefined)).toBe(false);
    expect(wakeAanVan(null)).toBe(false);
    expect(wakeAanVan(false)).toBe(false);
    expect(wakeAanVan('false')).toBe(false);
    expect(wakeAanVan(true)).toBe(true);
    expect(WAKE_SLEUTEL).toBe('axe_wake_word_enabled');
  });

  it('herkent hey axe alleen als wake-zin, niet als gewone zin', () => {
    expect(isWakeZin('hey axe')).toBe(true);
    expect(isWakeZin('Hey AXE!')).toBe(true);
    expect(isWakeZin('hey axe, bitcoin')).toBe(true);
    expect(isWakeZin('wat is de bitcoin koers')).toBe(false);
  });

  it('korte VAD-stilte houdt de mic aan; lange stilte hangt op', () => {
    expect(stilteVerlopen(1_000, 900, STILTE_MS)).toBe(false);
    expect(stilteVerlopen(13_000, 1_000, STILTE_MS)).toBe(true);
    expect(stilteVerlopen(5_000, 0)).toBe(false);
  });
});
