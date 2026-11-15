import { describe, expect, it } from 'vitest';
import { axonPackTekst } from './axonPack';

describe('axonPackTekst', () => {
  it('neemt platte tekst en de gangbare velden', () => {
    expect(axonPackTekst('Luka wil NorthSea eerst.')).toBe('Luka wil NorthSea eerst.');
    expect(axonPackTekst({ pack: 'DEAL-002 wacht op commissie.' })).toBe('DEAL-002 wacht op commissie.');
  });
  it('maakt van items een lijst', () => {
    expect(axonPackTekst({ items: [{ title: 'Voorkeur', content: 'Nederlands' }, 'Geen live orders'] }))
      .toBe('- Voorkeur: Nederlands\n- Geen live orders');
  });
  it('geeft niets bij leeg of onbekend, nooit een JSON-dump', () => {
    expect(axonPackTekst({ ok: true, count: 3 })).toBe('');
    expect(axonPackTekst(null)).toBe('');
  });
  it('houdt zich aan de lengte', () => {
    expect(axonPackTekst('x'.repeat(2000), 100)).toHaveLength(100);
  });
});
