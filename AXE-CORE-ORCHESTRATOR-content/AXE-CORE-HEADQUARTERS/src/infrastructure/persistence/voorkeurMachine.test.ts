import { describe, it, expect } from 'vitest';
import { kiesUit } from '@/infrastructure/persistence/voorkeurMachineService';

const MINI = { id: 'mac-mini' };
const IMAC = { id: 'imac' };

describe('welke machine AXE gebruikt', () => {
  it('neemt de gekozen machine als die online is', () => {
    expect(kiesUit([MINI, IMAC], 'imac')).toBe(IMAC);
  });

  it('kiest niets als er nooit een voorkeur gezet is', () => {
    // null betekent "kies zelf maar" -- de relay houdt dan zijn eigen regels,
    // inclusief het vragen bij twee machines.
    expect(kiesUit([MINI, IMAC], null)).toBeNull();
  });

  it('kiest niets als de gekozen machine UIT staat', () => {
    // Een voorkeur die een uitgezette computer tot enige optie maakt haalt
    // precies de zekerheid weg die twee machines moesten geven.
    expect(kiesUit([MINI], 'imac')).toBeNull();
  });
});
