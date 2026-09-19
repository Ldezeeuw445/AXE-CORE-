/**
 * Native brug voor het particle-gesture PBKDF2-record.
 *
 * Alleen load/save/clear. Geen generieke KV, geen gebarenreeks.
 * Restanten in WebView localStorage worden gewist zodat een oude
 * plaintext-record niet naast KeyStore blijft staan.
 */

export const RECORD_SLEUTEL = 'axe_particle_gesture_lock';
export const OUD_HASH = 'axe_android_pin_hash';
export const OUD_SALT = 'axe_android_pin_salt';
export const OPSLAG_DICHT = 'Secure storage unavailable';

const MAX_RECORD = 4096;

export type PinOpslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Zelfde toets als isAndroidTauriRuntime, hier lokaal zodat domain/ geen infrastructure importeert. */
export function opAndroidTauri(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  const tauri = w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined;
  return tauri && /Android/i.test(navigator.userAgent);
}

export function wisWebPinRest(opslag?: PinOpslag): void {
  const web = opslag ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!web) return;
  try {
    web.removeItem(RECORD_SLEUTEL);
    web.removeItem(OUD_HASH);
    web.removeItem(OUD_SALT);
  } catch { /* privémodus */ }
}

export function recordJsonGeldig(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RECORD) return false;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (!j || typeof j !== 'object' || Array.isArray(j)) return false;
    const keys = Object.keys(j);
    if (keys.length !== 6) return false;
    if (!('salt' in j) || !('hash' in j) || !('length' in j) ||
        !('iterations' in j) || !('failedAttempts' in j) || !('lockedUntil' in j)) {
      return false;
    }
    if (typeof j.salt !== 'string' || typeof j.hash !== 'string') return false;
    if (typeof j.length !== 'number' || j.length < 3 || j.length > 16) return false;
    if (typeof j.iterations !== 'number' || j.iterations < 120_000 || j.iterations > 1_000_000) return false;
    if (typeof j.failedAttempts !== 'number' || j.failedAttempts < 0) return false;
    if (typeof j.lockedUntil !== 'number' || j.lockedUntil < 0) return false;
    return true;
  } catch {
    return false;
  }
}

async function invokeNative<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!opAndroidTauri()) throw new Error(OPSLAG_DICHT);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return args === undefined ? await invoke<T>(cmd) : await invoke<T>(cmd, args);
  } catch {
    throw new Error(OPSLAG_DICHT);
  }
}

export async function nativeLeesRecord(): Promise<string | null> {
  wisWebPinRest();
  const raw = await invokeNative<string | null>('gesture_lock_load');
  if (raw == null) return null;
  if (!recordJsonGeldig(raw)) throw new Error(OPSLAG_DICHT);
  return raw;
}

export async function nativeSchrijfRecord(raw: string): Promise<void> {
  if (!recordJsonGeldig(raw)) throw new Error(OPSLAG_DICHT);
  wisWebPinRest();
  await invokeNative<void>('gesture_lock_save', { record: raw });
}

export async function nativeWisRecord(): Promise<void> {
  wisWebPinRest();
  await invokeNative<void>('gesture_lock_clear');
}
