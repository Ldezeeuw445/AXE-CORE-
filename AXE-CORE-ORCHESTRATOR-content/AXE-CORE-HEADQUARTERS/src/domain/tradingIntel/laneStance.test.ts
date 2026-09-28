import { describe, it, expect } from 'vitest';
import {
  deskEpisodeSubject, laneVerdict, marketDirectionFromTrade, parseDeskEpisodeSubject, parseLaneStance,
} from './laneStance';

describe('parseLaneStance — alleen de expliciete regel telt', () => {
  it('leest STANCE-regels, ook met synoniemen', () => {
    expect(parseLaneStance('flow is heavy\nHANDOFF: watch 2380\nSTANCE: LONG')).toBe('long');
    expect(parseLaneStance('STANCE: bearish into CPI')).toBe('short');
    expect(parseLaneStance('stance: neutral')).toBe('neutral');
  });
  it('raadt niet uit vrije tekst', () => {
    expect(parseLaneStance('I am very bullish on gold. HANDOFF: buy the dip')).toBeNull();
    expect(parseLaneStance('STANCE: maybe')).toBeNull();
  });
});

describe('laneVerdict — tegen de markt, niet tegen de trade', () => {
  it('leidt de marktrichting af uit kant en uitkomst', () => {
    expect(marketDirectionFromTrade('buy', 120)).toBe('up');
    expect(marketDirectionFromTrade('buy', -80)).toBe('down');
    expect(marketDirectionFromTrade('sell', 50)).toBe('down');
    expect(marketDirectionFromTrade('sell', -50)).toBe('up');
    expect(marketDirectionFromTrade('buy', 0)).toBeNull();
  });
  it('een lane die SHORT zei terwijl AXE long ging en verloor, had gelijk', () => {
    expect(laneVerdict('short', marketDirectionFromTrade('buy', -80))).toBe('good');
    expect(laneVerdict('long', marketDirectionFromTrade('buy', -80))).toBe('poor');
  });
  it('neutraal of breakeven wordt niet gescoord', () => {
    expect(laneVerdict('neutral', 'up')).toBeNull();
    expect(laneVerdict('long', null)).toBeNull();
  });
  it('onderwerp heen en terug', () => {
    expect(parseDeskEpisodeSubject(deskEpisodeSubject(' xauusd ', 'short'))).toEqual({ symbol: 'XAUUSD', stance: 'short' });
    expect(parseDeskEpisodeSubject('XAUUSD')).toBeNull();
  });
});
