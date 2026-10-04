/**
 * De twee voorkeuren die per apparaat uit elkaar liepen, zijn aangesloten.
 *
 * De regel zelf (`spraakStandUit`) staat in domain en is daar per geval getest.
 * Wat een unittest niet ziet is of de presentatielaag hem ÁANROEPT, en in welke
 * volgorde — en dat was hier het hele probleem: de spraakstand en de
 * THINKTHANKS-tabs stonden alleen in localStorage van het apparaat waarop je ze
 * zette, terwijl `axe_look` al wel meeging. Zelfde soort test als
 * `installTierRouter.wiring.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('voorkeuren gaan mee naar je andere apparaten', () => {
  it('main.tsx installeert de sync', () => {
    expect(bron('app/main.tsx')).toContain('installVoorkeurSync()');
  });

  /* De volgorde is het punt. De hydratie schrijft user_settings naar
     localStorage; pas DAARNA valt er iets over te nemen. Seint AuthContext
     eerder, dan leest de sync de oude lokale waarde terug en lijkt er niets
     gesynchroniseerd te zijn. */
  it('AuthContext seint pas ná de hydratie', () => {
    const tekst = bron('presentation/contexts/AuthContext.tsx');
    const hydratie = tekst.indexOf('hydrateSettingsFromSupabase()');
    const sein = tekst.indexOf('INSTELLINGEN_BINNEN');
    expect(hydratie).toBeGreaterThan(0);
    expect(tekst.lastIndexOf('INSTELLINGEN_BINNEN')).toBeGreaterThan(hydratie);
    expect(sein).toBeGreaterThan(0);
  });

  it('neemt de spraakstand over via de regel in domain, niet met een eigen if', () => {
    const tekst = bron('presentation/store/installVoorkeurSync.ts');
    expect(tekst).toContain("from '@/domain/voorkeuren'");
    expect(tekst).toContain('spraakStandUit');
    // Allebei bijwerken: de rauwe sleutel voor de vier synchrone lezers, en de
    // store voor wat er op het scherm staat.
    expect(tekst).toContain("localStorage.setItem(SPRAAK_LOKAAL");
    expect(tekst).toContain('useVoiceStore.setState({ responseMode: stand })');
  });

  it('schrijft een wijziging terug naar de cloud', () => {
    const tekst = bron('presentation/store/installVoorkeurSync.ts');
    expect(tekst).toContain('useVoiceStore.subscribe');
    expect(tekst).toContain('saveSetting(SPRAAK_CLOUD');
  });

  /* De rauwe sleutel mag NOOIT de cloudsleutel worden: saveSetting en de
     hydratie schrijven JSON, en dan staat er `"type"` mét aanhalingstekens in
     de sleutel die vier plekken met `=== 'type'` vergelijken. Dan praat AXE
     hardop terwijl de knop "alleen tekst" zegt. */
  it('houdt de rauwe sleutel en de cloudsleutel uit elkaar', () => {
    const tekst = bron('presentation/store/installVoorkeurSync.ts');
    expect(tekst).toMatch(/SPRAAK_LOKAAL = 'axe_response_mode'/);
    expect(tekst).toMatch(/SPRAAK_CLOUD = 'axe_response_mode_sync'/);
    expect(tekst).not.toMatch(/saveSetting\('axe_response_mode'/);
  });

  it('en zet een door THINKTHANKS geregistreerde tab ook in de cloud', () => {
    const tekst = bron('presentation/store/installVoorkeurSync.ts');
    expect(tekst).toContain("addEventListener('axe-nav-changed'");
    expect(tekst).toContain('saveSetting(NAV_SLEUTEL');
  });

  /* navRegistry blijft domain: een import van infrastructure daar is een
     laagfout die eslint pas ziet als iemand hem maakt. */
  it('navRegistry raakt de cloud niet zelf aan', () => {
    expect(bron('domain/navRegistry.ts')).not.toContain('userSettingsService');
  });
});
