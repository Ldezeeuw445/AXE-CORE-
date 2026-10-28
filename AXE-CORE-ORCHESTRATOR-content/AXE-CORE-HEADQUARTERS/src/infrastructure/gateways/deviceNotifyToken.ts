/**
 * Device-token voor de Android-poller. De hash gaat naar core_axe_devices
 * (Luka-sessie). De plaintext gaat naar WorkManager. De API vergelijkt de
 * hash; de anon-sleutel komt er niet meer aan te pas.
 */
import { sessieClient } from '@/infrastructure/supabase/supabaseClient';
import { VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';
import { ditToestel } from '@/infrastructure/gateways/axeDeviceService';

export const DEVICE_TOKEN_PREFIX = 'axe_dev_';

export function hashDeviceToken(token: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)).then((buf) =>
    Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(''),
  );
}

export function mintDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${DEVICE_TOKEN_PREFIX}${raw}`;
}

export interface DeviceNotifyPoll {
  apiOrigin: string;
  deviceToken: string;
  deviceId: string;
}

export async function registreerDeviceNotifyToken(): Promise<DeviceNotifyPoll | null> {
  const sb = await sessieClient();
  if (!sb) return null;
  const device = await ditToestel();
  const token = mintDeviceToken();
  const hash = await hashDeviceToken(token);
  const { error } = await sb.from('core_axe_devices').upsert({
    device_id: device.device_id,
    device_name: device.device_name,
    device_type: device.device_type,
    platform: device.platform,
    app_version: device.app_version,
    capabilities: device.capabilities,
    last_seen: device.last_seen,
    device_token_hash: hash,
  }, { onConflict: 'device_id' });
  if (error) {
    console.warn('[deviceNotify] token opslaan:', error.message);
    return null;
  }
  return {
    apiOrigin: VPS_API_ORIGIN.replace(/\/$/, ''),
    deviceToken: token,
    deviceId: device.device_id,
  };
}
