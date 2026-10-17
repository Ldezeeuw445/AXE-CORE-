/**
 * Pinbare onderbalk op de telefoon: max 4 routes + More.
 * Home is vast; More is vast. Opslag: axe_phone_pins.
 */
export const PHONE_PIN_KEY = 'axe_phone_pins';
export const PHONE_PIN_MAX = 4;

export interface PhonePin {
  id: string;
  label: string;
  path: string;
}

export const HOME_PIN: PhonePin = { id: 'home', label: 'Home', path: '/mobile' };
export const MORE_PIN: PhonePin = { id: 'more', label: 'More', path: '/apps' };

export const DEFAULT_PHONE_PINS: readonly PhonePin[] = [
  HOME_PIN,
  { id: 'trading', label: 'Trading', path: '/trading' },
  { id: 'companion', label: 'AXE', path: '/companion' },
  { id: 'memory', label: 'Memory', path: '/memory' },
];

export const MORE_APPS: readonly PhonePin[] = [
  { id: 'northsea', label: 'NorthSea', path: '/maps-3d' },
  { id: 'browser', label: 'Browser', path: '/browser' },
  { id: 'developer', label: 'Developer', path: '/code-editor' },
  { id: 'agents', label: 'Agents', path: '/agents' },
  { id: 'systems', label: 'Systems', path: '/infrastructure' },
  { id: 'tasks', label: 'Tasks', path: '/tasks' },
  { id: 'settings', label: 'Settings', path: '/settings' },
  { id: 'notifications', label: 'Alerts', path: '/notifications' },
  { id: 'calendar', label: 'Calendar', path: '/calendar' },
  { id: 'devices', label: 'Devices', path: '/devices' },
];

const ALLE: readonly PhonePin[] = [
  ...DEFAULT_PHONE_PINS,
  ...MORE_APPS,
];

export function pinVoorPad(path: string): PhonePin | undefined {
  return ALLE.find((p) => p.path === path);
}

export function parsePhonePins(raw: string | null | undefined): PhonePin[] {
  if (raw == null) return [...DEFAULT_PHONE_PINS];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [...DEFAULT_PHONE_PINS];
    const pins: PhonePin[] = [];
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const path = String((item as PhonePin).path || '');
      const bekend = pinVoorPad(path);
      if (!bekend || path === HOME_PIN.path || path === MORE_PIN.path) continue;
      if (pins.some((p) => p.path === path)) continue;
      pins.push({
        id: bekend.id,
        label: bekend.label,
        path,
      });
      if (pins.length >= PHONE_PIN_MAX - 1) break;
    }
    return [HOME_PIN, ...pins].slice(0, PHONE_PIN_MAX);
  } catch {
    return [...DEFAULT_PHONE_PINS];
  }
}

export function leesPhonePins(opslag: { getItem(k: string): string | null } | null = null): PhonePin[] {
  try {
    const store = opslag ?? (typeof localStorage === 'undefined' ? null : localStorage);
    return parsePhonePins(store?.getItem(PHONE_PIN_KEY) ?? null);
  } catch {
    return [...DEFAULT_PHONE_PINS];
  }
}

export function schrijfPhonePins(pins: PhonePin[], opslag?: { setItem(k: string, v: string): void }): PhonePin[] {
  const schoon = parsePhonePins(JSON.stringify(pins.filter((p) => p.path !== MORE_PIN.path)));
  try {
    const store = opslag ?? (typeof localStorage === 'undefined' ? null : localStorage);
    store?.setItem(PHONE_PIN_KEY, JSON.stringify(schoon));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('axe-phone-pins'));
  } catch { /* private mode */ }
  return schoon;
}

/** Zet een app op de balk. Vervangt het laatste niet-Home-slot als hij vol is. */
export function pinNaarBalk(pins: PhonePin[], path: string): PhonePin[] {
  if (path === HOME_PIN.path || path === MORE_PIN.path) return pins;
  const bekend = pinVoorPad(path);
  if (!bekend) return pins;
  if (pins.some((p) => p.path === path)) return pins;
  const rest = pins.filter((p) => p.path !== HOME_PIN.path);
  if (rest.length >= PHONE_PIN_MAX - 1) rest.pop();
  return schrijfPhonePins([HOME_PIN, ...rest, bekend]);
}

export function unpinVanBalk(pins: PhonePin[], path: string): PhonePin[] {
  if (path === HOME_PIN.path) return pins;
  return schrijfPhonePins(pins.filter((p) => p.path !== path));
}

export function balkTabs(pins: PhonePin[]): PhonePin[] {
  return [...pins.slice(0, PHONE_PIN_MAX), MORE_PIN];
}

export function pinIsActief(pathname: string, pin: PhonePin): boolean {
  if (pin.id === 'more') {
    const paden = leesPhonePins().map((p) => p.path);
    return pathname === '/apps' || !paden.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (pin.id === 'home') return pathname === '/' || pathname === '/mobile';
  return pathname === pin.path || pathname.startsWith(`${pin.path}/`);
}

/** Geen AXE-composer: AXON, Companion, Developer. */
export function phoneZonderComposer(path: string): boolean {
  return path === '/companion'
    || path === '/code-editor'
    || path === '/memory'
    || path.startsWith('/memory/');
}
