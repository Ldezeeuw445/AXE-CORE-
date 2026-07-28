/**
 * smartThingsService — Samsung SmartThings Cloud API.
 * Token sources (first wins):
 *   1. localStorage axe_smartthings_token
 *   2. axe_llm_connections.smartthings.key (Settings → Provider Keys)
 *   3. VITE_SMARTTHINGS_TOKEN
 */

const API = 'https://api.smartthings.com/v1';
const LS_TOKEN = 'axe_smartthings_token';

export function getSmartThingsToken(): string {
  try {
    const ls = localStorage.getItem(LS_TOKEN)?.trim();
    if (ls) return ls;
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') || '{}') as Record<
      string,
      { key?: string }
    >;
    if (conns.smartthings?.key?.trim()) return conns.smartthings.key.trim();
  } catch { /* */ }
  return (import.meta.env.VITE_SMARTTHINGS_TOKEN as string | undefined)?.trim() || '';
}

export function setSmartThingsToken(token: string | null): void {
  try {
    if (!token?.trim()) localStorage.removeItem(LS_TOKEN);
    else localStorage.setItem(LS_TOKEN, token.trim());
  } catch { /* */ }
}

export function smartThingsConfigured(): boolean {
  return getSmartThingsToken().length > 8;
}

async function stFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSmartThingsToken();
  if (!token) throw new Error('SmartThings token missing — set it under Settings → Provider Keys → SmartThings');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SmartThings HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface StDevice {
  deviceId: string;
  name: string;
  label?: string;
  roomId?: string;
}

export async function listSmartThingsDevices(): Promise<StDevice[]> {
  const data = await stFetch<{ items?: StDevice[] }>('/devices');
  return data.items ?? [];
}

export async function getDeviceStatus(deviceId: string): Promise<unknown> {
  return stFetch(`/devices/${encodeURIComponent(deviceId)}/status`);
}

export async function executeDeviceCommand(
  deviceId: string,
  capability: string,
  command: string,
  args: unknown[] = [],
  component = 'main',
): Promise<unknown> {
  return stFetch(`/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: 'POST',
    body: JSON.stringify({
      commands: [{ component, capability, command, arguments: args }],
    }),
  });
}

export function formatDeviceList(devices: StDevice[]): string {
  if (!devices.length) return 'No SmartThings devices found.';
  return devices.map(d => `- ${d.label || d.name}  id=${d.deviceId}`).join('\n');
}

/** Used by Settings “Test” button. */
export async function testSmartThingsToken(token?: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const prev = getSmartThingsToken();
  try {
    if (token?.trim()) setSmartThingsToken(token.trim());
    const devices = await listSmartThingsDevices();
    return { ok: true, count: devices.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (token?.trim() && prev && prev !== token.trim()) setSmartThingsToken(prev);
  }
}
