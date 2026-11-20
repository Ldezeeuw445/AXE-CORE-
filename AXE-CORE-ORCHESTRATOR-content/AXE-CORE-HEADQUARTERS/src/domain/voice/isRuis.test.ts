import { describe, expect, it } from 'vitest';
import { isRuis } from './isRuis';

describe('isRuis', () => {
  it('wat op 20 nov in de chat kwam is ruis', () => {
    for (const t of ['umuyoruz.', 'Zadnji.', 'Mhm.', 'Hmm', 'uh', '', '...']) expect(isRuis(t), t).toBe(true);
  });
  it('korte echte antwoorden en AXE-woorden blijven', () => {
    for (const t of ['Ja.', 'Nee', 'oké', 'Stop!', 'Trading.', 'agenda', 'Dank je.', '12']) expect(isRuis(t), t).toBe(false);
  });
  it('een zin gaat altijd door', () => {
    expect(isRuis('open de agenda')).toBe(false);
    expect(isRuis('Zadnji put')).toBe(false);
  });
});
