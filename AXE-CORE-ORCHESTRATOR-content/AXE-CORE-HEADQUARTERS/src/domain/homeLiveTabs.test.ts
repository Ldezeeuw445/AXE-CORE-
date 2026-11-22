import { describe, expect, it } from 'vitest';
import { kiesTab } from './homeLiveTabs';

describe('kiesTab', () => {
  it('eigen keuze wint, anders de standaard', () => {
    expect(kiesTab(['ok', 'seats'], 'seats', 'ok')).toBe('seats');
    expect(kiesTab(['ok', 'seats'], null, 'ok')).toBe('ok');
    expect(kiesTab(['ok', 'seats'], 'lopend', 'seats')).toBe('seats');
  });
});
