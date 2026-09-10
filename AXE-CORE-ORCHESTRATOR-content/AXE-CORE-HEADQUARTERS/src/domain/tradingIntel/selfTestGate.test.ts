import { describe, it, expect } from 'vitest';
import {
  magZelftestDraaien, volgendeZelftestStempel,
  SELFTEST_INTERVAL_MS, SELFTEST_HERKANSING_MS,
} from '@/domain/tradingIntel/selfTestGate';

const NU = Date.UTC(2026, 8, 10, 12, 0, 0);

describe('het slot van de zelftest', () => {
  it('laat een ronde die iets opleverde twaalf uur wachten', () => {
    const stempel = volgendeZelftestStempel(7, NU);
    expect(magZelftestDraaien(stempel, NU)).toBe(false);
    expect(magZelftestDraaien(stempel, NU + SELFTEST_INTERVAL_MS)).toBe(true);
  });

  it('laat een LEGE ronde het na een uur opnieuw proberen', () => {
    // Dit is de hele reden dat deze regel bestaat: op 10 september stempelde de
    // zelftest om 07:17 en schreef niets, en het ledger stond twee dagen stil.
    const stempel = volgendeZelftestStempel(0, NU);
    expect(magZelftestDraaien(stempel, NU)).toBe(false);
    expect(magZelftestDraaien(stempel, NU + SELFTEST_HERKANSING_MS)).toBe(true);
  });

  it('draait als er nooit een ronde geweest is', () => {
    expect(magZelftestDraaien(null, NU)).toBe(true);
  });

  it('laat een onleesbare stempel de zelftest niet voor altijd stilzetten', () => {
    expect(magZelftestDraaien('gisteren ofzo', NU)).toBe(true);
  });
});
