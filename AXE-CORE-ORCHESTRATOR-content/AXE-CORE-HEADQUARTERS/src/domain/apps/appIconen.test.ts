/**
 * De Apps-tab toont het ECHTE logo, niet twee letters.
 *
 * Drie van de vier rijen in `registered_apps` hadden een lege `icon_url`, dus
 * AXE CORE HQ, AXE Companion en Trading OS kregen allemaal initialen. Die test
 * hieronder valt om zodra een van die apps zijn meegeleverde mark kwijtraakt.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GEBUNDELDE_ICONEN, gebundeldIcoon, icoonBronnen } from './appIconen';

const publiek = (p: string) => resolve(__dirname, '../../../public', p.replace(/^\//, ''));

describe('elke app die AXE uitbrengt heeft een echt logo', () => {
  // Precies de namen uit registered_apps (gemeten 25 september).
  it.each(['AXE CORE HQ', 'AXE Companion', 'Trading OS', 'Axon Memory'])(
    '%s valt niet terug op initialen',
    naam => {
      expect(gebundeldIcoon(naam)).toBeTruthy();
      expect(icoonBronnen(naam, null).length).toBeGreaterThan(0);
    },
  );

  it('elk meegeleverd bestand staat er ook echt', () => {
    for (const pad of Object.values(GEBUNDELDE_ICONEN)) {
      expect(existsSync(publiek(pad)), `${pad} ontbreekt in public/`).toBe(true);
    }
  });

  it('een expliciete icon_url wint, met de bundel als vangnet', () => {
    // axecompanion.com geeft vandaag 402: valt de remote weg, dan hoort het
    // meegeleverde logo te volgen -- niet de letters.
    const bronnen = icoonBronnen('AXE Companion', 'https://voorbeeld.test/logo.png');
    expect(bronnen[0]).toBe('https://voorbeeld.test/logo.png');
    expect(bronnen[1]).toBe('/app-icons/companion.png');
  });

  it('herhaalt dezelfde bron niet als de rij al naar de bundel wijst', () => {
    expect(icoonBronnen('Trading OS', '/app-icons/trading-os.png')).toEqual(['/app-icons/trading-os.png']);
  });

  it('een zelf toegevoegde app zonder icoon houdt zijn initialen', () => {
    expect(icoonBronnen('Iets Van Luka', null)).toEqual([]);
  });
});
