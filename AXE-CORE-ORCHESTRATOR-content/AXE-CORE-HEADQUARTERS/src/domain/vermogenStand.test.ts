import { describe, it, expect } from 'vitest';
import { computerBeeld, browserBeeld } from '@/domain/vermogenStand';

/**
 * De regel die deze test bewaakt is niet "de kleur klopt" maar: rood komt
 * nooit alleen. Een rode stip zonder remedie laat Luka met precies de vraag
 * zitten die de stip moest beantwoorden -- dat was de klacht over de
 * providerkaarten ("ik zie niet waarom het failed").
 */
describe('de stand van een vermogen', () => {
  it('is grijs zolang er nog niets gemeten is', () => {
    expect(computerBeeld(null).stand).toBe('laden');
    expect(browserBeeld(null).stand).toBe('laden');
  });

  it('noemt de machine als er een werker ingecheckt is', () => {
    const b = computerBeeld(['Mac-Mini-van-Luka']);
    expect(b.stand).toBe('aan');
    expect(b.tekst).toContain('Mac-Mini-van-Luka');
  });

  it('noemt alle machines, want er zijn er meer dan een', () => {
    expect(computerBeeld(['mini', 'imac']).tekst).toBe('mini · imac');
  });

  it('zegt bij rood wat er mis is EN wat je eraan doet', () => {
    for (const b of [computerBeeld([]), browserBeeld(false)]) {
      expect(b.stand).toBe('uit');
      expect(b.tekst.length).toBeGreaterThan(0);
      expect(b.remedie, `stand "${b.tekst}" heeft geen remedie`).toBeTruthy();
    }
  });

  it('noemt de machine waar de browser draait', () => {
    // Sinds de host te kiezen is, is "draait" zonder naam een halve mededeling:
    // je zou op de verkeerde machine gaan zoeken.
    expect(browserBeeld(true, 'Mac Mini').tekst).toBe('draait op Mac Mini');
    expect(browserBeeld(false, 'Mac Mini').tekst).toContain('Mac Mini');
    expect(browserBeeld(false, 'Mac Mini').remedie).toContain('Mac Mini');
  });

  it('geeft groen nooit een remedie, want er valt niets te doen', () => {
    expect(computerBeeld(['mini']).remedie).toBeUndefined();
    expect(browserBeeld(true).remedie).toBeUndefined();
  });
});
