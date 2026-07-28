/**
 * smartThingsService — Samsung SmartThings Cloud API for AXE CORE.
 * Token from localStorage key `axe_smartthings_token` (Settings) or
 * VITE_SMARTTHINGS_TOKEN. Personal Access Tokens expire quickly (often 24h);
 * for production use OAuth + refresh later.
 *
 * Docs: https://developer.smartthings.com/
 */

const API = 'https://api.smartthings.com/v1';
const LS_TOKEN = 'axe_smartthings_token';

export function getSmartThingsToken(): string {
  try {
    const ls = localStorage.getItem(LS_TOKEN)?.trim();
    if (ls) return ls;
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
  if (!token) throw new Error('SmartThings token missing — set it in Settings or localStorage axe_smartthings_token');
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
  components?: { id: string }[];
}

export async function listSmartThingsDevices(): Promise<StDevice[]> {
  const data = await stFetch<{ items?: StDevice[] }>('/devices');
  return data.items ?? [];
}

export async function getDeviceStatus(deviceId: string): Promise<unknown> {
  return stFetch(`/devices/${encodeURIComponent(deviceId)}/status`);
}

/** Execute a capability command, e.g. switch/on, switchLevel/setLevel with args. */
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
      commands: [
        {
          component,
          capability,
          command,
          arguments: args,
        },
      ],
    }),
  });
}

export function formatDeviceList(devices: StDevice[]): string {
  if (!devices.length) return 'No SmartThings devices found.';
  return devices
    .map(d => `- ${d.label || d.name}  id=${d.deviceId}`)
    .join('\n');
}
