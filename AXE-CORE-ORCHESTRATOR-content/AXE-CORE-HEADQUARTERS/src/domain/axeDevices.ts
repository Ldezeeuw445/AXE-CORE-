/**
 * AXE-installaties: aanwezigheid en kunnen, geen tweede orchestrator.
 *
 * Een rij hier is een device dat AXE CORE draait (Mac mini, iMac, Samsung)
 * of een gemeten server (VPS). Online volgt uit last_seen, nooit uit een
 * hardgecodeerde vlag. Capaciteiten zijn wat dit toestel écht kan, niet
 * wat het ooit zou moeten kunnen.
 */
export type AxeDeviceType = 'desktop' | 'mobile' | 'server';

export type AxeCapability =
  | 'desktop'
  | 'mobile'
  | 'local_runtime'
  | 'local_filesystem'
  | 'terminal_host'
  | 'remote_client'
  | 'remote_terminal_client'
  | 'tasks'
  | 'agenda'
  | 'communications'
  | 'northsea';

export interface AxeDevice {
  device_id: string;
  device_name: string;
  device_type: AxeDeviceType;
  platform: string;
  app_version: string | null;
  capabilities: AxeCapability[];
  last_seen: string | null;
  /** Deze rij is déze installatie. */
  ditToestel: boolean;
  /** Waar de last_seen vandaan komt, zodat een leeg scherm uitleg heeft. */
  bron: 'installatie' | 'computer_worker' | 'health' | 'lokaal';
}

const STALE_MS = 90_000;

export function isOnline(lastSeen: string | null | undefined, nu = Date.now(), staleMs = STALE_MS): boolean {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  if (!Number.isFinite(t)) return false;
  return nu - t <= staleMs;
}

const ONSTABIEL = new Set(['localhost', '127.0.0.1', 'unknown', 'android', 'localhost.localdomain']);

/** Hostnaam als vaste device_id, anders de bewaarde uuid. */
export function kiesDeviceId(hostname: string | null | undefined, bewaardeId: string): string {
  const h = (hostname ?? '').trim().toLowerCase();
  if (!h || ONSTABIEL.has(h) || h.includes('.')) {
    // Punten: een FQDN is bruikbaar (mac-mini-van-luka-5.local), maar een
    // toevallige Android-naam als `localhost` niet. local-suffix wél.
    if (h.endsWith('.local') && h.split('.').length === 2 && !ONSTABIEL.has(h.slice(0, -6))) {
      return h.slice(0, -6);
    }
    if (!h || ONSTABIEL.has(h) || h.includes('.')) return bewaardeId;
  }
  return h.replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || bewaardeId;
}

export function capabilitiesVoor(platform: string, type: AxeDeviceType): AxeCapability[] {
  if (type === 'server') return ['terminal_host'];
  if (type === 'mobile' || platform === 'android') {
    return ['mobile', 'remote_client', 'remote_terminal_client', 'tasks', 'agenda', 'communications', 'northsea'];
  }
  return ['desktop', 'local_runtime', 'local_filesystem', 'terminal_host', 'tasks', 'agenda', 'communications', 'northsea'];
}

export function deviceTypeVoor(platform: string): AxeDeviceType {
  if (platform === 'android' || platform === 'ios') return 'mobile';
  if (platform === 'linux-server' || platform === 'server') return 'server';
  return 'desktop';
}

export function platformVanRuntime(opts: {
  os?: string | null;
  android?: boolean;
  userAgent?: string;
}): string {
  if (opts.android || /android/i.test(opts.userAgent ?? '')) return 'android';
  const os = (opts.os ?? '').toLowerCase();
  if (os === 'macos' || os === 'darwin') return 'macos';
  if (os === 'linux') return 'linux';
  if (os === 'windows') return 'windows';
  if (os === 'ios') return 'ios';
  if (/iphone|ipad|ipod/i.test(opts.userAgent ?? '')) return 'ios';
  if (/mac os x|macintosh/i.test(opts.userAgent ?? '')) return 'macos';
  return os || 'unknown';
}

export function naamVoor(platform: string, hostname: string | null | undefined, userAgent?: string): string {
  if (hostname && !ONSTABIEL.has(hostname.trim().toLowerCase())) return hostname.trim();
  if (platform === 'android') {
    const m = /;\s*([^;)]+?)\s+Build\//i.exec(userAgent ?? '');
    return m ? m[1].trim() : 'Samsung';
  }
  if (platform === 'macos') return 'Mac';
  return platform;
}

/** Voeg worker-capaciteit toe zonder een tweede rij te verzinnen. */
export function voegWorkerToe(device: AxeDevice, workerOnline: boolean): AxeDevice {
  if (!workerOnline) return device;
  const caps = new Set(device.capabilities);
  caps.add('local_runtime');
  caps.add('terminal_host');
  return { ...device, capabilities: [...caps] };
}

export function samenvoegen(rijen: AxeDevice[]): AxeDevice[] {
  const uit = new Map<string, AxeDevice>();
  for (const r of rijen) {
    const bestaand = uit.get(r.device_id);
    if (!bestaand) {
      uit.set(r.device_id, r);
      continue;
    }
    const caps = [...new Set([...bestaand.capabilities, ...r.capabilities])];
    const last = later(bestaand.last_seen, r.last_seen);
    uit.set(r.device_id, {
      ...bestaand,
      ...r,
      capabilities: caps,
      last_seen: last,
      ditToestel: bestaand.ditToestel || r.ditToestel,
      bron: r.bron === 'lokaal' ? bestaand.bron : r.bron,
      device_name: r.bron === 'lokaal' ? bestaand.device_name : r.device_name || bestaand.device_name,
    });
  }
  return [...uit.values()].sort((a, b) => {
    if (a.ditToestel !== b.ditToestel) return a.ditToestel ? -1 : 1;
    return (b.last_seen ?? '').localeCompare(a.last_seen ?? '');
  });
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function tijdGeleden(iso: string | null, nu = Date.now()): string {
  if (!iso) return 'never seen';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never seen';
  const s = Math.max(0, Math.round((nu - t) / 1000));
  if (s < 15) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
