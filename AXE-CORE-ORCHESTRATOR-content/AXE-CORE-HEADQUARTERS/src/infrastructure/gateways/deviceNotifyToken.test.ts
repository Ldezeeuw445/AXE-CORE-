import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ sessieClient: vi.fn() }));
vi.mock('@/infrastructure/config/apiUrl', () => ({ VPS_API_ORIGIN: 'https://api.axecompanion.com' }));
vi.mock('@/infrastructure/gateways/axeDeviceService', () => ({
  ditToestel: async () => ({
    device_id: 'samsung-a17',
    device_name: 'Samsung',
    device_type: 'mobile',
    platform: 'android',
    app_version: '1.0.0',
    capabilities: ['native_notify'],
    last_seen: '2026-10-28T00:00:00.000Z',
  }),
}));

import { sessieClient } from '@/infrastructure/supabase/supabaseClient';
import { DEVICE_TOKEN_PREFIX, hashDeviceToken, mintDeviceToken, registreerDeviceNotifyToken } from './deviceNotifyToken';

const sessie = vi.mocked(sessieClient);

describe('deviceNotifyToken', () => {
  beforeEach(() => sessie.mockReset());

  it('maakt een axe_dev_ token waarvan alleen de hash naar Supabase gaat', async () => {
    const token = mintDeviceToken();
    expect(token.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    const hash = await hashDeviceToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
  });

  it('doet niets zonder sessie', async () => {
    sessie.mockResolvedValue(null);
    expect(await registreerDeviceNotifyToken()).toBeNull();
  });

  it('schrijft de hash, niet het token', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    sessie.mockResolvedValue({ from: () => ({ upsert }) } as never);
    const poll = await registreerDeviceNotifyToken();
    expect(poll?.apiOrigin).toBe('https://api.axecompanion.com');
    expect(poll?.deviceToken.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(poll?.deviceId).toBe('samsung-a17');
    const payload = upsert.mock.calls[0]?.[0] as { device_token_hash: string; device_id: string };
    expect(payload.device_id).toBe('samsung-a17');
    expect(payload.device_token_hash).toBe(await hashDeviceToken(poll!.deviceToken));
    expect(JSON.stringify(payload)).not.toContain(poll!.deviceToken);
  });
});
