/**
 * Lokale PIN voor de Samsung-app.
 *
 * Dit is géén tweede account. Supabase blijft de authenticatie. De PIN
 * vergrendelt alleen dit toestel na achtergrond/herstart, zodat een
 * gevonden telefoon niet meteen de open sessie toont.
 *
 * Hash + salt in localStorage; ontgrendeld-vlag in sessionStorage (valt
 * weg bij procesdood). Geen PIN in de APK, geen PIN naar de server.
 */

export const PIN_LENGTE = 4;
const HASH_SLEUTEL = 'axe_android_pin_hash';
const SALT_SLEUTEL = 'axe_android_pin_salt';
const OPEN_SLEUTEL = 'axe_android_unlocked';

export type PinOpslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function pinCijfersGeldig(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTE}}$`).test(pin);
}

export function pinIsGezet(opslag: PinOpslag = localStorage): boolean {
  try {
    return Boolean(opslag.getItem(HASH_SLEUTEL) && opslag.getItem(SALT_SLEUTEL));
  } catch {
    return false;
  }
}

export function isOntgrendeld(sessie: PinOpslag = sessionStorage): boolean {
  try {
    return sessie.getItem(OPEN_SLEUTEL) === '1';
  } catch {
    return false;
  }
}

export function ontgrendel(sessie: PinOpslag = sessionStorage): void {
  try { sessie.setItem(OPEN_SLEUTEL, '1'); } catch { /* private mode */ }
}

export function vergrendel(sessie: PinOpslag = sessionStorage): void {
  try { sessie.removeItem(OPEN_SLEUTEL); } catch { /* private mode */ }
}

export function wisPin(opslag: PinOpslag = localStorage, sessie: PinOpslag = sessionStorage): void {
  try {
    opslag.removeItem(HASH_SLEUTEL);
    opslag.removeItem(SALT_SLEUTEL);
  } catch { /* */ }
  vergrendel(sessie);
}

/** Mag deze route terwijl het toestel op slot is? */
export function androidSlotLaatDoor(path: string): boolean {
  return path === '/lock' || path === '/lock/pin' || path === '/login';
}

function bytesNaarHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(tekst: string): Promise<string> {
  const data = new TextEncoder().encode(tekst);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesNaarHex(digest);
}

function nieuweSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return bytesNaarHex(b.buffer);
}

export async function zetPin(pin: string, opslag: PinOpslag = localStorage): Promise<{ ok: boolean; fout: string | null }> {
  if (!pinCijfersGeldig(pin)) return { ok: false, fout: `PIN must be ${PIN_LENGTE} digits` };
  const salt = nieuweSalt();
  const hash = await sha256(`${salt}:${pin}`);
  try {
    opslag.setItem(SALT_SLEUTEL, salt);
    opslag.setItem(HASH_SLEUTEL, hash);
  } catch {
    return { ok: false, fout: 'could not store PIN' };
  }
  return { ok: true, fout: null };
}

export async function pinKlopt(pin: string, opslag: PinOpslag = localStorage): Promise<boolean> {
  if (!pinCijfersGeldig(pin)) return false;
  let salt: string | null;
  let hash: string | null;
  try {
    salt = opslag.getItem(SALT_SLEUTEL);
    hash = opslag.getItem(HASH_SLEUTEL);
  } catch {
    return false;
  }
  if (!salt || !hash) return false;
  return (await sha256(`${salt}:${pin}`)) === hash;
}
