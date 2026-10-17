/**
 * In-app browser on the Android shell: a real WebView on the phone, not the
 * Mac-mini / VPS screenshot proxy.
 *
 * Methods live on `__AXE_ANDROID__` (AxeWebView.kt in axe-core-android).
 * Off-device every call is a no-op so Playwright and the PWA can use an iframe.
 */
interface BrowseBridge {
  browseOpen?: (url: string) => boolean;
  browseBack?: () => boolean;
  browseForward?: () => boolean;
  browseReload?: () => boolean;
  browseClose?: () => boolean;
  browseCanGoBack?: () => boolean;
  browseCanGoForward?: () => boolean;
}

function bridge(): BrowseBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as Record<string, unknown>).__AXE_ANDROID__ as BrowseBridge) ?? null;
}

export function nativeBrowseAvailable(): boolean {
  return typeof bridge()?.browseOpen === 'function';
}

export function nativeBrowseOpen(url: string): boolean {
  try { return bridge()?.browseOpen?.(url) ?? false; } catch { return false; }
}

export function nativeBrowseBack(): boolean {
  try { return bridge()?.browseBack?.() ?? false; } catch { return false; }
}

export function nativeBrowseForward(): boolean {
  try { return bridge()?.browseForward?.() ?? false; } catch { return false; }
}

export function nativeBrowseReload(): boolean {
  try { return bridge()?.browseReload?.() ?? false; } catch { return false; }
}

export function nativeBrowseClose(): boolean {
  try { return bridge()?.browseClose?.() ?? false; } catch { return false; }
}

export const COMPANION_PACKAGE = 'com.axecompanion.app';
export const AXON_PACKAGE = 'com.axonmemory.app';
