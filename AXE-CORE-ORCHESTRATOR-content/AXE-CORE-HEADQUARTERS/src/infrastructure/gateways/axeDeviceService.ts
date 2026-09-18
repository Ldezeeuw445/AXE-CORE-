/**
 * Presence van AXE-installaties.
 *
 * Schrijft naar core_axe_devices (ingelogd, RLS = Luka). Leest computer-
 * workers en de VPS-health erbij. Geen mock-rijen: wat hier niet gemeten
 * is, staat er niet.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isTauriRuntime, isAndroidRuntime, VPS_API_ORIGIN } from '@/infrastructure/config/apiUrl';
import {
  capabilitiesVoor,
  deviceTypeVoor,
  kiesDeviceId,
  naamVoor,
  platformVanRuntime,
  samenvoegen,
  voegWorkerToe,
  type AxeCapability,
  type AxeDevice,
} from '@/domain/axeDevices';

const DEVICE_ID_SLEUTEL = 'axe_device_id';
const HEARTBEAT_STALE_MS = 90_000;

export interface DeviceOverzicht {
  devices: AxeDevice[];
  /** Waarom de installatie-tabel ontbreekt of weigerde. Null = ok of nog niet geprobeerd. */
  tabelFout: string | null;
}

function bewaardeId(): string {
  try {
    const bestaand = localStorage.getItem(DEVICE_ID_SLEUTEL);
    if (bestaand && bestaand.trim()) return bestaand.trim();
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_SLEUTEL, id);
    return id;
  } catch {
    return 'onbekend';
  }
}

async function nativePlatform(): Promise<{ os: string; arch: string; hostname: string | null } | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('platform_info');
  } catch {
    return null;
  }
}

export async function ditToestel(): Promise<AxeDevice> {
  const native = await nativePlatform();
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const platform = platformVanRuntime({
    os: native?.os,
    android: isAndroidRuntime(),
    userAgent: ua,
  });
  const type = deviceTypeVoor(platform);
  const id = kiesDeviceId(native?.hostname ?? null, bewaardeId());
  return {
    device_id: id,
    device_name: naamVoor(platform, native?.hostname ?? null, ua),
    device_type: type,
    platform,
    app_version: '1.0.0',
    capabilities: capabilitiesVoor(platform, type),
    last_seen: new Date().toISOString(),
    ditToestel: true,
    bron: 'lokaal',
  };
}

export async function heartbeatDitToestel(): Promise<{ ok: boolean; fout: string | null; device: AxeDevice }> {
  const device = await ditToestel();
  const sb = getSupabase();
  if (!sb) return { ok: false, fout: 'not signed in', device };
  const { error } = await sb.from('core_axe_devices').upsert({
    device_id: device.device_id,
    device_name: device.device_name,
    device_type: device.device_type,
    platform: device.platform,
    app_version: device.app_version,
    capabilities: device.capabilities,
    last_seen: device.last_seen,
  }, { onConflict: 'device_id' });
  if (error) return { ok: false, fout: error.message, device };
  return { ok: true, fout: null, device: { ...device, bron: 'installatie' } };
}

async function installaties(ditId: string): Promise<{ rijen: AxeDevice[]; fout: string | null }> {
  const sb = getSupabase();
  if (!sb) return { rijen: [], fout: 'not signed in' };
  const { data, error } = await sb
    .from('core_axe_devices')
    .select('device_id, device_name, device_type, platform, app_version, capabilities, last_seen');
  if (error) return { rijen: [], fout: error.message };
  const rijen = (data ?? []).map((r): AxeDevice => ({
    device_id: String(r.device_id),
    device_name: String(r.device_name),
    device_type: (r.device_type as AxeDevice['device_type']) || 'desktop',
    platform: String(r.platform),
    app_version: (r.app_version as string | null) ?? null,
    capabilities: Array.isArray(r.capabilities) ? r.capabilities as AxeCapability[] : [],
    last_seen: (r.last_seen as string | null) ?? null,
    ditToestel: String(r.device_id) === ditId,
    bron: 'installatie',
  }));
  return { rijen, fout: null };
}

async function computerWorkers(): Promise<AxeDevice[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('core_computer_workers')
    .select('device_id, host, heartbeat_at')
    .gt('heartbeat_at', new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString());
  if (error || !data?.length) return [];
  return data.map((r): AxeDevice => ({
    device_id: String(r.device_id),
    device_name: String(r.host || r.device_id),
    device_type: 'desktop',
    platform: 'macos',
    app_version: null,
    capabilities: ['desktop', 'local_runtime', 'local_filesystem', 'terminal_host'],
    last_seen: (r.heartbeat_at as string | null) ?? null,
    ditToestel: false,
    bron: 'computer_worker',
  }));
}

async function vpsHealth(): Promise<AxeDevice | null> {
  const url = `${VPS_API_ORIGIN}/health`;
  const nu = new Date().toISOString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) {
      return {
        device_id: 'vps-strato',
        device_name: 'VPS',
        device_type: 'server',
        platform: 'linux-server',
        app_version: null,
        capabilities: ['terminal_host'],
        last_seen: null,
        ditToestel: false,
        bron: 'health',
      };
    }
    return {
      device_id: 'vps-strato',
      device_name: 'VPS',
      device_type: 'server',
      platform: 'linux-server',
      app_version: null,
      capabilities: ['terminal_host'],
      last_seen: nu,
      ditToestel: false,
      bron: 'health',
    };
  } catch {
    return {
      device_id: 'vps-strato',
      device_name: 'VPS',
      device_type: 'server',
      platform: 'linux-server',
      app_version: null,
      capabilities: ['terminal_host'],
      last_seen: null,
      ditToestel: false,
      bron: 'health',
    };
  }
}

/**
 * Wat er nu zichtbaar is. VPS altijd (gemeten health). Computer-workers
 * alleen als ze net geklopt hebben. Installaties alleen als de tabel bestaat
 * en RLS toestaat. Dit toestel altijd, ook als upsert faalde.
 */
export async function laadDevices(): Promise<DeviceOverzicht> {
  const lokaal = await ditToestel();
  const [inst, workers, vps] = await Promise.all([
    installaties(lokaal.device_id),
    computerWorkers(),
    vpsHealth(),
  ]);
  const workersMetCap = workers.map(w => voegWorkerToe(w, true));
  const rijen = [lokaal, ...inst.rijen, ...workersMetCap, ...(vps ? [vps] : [])];
  return { devices: samenvoegen(rijen), tabelFout: inst.fout };
}
