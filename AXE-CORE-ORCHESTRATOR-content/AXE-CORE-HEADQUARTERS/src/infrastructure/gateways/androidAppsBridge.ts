/**
 * androidAppsBridge — opening real apps on the Samsung from the Apps tab.
 *
 * A URL cannot do this. Ledger, Tangem and a banking app have no web version
 * worth opening: a link lands on a marketing page, not on the app. So the tab
 * needs the Android package name and `startActivity`, which only exists inside
 * the Kotlin shell (`AxeAndroidBridge` in AxeWebView.kt, exposed to the WebView
 * as `__AXE_ANDROID__`).
 *
 * Everywhere else — the Tauri desktop app, a normal browser tab — none of this
 * is present, and that is not a failure. `androidShellAvailable()` is how the
 * page tells "not on the phone" apart from "broken on the phone", so it can
 * hide a button rather than offer one that silently does nothing.
 */

interface AndroidAppsBridgeShape {
  /** Launch by package name. False when the app is not installed. */
  openApp?: (packageName: string) => boolean;
  /** Is it installed? Lets a tile be greyed out instead of lying. */
  hasApp?: (packageName: string) => boolean;
  /** The phone's own home screen — where the AXE widgets live. */
  openHomeScreen?: () => boolean;
}

function bridge(): AndroidAppsBridgeShape | null {
  if (typeof window === 'undefined') return null;
  const b = (window as unknown as Record<string, unknown>).__AXE_ANDROID__;
  return (b as AndroidAppsBridgeShape) ?? null;
}

/** True only inside the Android shell, and only once the app methods exist. */
export function androidShellAvailable(): boolean {
  const b = bridge();
  return Boolean(b?.openApp && b?.hasApp);
}

/**
 * Is this package installed on the phone?
 *
 * Returns false off-device too, so a caller never has to special-case the
 * platform. The bridge call is synchronous — it is a direct JNI hop into
 * PackageManager, not a network round trip — but it is wrapped anyway: a
 * throwing bridge method must not take the whole tab down with it.
 */
export function isAppInstalled(packageName: string): boolean {
  if (!packageName) return false;
  try {
    return bridge()?.hasApp?.(packageName) ?? false;
  } catch {
    return false;
  }
}

/**
 * Launch an installed app. Returns false when it is not installed or the
 * launch was refused, so the caller can say which rather than assuming.
 */
export function openAndroidApp(packageName: string): boolean {
  if (!packageName) return false;
  try {
    return bridge()?.openApp?.(packageName) ?? false;
  } catch {
    return false;
  }
}

/** Jump to the phone's home screen, where the AXE widgets are. */
export function openPhoneHomeScreen(): boolean {
  try {
    return bridge()?.openHomeScreen?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Packages worth suggesting when adding an app by hand.
 *
 * Typing `com.ledger.live` from memory is not something anyone should have to
 * do, and a typo here fails silently — `getLaunchIntentForPackage` simply
 * returns null for a package that does not exist, which is indistinguishable
 * from "not installed". A short list of the ones Luka actually named removes
 * that whole class of mistake for the common cases; anything else can still be
 * typed in full.
 */
export const KNOWN_PACKAGES: { label: string; packageName: string }[] = [
  { label: 'Ledger Live', packageName: 'com.ledger.live' },
  { label: 'Tangem', packageName: 'com.tangem.wallet' },
  { label: 'ING', packageName: 'com.ing.mobile' },
  { label: 'ABN AMRO', packageName: 'com.abnamro.nl.mobile.payments' },
  { label: 'Rabobank', packageName: 'nl.rabomobiel' },
  { label: 'bunq', packageName: 'com.bunq.android' },
  { label: 'Revolut', packageName: 'com.revolut.revolut' },
  { label: 'Coinbase', packageName: 'com.coinbase.android' },
  { label: 'Kraken', packageName: 'com.kraken.invest.app' },
  { label: 'WhatsApp', packageName: 'com.whatsapp' },
  { label: 'Gmail', packageName: 'com.google.android.gm' },
  { label: 'Obsidian', packageName: 'md.obsidian' },
];
