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
  | 'northsea'
  | 'native_notify';

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
const LOKAAL_SUFFIX = /\.(local|home|lan|internal|localdomain)$/;
const GENERIEKE_NAAM = new Set(['mac', 'imac', 'macbook', 'macmini', 'desktop', 'laptop', 'samsung']);

/** Hostnaam zonder mDNS-suffix, kleine letters. */
export function normaliseerHost(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
    .replace(LOKAAL_SUFFIX, '')
    .replace(/^mac-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Hostnaam als vaste device_id, anders de bewaarde uuid. */
export function kiesDeviceId(hostname: string | null | undefined, bewaardeId: string): string {
  const h = (hostname ?? '').trim().toLowerCase();
  const kort = h.replace(LOKAAL_SUFFIX, '');
  if (!kort || ONSTABIEL.has(kort) || ONSTABIEL.has(h) || kort.includes('.')) return bewaardeId;
  return kort.replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || bewaardeId;
}

export function capabilitiesVoor(platform: string, type: AxeDeviceType): AxeCapability[] {
  if (type === 'server') return ['terminal_host'];
  if (type === 'mobile' || platform === 'android') {
    return ['mobile', 'remote_client', 'remote_terminal_client', 'tasks', 'agenda', 'communications', 'northsea', 'native_notify'];
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

function generiekNaam(naam: string): boolean {
  return GENERIEKE_NAAM.has(normaliseerHost(naam).replace(/-/g, ''));
}

/**
 * Eén sleutel per echte machine. `mini-van-luka-5.home` en
 * `mac-mini-van-luka-5` zijn dezelfde mini; een kale `Mac` is dat niet —
 * die wordt in samenvoegen pas aan een mini/iMac geplakt.
 */
export function machineSleutel(d: AxeDevice): string {
  for (const kandidaat of [d.device_id, d.device_name]) {
    const n = normaliseerHost(kandidaat);
    if (!n || generiekNaam(kandidaat) || isUuid(kandidaat) || n.length < 4) continue;
    return n;
  }
  return `id:${d.device_id}`;
}

function plakRij(a: AxeDevice, b: AxeDevice): AxeDevice {
  const caps = [...new Set([...a.capabilities, ...b.capabilities])];
  const last = later(a.last_seen, b.last_seen);
  const aGeneriek = generiekNaam(a.device_name);
  const bGeneriek = generiekNaam(b.device_name);
  const naam = aGeneriek && !bGeneriek ? b.device_name
    : bGeneriek && !aGeneriek ? a.device_name
      : (b.bron === 'lokaal' ? a.device_name : b.device_name) || a.device_name;
  const bron = b.bron === 'lokaal' ? a.bron : b.bron;
  const id = isUuid(a.device_id) && !isUuid(b.device_id) ? b.device_id
    : isUuid(b.device_id) && !isUuid(a.device_id) ? a.device_id
      : a.device_id;
  return {
    ...a,
    ...b,
    device_id: id,
    device_name: naam,
    capabilities: caps,
    last_seen: last,
    ditToestel: a.ditToestel || b.ditToestel,
    bron,
  };
}

function doelVoorGenericMac(
  groepen: Map<string, AxeDevice[]>,
  generic: AxeDevice,
): string | null {
  const naam = normaliseerHost(generic.device_name);
  const macos = [...groepen.entries()].filter(([k, arr]) => (
    !k.startsWith('id:')
    && arr.some((d) => d.device_type === 'desktop' && (d.platform === 'macos' || d.platform === 'darwin'))
  ));
  if (macos.length === 0) return null;
  const zoek = (naald: string) => macos.find(([k]) => k.includes(naald))?.[0] ?? null;
  if (naam.includes('imac')) return zoek('imac');
  if (naam.includes('mini')) return zoek('mini');
  // Kale "Mac": de mini is het brein dat HQ heartbeatt, niet de iMac.
  return zoek('mini') ?? (macos.length === 1 ? macos[0][0] : null);
}

export function samenvoegen(rijen: AxeDevice[]): AxeDevice[] {
  const groepen = new Map<string, AxeDevice[]>();
  for (const r of rijen) {
    const k = machineSleutel(r);
    const arr = groepen.get(k) ?? [];
    arr.push(r);
    groepen.set(k, arr);
  }
  for (const [k, arr] of [...groepen.entries()]) {
    if (!k.startsWith('id:')) continue;
    const generic = arr.find((d) => d.device_type === 'desktop' && generiekNaam(d.device_name));
    if (!generic) continue;
    const doel = doelVoorGenericMac(groepen, generic);
    if (!doel) continue;
    groepen.set(doel, [...(groepen.get(doel) ?? []), ...arr]);
    groepen.delete(k);
  }
  const uit = [...groepen.values()].map((arr) => arr.reduce(plakRij));
  return uit.sort((a, b) => {
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
