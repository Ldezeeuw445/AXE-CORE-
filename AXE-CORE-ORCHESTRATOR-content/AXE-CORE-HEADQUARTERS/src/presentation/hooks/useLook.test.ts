import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/persistence/userSettingsService', () => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

import { lookUitCloud } from './useLook';

function opslag(begin: Record<string, string> = {}) {
  const data = { ...begin };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

describe('de look uit de cloud wordt ook lokaal onthouden', () => {
  // De iPhone-app startte elke keer licht tot de cloud antwoordde, omdat die
  // keuze nergens lokaal landde. iOS las in dat moment de statusbalk af.
  it('bewaart de cloud-stand lokaal als er nog niets lokaal stond', async () => {
    const o = opslag();
    await expect(lookUitCloud(async () => 'black', o)).resolves.toBe('black');
    expect(o.data.axe_look).toBe('black');
  });

  it('laat de cloud winnen van een oude lokale stand, en onthoudt dat', async () => {
    const o = opslag({ axe_look: 'glass' });
    await expect(lookUitCloud(async () => 'black', o)).resolves.toBe('black');
    expect(o.data.axe_look).toBe('black');
  });

  it('houdt de lokale stand als de cloud niets weet', async () => {
    const o = opslag({ axe_look: 'black' });
    await expect(lookUitCloud(async () => null, o)).resolves.toBe('black');
    expect(o.data.axe_look).toBe('black');
  });

  it('werkt zonder opslag, of met een opslag die weigert (privémodus)', async () => {
    await expect(lookUitCloud(async () => 'black', undefined)).resolves.toBe('black');
    const weigert = { getItem: () => { throw new Error('nee'); }, setItem: () => { throw new Error('nee'); } };
    await expect(lookUitCloud(async () => 'black', weigert)).resolves.toBe('black');
  });
});
