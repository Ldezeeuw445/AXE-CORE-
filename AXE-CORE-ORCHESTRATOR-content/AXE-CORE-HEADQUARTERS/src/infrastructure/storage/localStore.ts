/**
 * infrastructure/storage/localStore.ts
 *
 * Safe, typed access to localStorage. Every read/write in the app should go
 * through these helpers instead of hand-rolled try/catch + JSON.parse blocks
 * (that pattern was previously duplicated in 30+ files). All failures —
 * storage unavailable, quota exceeded, corrupt JSON — degrade to the fallback
 * value instead of throwing.
 */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable or quota exceeded — non-fatal */ }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* non-fatal */ }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* non-fatal */ }
}
