import { describe, it, expect } from 'vitest';
import { korteFaalReden } from './faalReden';
import { koelingTekst } from './gebruikslimiet';

describe('korteFaalReden', () => {
  it('bewaart de stderr, niet de aanloop ervoor', () => {
    // De echte regel uit de routeringslog van 13 september 2026.
    const echt = 'Codex eindigde met 1. stderr: Not inside a trusted directory '
      + 'and --skip-git-repo-check was not specified.';
    const reden = korteFaalReden(echt);
    expect(reden).toContain('trusted directory');
    expect(reden).not.toBe('Codex eindigde met 1. st');
  });

  it('herkent timeout en netwerk voor alles anders', () => {
    expect(korteFaalReden('Request timed out after 900s')).toBe('timeout');
    expect(korteFaalReden('TypeError: Failed to fetch')).toBe('network');
  });

  it('noemt de HTTP-status als er geen stderr is', () => {
    expect(korteFaalReden('Proxy HTTP 502 van upstream')).toBe('502');
  });

  it('leest geen status uit een stderr die toevallig cijfers bevat', () => {
    const reden = korteFaalReden('Claude eindigde met 1. stderr: kan /opt/404/bin niet lezen');
    expect(reden).not.toBe('404');
    expect(reden).toContain('/opt/404/bin');
  });

  it('houdt een logregel kort', () => {
    const lang = `X eindigde met 1. stderr: ${'a'.repeat(400)}`;
    expect(korteFaalReden(lang).length).toBeLessThanOrEqual(60);
  });

  it('valt terug op het begin als er niets herkenbaars in staat', () => {
    expect(korteFaalReden('iets onverwachts ging mis in de gateway')).toBe('iets onverwachts ging m…');
  });

  it('houdt de klok vast als een abonnement even op is', () => {
    // Niet losgetypt: als koelingTekst anders gaat formuleren, hoort dat hier
    // op te vallen in plaats van stil een logregel zonder tijd op te leveren.
    const tot = new Date('2026-09-13T17:36:00').getTime();
    expect(korteFaalReden(koelingTekst('codex', tot))).toBe('limiet tot 17:36');
  });
});
