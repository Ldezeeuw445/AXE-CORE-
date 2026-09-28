import { describe, it, expect } from 'vitest';
import { klaarSpraakStukken, nieuweSpraakStukken } from './speechChunks';

describe('klaarSpraakStukken — eerste zin mag spelen terwijl de rest nog komt', () => {
  it('houdt een open zin terug tot hij af is', () => {
    expect(klaarSpraakStukken('Morning, Luka. Companion is', false)).toEqual(['Morning, Luka.']);
    expect(klaarSpraakStukken('Morning, Luka. Companion is live.', false)).toEqual([
      'Morning, Luka.',
      'Companion is live.',
    ]);
  });

  it('geeft bij sluiten ook de rest zonder punt', () => {
    expect(klaarSpraakStukken('Morning, Luka. Companion is live', true)).toEqual([
      'Morning, Luka.',
      'Companion is live',
    ]);
  });

  it('nieuweSpraakStukken levert alleen wat nog niet gezegd is', () => {
    const eerste = nieuweSpraakStukken(0, 'Morning, Luka. Companion is', false);
    expect(eerste.stukken).toEqual(['Morning, Luka.']);
    const tweede = nieuweSpraakStukken(eerste.tot, 'Morning, Luka. Companion is live.', false);
    expect(tweede.stukken).toEqual(['Companion is live.']);
  });
});
