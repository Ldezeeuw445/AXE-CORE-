import { describe, expect, it } from 'vitest';
import { leesAntwoord, metAntwoord, scheidingTekst, scheidingVoor, wisselReactie } from './managerChatGrok';

describe('reacties', () => {
  it('één emoji per bubbel; nog eens = weg', () => {
    let r = wisselReactie({}, 'a', '❤️');
    expect(r).toEqual({ a: '❤️' });
    r = wisselReactie(r, 'a', '👍');
    expect(r).toEqual({ a: '👍' });
    expect(wisselReactie(r, 'a', '👍')).toEqual({});
  });
});

describe('antwoorden', () => {
  it('citaat voorop en weer terug te lezen', () => {
    const t = metAntwoord('Ja doe maar', { id: 'x', wie: 'Trading OS Manager', tekst: 'Mag ik **#191** mergen?' });
    expect(t.startsWith('> Trading OS Manager: "Mag ik #191 mergen?"')).toBe(true);
    const terug = leesAntwoord(t);
    expect(terug.citaat).toContain('#191 mergen');
    expect(terug.rest).toBe('Ja doe maar');
    expect(leesAntwoord('gewoon').citaat).toBeNull();
    expect(metAntwoord('x', null)).toBe('x');
  });
});

describe('tijdscheiding', () => {
  const nu = Date.parse('2026-11-22T21:00:00Z');
  it('na een half uur stilte, en bij het eerste bericht', () => {
    expect(scheidingVoor(nu, undefined)).toBe(true);
    expect(scheidingVoor(nu, nu - 10 * 60_000)).toBe(false);
    expect(scheidingVoor(nu, nu - 31 * 60_000)).toBe(true);
  });
  it('vandaag alleen tijd, gisteren, anders dag + datum', () => {
    expect(scheidingTekst(nu, nu)).toBe('22:00');
    expect(scheidingTekst(nu - 86_400_000, nu)).toBe('Gisteren 22:00');
    expect(scheidingTekst(Date.parse('2026-11-18T13:18:00Z'), nu)).toMatch(/18 nov 14:18$/);
  });
});
