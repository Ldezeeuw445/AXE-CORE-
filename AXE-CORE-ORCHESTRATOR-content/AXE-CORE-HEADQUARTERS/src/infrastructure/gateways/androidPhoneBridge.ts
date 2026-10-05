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
