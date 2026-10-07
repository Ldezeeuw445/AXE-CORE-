/**
 * androidPhoneBridge — the settings that only exist on the phone itself.
 *
 * The lock screen is native Kotlin, not web, so what it shows cannot be changed by the
 * web app directly. These calls reach `AxeAndroidBridge` (AxeWebView.kt); in the Tauri
 * app and in a browser none of it exists and every function answers "not here" instead
 * of throwing, so the Phone panel can simply not render.
 */

export interface LockCardSetting {
  id: string;
  label: string;
  on: boolean;
}

interface Shape {
  lockCards?: () => string;
  setLockCard?: (id: string, on: boolean) => void;
  isDeviceOwner?: () => boolean;
  openHomeScreen?: () => boolean;
  setLockWallpaper?: (kind: string, value: string, dim: number, blur: number) => void;
  selectTab?: (name: string) => void;
  setLockLook?: (look: string) => void;
}

function bridge(): Shape | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as Record<string, unknown>).__AXE_ANDROID__ as Shape) ?? null;
}

/** True only inside the Android shell with the phone-settings methods present. */
export function phoneSettingsAvailable(): boolean {
  return typeof bridge()?.lockCards === 'function';
}

export function readLockCards(): LockCardSetting[] {
  try {
    const raw = bridge()?.lockCards?.();
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((c): c is LockCardSetting => typeof c?.id === 'string' && typeof c?.label === 'string')
          .map(c => ({ id: c.id, label: c.label, on: c.on !== false }))
      : [];
  } catch {
    return [];
  }
}

export function writeLockCard(id: string, on: boolean): void {
  try { bridge()?.setLockCard?.(id, on); } catch { /* the toggle re-reads, so a failure shows */ }
}

export function readDeviceOwner(): boolean {
  try { return bridge()?.isDeviceOwner?.() ?? false; } catch { return false; }
}

export function openPhoneHome(): boolean {
  try { return bridge()?.openHomeScreen?.() ?? false; } catch { return false; }
}

/**
 * Tell the shell which wallpaper the lock screen should show, so it matches the app.
 *
 * The lock screen is native and cannot read the web app's localStorage, so every change (and the
 * first start) is pushed over. `kind` is "none", "preset" (value = preset id) or "photo"
 * (value = the data-URL the user picked); dim and blur are the Appearance sliders.
 */
export function syncLockWallpaper(kind: 'none' | 'preset' | 'photo', value: string, dim: number, blur: number): void {
  try { bridge()?.setLockWallpaper?.(kind, value, dim, blur); } catch { /* the lock screen keeps its last look */ }
}

/** The native tabs of the Android shell, in the order they are offered. */
export const NATIVE_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'CORE', label: 'AXE' },
  { id: 'CHART', label: 'Chart' },
  { id: 'ALGO', label: 'Algo' },
  { id: 'WEB', label: 'Web' },
  { id: 'CODE', label: 'Code' },
  { id: 'APPS', label: 'Apps' },
];

/** True inside the Android shell, which has no bottom bar: its tabs are switched from the menu. */
export function nativeTabsAvailable(): boolean {
  return typeof bridge()?.selectTab === 'function';
}

export function selectNativeTab(id: string): void {
  try { bridge()?.selectTab?.(id); } catch { /* the menu stays open, so a miss is visible */ }
}

/** The app's dark ("black") or light ("glass") mode, so the lock screen's plate is the same one. */
export function syncLockLook(look: 'black' | 'glass'): void {
  try { bridge()?.setLockLook?.(look); } catch { /* the lock screen keeps its last look */ }
}
