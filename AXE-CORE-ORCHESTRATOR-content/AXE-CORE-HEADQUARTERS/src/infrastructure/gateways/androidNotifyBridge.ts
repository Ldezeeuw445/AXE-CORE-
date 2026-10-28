/**
 * Native shade-notifications on the Android Device Manager shell.
 *
 * Methods live on `__AXE_ANDROID__` (AxePush.kt in axe-core-android). Off-device
 * every call is a no-op so Playwright, the PWA and the Mac app stay quiet.
 *
 * `notify` posts immediately while the WebView is alive. `setNotifyPoll` hands
 * a device token to WorkManager; the worker polls AXE Core API
 * `/device/notifications` (service_role achter de VPS), niet Supabase-anon.
 */
export interface NotifyPollSessie {
  apiOrigin: string;
  deviceToken: string;
  deviceId: string;
}

interface NotifyBridge {
  notify?: (title: string, body: string, id: string) => boolean;
  setNotifyPoll?: (json: string) => boolean;
  requestNotifyPermission?: () => boolean;
}

function bridge(): NotifyBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as Record<string, unknown>).__AXE_ANDROID__ as NotifyBridge) ?? null;
}

export function nativeNotifyAvailable(): boolean {
  return typeof bridge()?.notify === 'function';
}

export function nativeNotify(title: string, body: string, id = ''): boolean {
  try {
    return bridge()?.notify?.(title, body, id) ?? false;
  } catch {
    return false;
  }
}

export function setNotifyPoll(sessie: NotifyPollSessie): boolean {
  try {
    return bridge()?.setNotifyPoll?.(JSON.stringify(sessie)) ?? false;
  } catch {
    return false;
  }
}

export function vraagNotifyToestemming(): boolean {
  try {
    return bridge()?.requestNotifyPermission?.() ?? false;
  } catch {
    return false;
  }
}
