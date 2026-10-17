/**
 * Telefoon-PIN — PBKDF2-record, sessie-ontgrendeling, geen tweede account.
 *
 * Ontworpen pad (Luka, 17 okt): native lockscreen → swipe → /mobile
 * (TelefoonSphere). Geen keypad in de flow. Dit bestand blijft liggen voor
 * het geval er ooit een cijfer-PIN is gezet; standaard staat er geen, en
 * `telefoonPinNodig` is dan false. Niet uitbreiden (geen setup-UI, geen
 * Settings-PIN) tot Luka dat expliciet vraagt.
 *
 * Een oud particle-gebaar telt niet als ingestelde PIN. Opslag die faalt =
 * geen PIN nodig, nooit een doodlopend slot.
 *
 * Zelfde crypto als het Samsung-record (PBKDF2-HMAC-SHA256, 120000, 32-byte
 * salt). Tests injecteren memory-Storage. Session unlock blijft sessionStorage.
 * Supabase blijft authenticatie.
 */

import {
  nativeLeesRecord,
  nativeSchrijfRecord,
  nativeWisRecord,
  OPSLAG_DICHT,
  RECORD_SLEUTEL,
  OUD_HASH,
  OUD_SALT,
  wisWebPinRest,
  type PinOpslag,
} from './gestureLockNative';

export { RECORD_SLEUTEL, OPSLAG_DICHT };
export type { PinOpslag };

export const PIN_LENGTE = 4;
export const CODE_LENGTE = 4;
export const MINIMUM_LENGTE = 3;
/** Geen PIN gezet = swipe gaat naar Home. Keypad-code blijft, maar staat uit. */
export const PIN_STANDAARD_UIT = true;
export const ITERATIONS = 120_000;
export const SOORT_SLEUTEL = 'axe_android_pin_soort';
const SEPARATOR = '\u001f';
const OPEN_SLEUTEL = 'axe_android_unlocked';
const TERUG_SLEUTEL = 'axe_android_return';
/** Na ontgrendelen: de telefoon-Home, nooit desktop-Home (tweede particle-bol). */
export const SCHIL_START = '/mobile';

export type PinSoort = 'numeric' | 'gesture';

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

function parseRecord(raw: string | null): Record | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record;
    if (!j.salt || !j.hash || typeof j.length !== 'number') return null;
    return j;
  } catch {
    return null;
  }
}

async function load(opslag?: PinOpslag): Promise<Record | null> {
  if (opslag) return parseRecord(opslag.getItem(RECORD_SLEUTEL));
  const raw = await nativeLeesRecord();
  const rec = parseRecord(raw);
  if (raw != null && rec == null) throw new Error(OPSLAG_DICHT);
  return rec;
}

async function save(rec: Record, opslag?: PinOpslag): Promise<void> {
  const raw = JSON.stringify(rec);
  if (opslag) {
    opslag.setItem(RECORD_SLEUTEL, raw);
    return;
  }
  await nativeSchrijfRecord(raw);
}

export async function pinIsGezet(opslag?: PinOpslag): Promise<boolean> {
  return (await load(opslag)) != null;
}

