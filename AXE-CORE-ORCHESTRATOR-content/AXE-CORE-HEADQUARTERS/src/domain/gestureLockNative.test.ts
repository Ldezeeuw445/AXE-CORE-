import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import {
  nativeLeesRecord,
  nativeSchrijfRecord,
  nativeWisRecord,
  recordJsonGeldig,
  RECORD_SLEUTEL,
  OPSLAG_DICHT,
  wisWebPinRest,
} from './gestureLockNative';

function webOpslag() {
  const bak = new Map<string, string>();
  const web: Storage = {
    get length() { return bak.size; },
    clear() { bak.clear(); },
    getItem(k) { return bak.has(k) ? bak.get(k)! : null; },
    setItem(k, v) { bak.set(k, String(v)); },
    removeItem(k) { bak.delete(k); },
    key(i) { return [...bak.keys()][i] ?? null; },
  };
  return { bak, web };
}

const geldig = JSON.stringify({
  salt: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  hash: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
  length: 4,
  iterations: 120000,
  failedAttempts: 0,
  lockedUntil: 0,
});

function alsAndroidTauri() {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 15)' });
}

describe('gesture-lock native brug', () => {
  const { bak, web } = webOpslag();

  beforeEach(() => {
    bak.clear();
    invoke.mockReset();
    alsAndroidTauri();
    vi.stubGlobal('localStorage', web);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keurt alleen het PBKDF2-record goed, geen gebarenreeks', () => {
    expect(recordJsonGeldig(geldig)).toBe(true);
    expect(recordJsonGeldig(JSON.stringify({ gestures: ['swipeRight', '1', 'check', 'triangle'] }))).toBe(false);
    expect(recordJsonGeldig('swipeRight')).toBe(false);
  });

  it('leest via invoke en veegt localStorage-restanten', async () => {
    web.setItem(RECORD_SLEUTEL, geldig);
    invoke.mockResolvedValue(geldig);
    await expect(nativeLeesRecord()).resolves.toBe(geldig);
    expect(invoke).toHaveBeenCalledWith('gesture_lock_load');
    expect(web.getItem(RECORD_SLEUTEL)).toBeNull();
  });

  it('schrijft niet naar localStorage', async () => {
    invoke.mockResolvedValue(undefined);
    await nativeSchrijfRecord(geldig);
    expect(invoke).toHaveBeenCalledWith('gesture_lock_save', { record: geldig });
    expect(bak.size).toBe(0);
  });

  it('faalt dicht als invoke weigert', async () => {
    invoke.mockRejectedValue(new Error('keystore'));
    await expect(nativeLeesRecord()).rejects.toThrow(OPSLAG_DICHT);
    await expect(nativeSchrijfRecord(geldig)).rejects.toThrow(OPSLAG_DICHT);
  });

  it('faalt dicht buiten Android-Tauri, zonder localStorage-schrijf', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' });
    await expect(nativeSchrijfRecord(geldig)).rejects.toThrow(OPSLAG_DICHT);
    expect(invoke).not.toHaveBeenCalled();
    expect(bak.size).toBe(0);
  });

  it('wisWebPinRest haalt oude keypad-sleutels weg', () => {
    web.setItem(RECORD_SLEUTEL, 'x');
    web.setItem('axe_android_pin_hash', 'h');
    web.setItem('axe_android_pin_salt', 's');
    wisWebPinRest();
    expect(web.getItem(RECORD_SLEUTEL)).toBeNull();
    expect(web.getItem('axe_android_pin_hash')).toBeNull();
    expect(web.getItem('axe_android_pin_salt')).toBeNull();
  });

  it('clear gaat via de beperkte command, niet via een KV-brug', async () => {
    invoke.mockResolvedValue(undefined);
    await nativeWisRecord();
    expect(invoke).toHaveBeenCalledWith('gesture_lock_clear');
    expect(invoke.mock.calls.some((c) => String(c[0]).includes('plugin:store'))).toBe(false);
  });
});
