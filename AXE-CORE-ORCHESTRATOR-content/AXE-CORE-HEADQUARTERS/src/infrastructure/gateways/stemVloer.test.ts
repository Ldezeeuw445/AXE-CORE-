import { describe, expect, it, vi, beforeEach } from 'vitest';

const { claim, stand } = vi.hoisted(() => ({ claim: vi.fn(), stand: { plat: false } }));
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({ claimStemVloer: (b: unknown) =>
  stand.plat ? Promise.reject(new Error('AXE API onbereikbaar')) : claim(b) }));
vi.mock('@/infrastructure/gateways/axeDeviceService', () => ({
  ditToestel: async () => ({ device_id: 'imac', device_name: 'Main-iMac-Luka' }),
}));
vi.mock('@/infrastructure/config/apiUrl', () => ({ isTauriRuntime: () => false }));

import { magLuisteren, STEM_VLOER_EVT } from './stemVloer';

describe('magLuisteren (ADR-01)', () => {
  beforeEach(() => { claim.mockReset(); stand.plat = false; });

  it('luistert gewoon als de VPS niet antwoordt', async () => {
    stand.plat = true;
    expect((await magLuisteren('wake')).winner).toBe(true);
  });

  it('blijft stil en meldt wie wel luistert als een ander apparaat wint', async () => {
    claim.mockImplementation(async () => ({ winner: false, winner_device: 'mini', winner_name: 'Mac mini' }));
    const doel = new EventTarget();
    const g = globalThis as unknown as { dispatchEvent?: (e: Event) => boolean };
    const oud = g.dispatchEvent;
    g.dispatchEvent = (e) => doel.dispatchEvent(e);
    const gezien: unknown[] = [];
    doel.addEventListener(STEM_VLOER_EVT, (e) => gezien.push((e as CustomEvent).detail));
    try {
      const b = await magLuisteren('clap');
      expect(b.winner).toBe(false);
    } finally {
      g.dispatchEvent = oud;
    }
    expect(gezien).toHaveLength(1);
    expect(claim.mock.calls[0][0]).toMatchObject({ device_id: 'imac', trigger: 'clap', idle_s: null });
  });
});
