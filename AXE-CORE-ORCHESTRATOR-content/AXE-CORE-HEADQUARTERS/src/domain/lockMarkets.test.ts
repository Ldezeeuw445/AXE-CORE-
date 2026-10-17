import { describe, expect, it } from 'vitest';
import { marktOnderschrift, marktPrijsTekst } from './lockMarkets';

describe('lockMarkets', () => {
  it('zet een echte koers, geen streepje', () => {
    expect(marktPrijsTekst({ price: 4195.36, stale: false, last_updated_label: 'Last updated 14:52 UTC' }))
      .toBe('4195.36');
  });

  it('houdt last-updated vast als de feed even weg is', () => {
    expect(marktPrijsTekst({ price: 4195.36, stale: true, last_updated_label: 'Last updated 14:52 UTC' }))
      .toBe('4195.36');
    expect(marktOnderschrift({ stale: true, last_updated_label: 'Last updated 14:52 UTC' }))
      .toBe('Last updated 14:52 UTC');
  });

  it('toont last-updated in plaats van een streepje als de koers ontbreekt maar het stempel niet', () => {
    expect(marktPrijsTekst({ price: null, stale: true, last_updated_label: 'Last updated 14:52 UTC' }))
      .toBe('Last updated 14:52 UTC');
  });

  it('zet pas een streepje als er nooit een koers was', () => {
    expect(marktPrijsTekst({ price: null, stale: true, last_updated_label: null })).toBe('—');
    expect(marktOnderschrift({ stale: false, last_updated_label: null })).toBeNull();
  });
});
