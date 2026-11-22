import { describe, expect, it } from 'vitest';
import { rijActie, rijAntwoord } from './rijOpdracht';

describe('rijActie', () => {
  it.each([
    ['doe de rij', 'begin'],
    ['Doe de rij!', 'begin'],
    ['AXE, werk de rij af', 'begin'],
    ['begin met de rij', 'begin'],
    ['do the queue', 'begin'],
    ['stop de rij', 'stop'],
    ['stop met de rij', 'stop'],
    ['hoe staat de rij?', 'stand'],
    ['hoe gaat het met de rij', 'stand'],
  ])('%s -> %s', (tekst, actie) => {
    expect(rijActie(tekst)).toBe(actie);
  });

  it.each(['de rij bij de bakker was lang', 'doe de rij maar niet de NorthSea-stappen en ook morgen pas', 'wat is een rij', ''])(
    'geen opdracht: %s',
    (tekst) => {
      expect(rijActie(tekst)).toBeNull();
    },
  );
});

describe('rijAntwoord', () => {
  it('begin met werk', () => {
    const t = rijAntwoord('begin', { toegevoegd: 3, stand: 'gestart', taak: 'PWA-scope', open: 2 });
    expect(t).toContain('3 stappen');
    expect(t).toContain('Nu: PWA-scope');
    expect(t).toContain('Daarna nog 2 stappen');
  });

  it('begin zonder werk zegt wat bij Luka blijft', () => {
    expect(rijAntwoord('begin', { toegevoegd: 0, stand: 'leeg', open: 0 })).toContain('laat ik bij jou');
  });

  it('stop en stand', () => {
    expect(rijAntwoord('stop', { gestopt: 1 })).toContain('1 stap staan');
    expect(rijAntwoord('stand', { stand: 'bezig', nu: 'X', open: 4 })).toBe('Ik werk nu aan: X. Daarna nog 4 stappen in de rij.');
    expect(rijAntwoord('stand', { stand: 'leeg', open: 0, kan_erin: 5 })).toContain('doe de rij');
  });
});