export async function codeLengte(opslag?: PinOpslag): Promise<number> {
  return (await load(opslag))?.length ?? CODE_LENGTE;
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

export async function wisPin(opslag?: PinOpslag, sessie: PinOpslag = sessionStorage): Promise<void> {
  if (opslag) {
    try {
      opslag.removeItem(RECORD_SLEUTEL);
      opslag.removeItem(OUD_HASH);
      opslag.removeItem(OUD_SALT);
      opslag.removeItem(SOORT_SLEUTEL);
    } catch { /* */ }
  } else {
    await nativeWisRecord();
    wisSoort();
  }
  wisWebPinRest(opslag);
  vergrendel(sessie);
}

export function androidSlotLaatDoor(path: string): boolean {
  return path === '/lock' || path === '/lock/pin' || path === '/login';
}

/** Alleen het cijfer-pad mag de schil tegenhouden. Glance-lock is geen PIN. */
export function androidPinPad(path: string): boolean {
  return path === '/lock/pin' || path === '/login';
}

export function isCijferReeks(deel: string[]): boolean {
  return deel.length >= PIN_LENGTE && deel.every((d) => /^[0-9]$/.test(d));
}

function soortOpslag(opslag?: PinOpslag): PinOpslag | null {
  if (opslag) return opslag;
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function leesPinSoort(opslag?: PinOpslag): PinSoort | null {
  try {
    const raw = soortOpslag(opslag)?.getItem(SOORT_SLEUTEL);
    if (raw === 'numeric' || raw === 'gesture') return raw;
  } catch { /* private mode */ }
  return null;
}

function schrijfPinSoort(soort: PinSoort, opslag?: PinOpslag): void {
  try { soortOpslag(opslag)?.setItem(SOORT_SLEUTEL, soort); } catch { /* private mode */ }
}

function wisSoort(opslag?: PinOpslag): void {
  try { soortOpslag(opslag)?.removeItem(SOORT_SLEUTEL); } catch { /* private mode */ }
}

/**
 * Alleen een werkende cijfer-PIN mag het keypad tonen.
 * Standaard (geen record): false — swipe opent Home.
 * Gebaar-restant, lege opslag of KeyStore-fout: false.
 */
export async function telefoonPinNodig(opslag?: PinOpslag): Promise<boolean> {
  try {
    if (!(await pinIsGezet(opslag))) return false;
    return leesPinSoort(opslag) === 'numeric';
  } catch {
    return false;
  }
}

function padIsSchil(path: string): boolean {
  return path.startsWith('/') && !androidSlotLaatDoor(path);
}

/** Onthoudt de tab onder het slot, zodat unlock de schil terugzet. */
export function bewaarTerugPad(path: string, sessie: PinOpslag = sessionStorage): void {
  if (!padIsSchil(path)) return;
  try { sessie.setItem(TERUG_SLEUTEL, path); } catch { /* private mode */ }
}

export function naOntgrendelenPad(sessie: PinOpslag = sessionStorage): string {
  try {
    const p = sessie.getItem(TERUG_SLEUTEL);
    if (p && padIsSchil(p)) return p === '/' ? SCHIL_START : p;
  } catch { /* private mode */ }
  return SCHIL_START;
}

function codeGeldig(gestures: string[]): boolean {
  return gestures.length >= MINIMUM_LENGTE && gestures.every((g) => g.length > 0);
}

export async function zetPin(
  gestures: string[],
  opslag?: PinOpslag,
): Promise<{ ok: boolean; fout: string | null }> {
  if (gestures.length < MINIMUM_LENGTE) {
    return { ok: false, fout: `Code too short (min ${MINIMUM_LENGTE})` };
  }
  if (!codeGeldig(gestures)) return { ok: false, fout: 'Invalid code' };
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(secret(gestures), salt, ITERATIONS);
  try {
    if (opslag) {
      try {
        opslag.removeItem(OUD_HASH);
        opslag.removeItem(OUD_SALT);
      } catch { /* */ }
    } else {
      wisWebPinRest();
    }
    await save({
      salt: bytesNaarB64(salt),
      hash: bytesNaarB64(hash),
      length: gestures.length,
      iterations: ITERATIONS,
      failedAttempts: 0,
      lockedUntil: 0,
    }, opslag);
    schrijfPinSoort(isCijferReeks(gestures) ? 'numeric' : 'gesture', opslag);
  } catch {
    return { ok: false, fout: OPSLAG_DICHT };
  }
  return { ok: true, fout: null };
}

export async function zetCijferPin(
  pin: string,
  opslag?: PinOpslag,
): Promise<{ ok: boolean; fout: string | null }> {
  const deel = pin.split('');
  if (!isCijferReeks(deel)) {
    return { ok: false, fout: `PIN must be ${PIN_LENGTE}+ digits` };
  }
  return zetPin(deel, opslag);
}

export async function verifieerCijfers(pin: string, opslag?: PinOpslag): Promise<PinCheck> {
  const deel = pin.split('');
  if (!isCijferReeks(deel)) return { ok: false, fout: 'Invalid PIN' };
  return verifieerCode(deel, opslag);
}

export async function verifieerCode(
  gestures: string[],
  opslag?: PinOpslag,
): Promise<PinCheck> {
  let rec: Record | null;
  try {
    rec = await load(opslag);
  } catch {
    return { ok: false, fout: OPSLAG_DICHT };
  }
  if (!rec) return { ok: false, fout: 'No code set yet' };
  const now = Date.now();
  if (rec.lockedUntil > now) {
    const s = Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000));
    return { ok: false, fout: s < 60 ? `Too many attempts — ${s} s` : `Too many attempts — ${Math.ceil(s / 60)} min` };
  }
  const candidate = await pbkdf2(secret(gestures), b64NaarBytes(rec.salt), rec.iterations || ITERATIONS);
  try {
    if (constantTimeEquals(candidate, b64NaarBytes(rec.hash))) {
      await save({ ...rec, failedAttempts: 0, lockedUntil: 0 }, opslag);
      return { ok: true };
    }
    const attempts = rec.failedAttempts + 1;
    const wait = lockoutMillis(attempts);
    await save({ ...rec, failedAttempts: attempts, lockedUntil: wait ? now + wait : 0 }, opslag);
    return { ok: false, fout: 'Wrong code' };
  } catch {
    return { ok: false, fout: OPSLAG_DICHT };
  }
}

export async function pinKlopt(gestures: string[], opslag?: PinOpslag): Promise<boolean> {
  return (await verifieerCode(gestures, opslag)).ok;
}
