import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { alsTekst, leesCodeblok } from './markdownCode';

describe('alsTekst', () => {
  it('laat een enkele regel heel', () => {
    expect(alsTekst('npm run bijwerken')).toBe('npm run bijwerken');
  });

  it('plakt meerdere regels aan elkaar zonder er iets tussen te zetten', () => {
    expect(alsTekst(['cd /opt/axe-core-api\n', 'git pull\n'])).toBe('cd /opt/axe-core-api\ngit pull\n');
  });

  it('laat een element weg in plaats van er [object Object] van te maken', () => {
    expect(alsTekst(createElement('span', null, 'x'))).toBe('');
  });

  it('geeft een lege string bij niets, zodat de kopieerknop niet "null" kopieert', () => {
    expect(alsTekst(null)).toBe('');
    expect(alsTekst(undefined)).toBe('');
    expect(alsTekst(false)).toBe('');
  });
});

describe('leesCodeblok', () => {
  const pre = (klasse: string | undefined, code: unknown) =>
    createElement('code', { className: klasse }, code as never);

  it('haalt de taal uit de language-klasse', () => {
    expect(leesCodeblok(pre('language-bash', 'ls'))).toEqual({ code: 'ls', taal: 'bash' });
  });

  it('laat de taal weg bij een hek zonder taal, maar geeft de code wél terug', () => {
    // Dit is het geval dat eerder helemaal geen kopieerknop kreeg.
    expect(leesCodeblok(pre(undefined, 'git status'))).toEqual({ code: 'git status', taal: undefined });
  });

  it('haalt de afsluitende regelovergang eraf, zodat een terminal niet meteen uitvoert', () => {
    expect(leesCodeblok(pre('language-sh', 'npm test\n')).code).toBe('npm test');
  });

  it('houdt regelovergangen binnen het blok wél heel', () => {
    expect(leesCodeblok(pre('language-sh', ['cd x\n', 'git pull\n'])).code).toBe('cd x\ngit pull');
  });

  it('neemt het eerste kind als children een array is', () => {
    expect(leesCodeblok([pre('language-ts', 'const a = 1')]).code).toBe('const a = 1');
  });

  it('valt niet om als er helemaal geen code-element in zit', () => {
    expect(leesCodeblok('losse tekst')).toEqual({ code: '', taal: undefined });
  });

  it('kan met een taal met een streepje erin', () => {
    expect(leesCodeblok(pre('language-objective-c', 'x')).taal).toBe('objective-c');
  });
});
