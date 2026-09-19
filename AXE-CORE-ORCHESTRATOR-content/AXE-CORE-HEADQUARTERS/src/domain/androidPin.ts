/**
 * Particle-gesture PIN — recovered from the Samsung APK
 * (com.axecore.core 0.1.0-mvp, 26 Aug 2026).
 *
 * Source: com.particlequickactions.GestureLockStore + GestureLockCrypto,
 * wrapped by com.axecore.core.lock.AxeGestureLock.
 *
 * Four unistroke names (lock alphabet) are joined with U+001F, then
 * PBKDF2-HMAC-SHA256 (120000, 32-byte salt, 256-bit key). The APK wrapped
 * that JSON with Android KeyStore AES-GCM; the web client stores the same
 * record in localStorage. Session unlock stays in sessionStorage.
 *
 * This is not a second account. Supabase remains authentication.
 */

export const PIN_LENGTE = 4;
export const CODE_LENGTE = 4;
export const MINIMUM_LENGTE = 3;
export const ITERATIONS = 120_000;
const SEPARATOR = '\u001f';
const RECORD_SLEUTEL = 'axe_particle_gesture_lock';
const OPEN_SLEUTEL = 'axe_android_unlocked';
/** Oude keypad-hashes — wissen zodat ze niet naast de echte code blijven staan. */
const OUD_HASH = 'axe_android_pin_hash';
const OUD_SALT = 'axe_android_pin_salt';

export type PinOpslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type Record = {
  salt: string;
  hash: string;
  length: number;
  iterations: number;
  failedAttempts: number;
  lockedUntil: number;
};

export type PinCheck =
  | { ok: true }
  | { ok: false; fout: string };

function bytesNaarB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

function b64NaarBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function secret(gestures: string[]): string {
  return gestures.join(SEPARATOR);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltAb = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltAb).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltAb, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function lockoutMillis(failedAttempts: number): number | null {
  if (failedAttempts < 5) return null;
  if (failedAttempts === 5) return 60_000;
  if (failedAttempts === 6) return 300_000;
  if (failedAttempts === 7) return 900_000;
  return 3_600_000;
}

function load(opslag: PinOpslag): Record | null {
  try {
    const raw = opslag.getItem(RECORD_SLEUTEL);
    if (!raw) return null;
    const j = JSON.parse(raw) as Record;
    if (!j.salt || !j.hash || typeof j.length !== 'number') return null;
    return j;
  } catch {
    return null;
  }
}

function save(opslag: PinOpslag, rec: Record): void {
  opslag.setItem(RECORD_SLEUTEL, JSON.stringify(rec));
}

export function pinIsGezet(opslag: PinOpslag = localStorage): boolean {
  return load(opslag) != null;
}

export function codeLengte(opslag: PinOpslag = localStorage): number {
  return load(opslag)?.length ?? CODE_LENGTE;
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
    opslag.removeItem(RECORD_SLEUTEL);
    opslag.removeItem(OUD_HASH);
    opslag.removeItem(OUD_SALT);
  } catch { /* */ }
  vergrendel(sessie);
}

export function androidSlotLaatDoor(path: string): boolean {
  return path === '/lock' || path === '/lock/pin' || path === '/login';
}

export function codeGeldig(gestures: string[]): boolean {
  return gestures.length >= MINIMUM_LENGTE && gestures.every((g) => g.length > 0);
}

export async function zetPin(
  gestures: string[],
  opslag: PinOpslag = localStorage,
): Promise<{ ok: boolean; fout: string | null }> {
  if (gestures.length < MINIMUM_LENGTE) {
    return { ok: false, fout: `Code too short (min ${MINIMUM_LENGTE})` };
  }
  if (!codeGeldig(gestures)) return { ok: false, fout: 'Invalid code' };
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(secret(gestures), salt, ITERATIONS);
  try {
    opslag.removeItem(OUD_HASH);
    opslag.removeItem(OUD_SALT);
    save(opslag, {
      salt: bytesNaarB64(salt),
      hash: bytesNaarB64(hash),
      length: gestures.length,
      iterations: ITERATIONS,
      failedAttempts: 0,
      lockedUntil: 0,
    });
  } catch {
    return { ok: false, fout: 'could not store PIN' };
  }
  return { ok: true, fout: null };
}

export async function verifieerCode(
  gestures: string[],
  opslag: PinOpslag = localStorage,
): Promise<PinCheck> {
  const rec = load(opslag);
  if (!rec) return { ok: false, fout: 'No code set yet' };
  const now = Date.now();
  if (rec.lockedUntil > now) {
    const s = Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000));
    return { ok: false, fout: s < 60 ? `Too many attempts — ${s} s` : `Too many attempts — ${Math.ceil(s / 60)} min` };
  }
  const candidate = await pbkdf2(secret(gestures), b64NaarBytes(rec.salt), rec.iterations || ITERATIONS);
  if (constantTimeEquals(candidate, b64NaarBytes(rec.hash))) {
    save(opslag, { ...rec, failedAttempts: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const attempts = rec.failedAttempts + 1;
  const wait = lockoutMillis(attempts);
  save(opslag, { ...rec, failedAttempts: attempts, lockedUntil: wait ? now + wait : 0 });
  return { ok: false, fout: 'Wrong code' };
}

export async function pinKlopt(gestures: string[], opslag: PinOpslag = localStorage): Promise<boolean> {
  return (await verifieerCode(gestures, opslag)).ok;
}
