import { describe, it, expect } from 'vitest';
import { badgeOpdracht, BADGE_MAX } from '@/domain/appBadge';

describe('badgeOpdracht', () => {
  it('zet het aantal als er ongelezen meldingen zijn', () => {
    expect(badgeOpdracht(3, true)).toEqual({ soort: 'zet', aantal: 3 });
  });

  it('wist de badge bij nul -- anders blijft gisteren op je icoon staan', () => {
    expect(badgeOpdracht(0, true)).toEqual({ soort: 'wis' });
  });

  it('doet niets als de browser de Badging API niet kent', () => {
    expect(badgeOpdracht(5, false)).toEqual({ soort: 'niets' });
  });

  it('laat de badge met rust bij een onbekende telling', () => {
    // NaN is "ik weet het niet", en dat is iets anders dan nul.
    expect(badgeOpdracht(Number.NaN, true)).toEqual({ soort: 'niets' });
    expect(badgeOpdracht(Number.POSITIVE_INFINITY, true)).toEqual({ soort: 'niets' });
  });

  it('behandelt een negatieve telling als leeg in plaats van als fout', () => {
    expect(badgeOpdracht(-2, true)).toEqual({ soort: 'wis' });
  });

  it('topt af, zodat er nooit vier cijfers op het icoon staan', () => {
    expect(badgeOpdracht(5_000, true)).toEqual({ soort: 'zet', aantal: BADGE_MAX });
  });

  it('rondt een halve telling naar beneden af', () => {
    expect(badgeOpdracht(2.7, true)).toEqual({ soort: 'zet', aantal: 2 });
  });
});
