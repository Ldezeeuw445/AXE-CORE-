/**
 * De brug tussen de rauwe spraaksleutel en de cloudsleutel.
 *
 * Wat hier echt kapot kan: aanhalingstekens meenemen. `saveSetting` schrijft
 * JSON, de vier lezers vergelijken met `=== 'type'` — zet je `"type"` in die
 * sleutel, dan praat AXE hardop terwijl de knop "alleen tekst" zegt, en niets
 * wijst die fout aan.
 */
import { describe, it, expect } from 'vitest';
import { spraakStandUit } from './voorkeuren';

describe('spraakStandUit', () => {
  it('leest de JSON die saveSetting en de hydratie schrijven', () => {
    expect(spraakStandUit('"type"')).toBe('type');
    expect(spraakStandUit('"speak"')).toBe('speak');
  });

  it('accepteert ook de rauwe waarde, voor wie hem met de hand zet', () => {
    expect(spraakStandUit('type')).toBe('type');
    expect(spraakStandUit('speak')).toBe('speak');
  });

  it('geeft null als er niets bruikbaars staat -- dan blijft de lokale stand', () => {
    expect(spraakStandUit(null)).toBeNull();
    expect(spraakStandUit(undefined)).toBeNull();
    expect(spraakStandUit('')).toBeNull();
    expect(spraakStandUit('   ')).toBeNull();
    expect(spraakStandUit('"luid"')).toBeNull();
    expect(spraakStandUit('{kapot')).toBeNull();
    expect(spraakStandUit('{"mode":"type"}')).toBeNull();
  });
});
