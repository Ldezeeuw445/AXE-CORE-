/**
 * Staat dit AXE-venster echt vooraan op de Mac?
 *
 * `document.hasFocus()` blijft in WKWebView (Tauri op macOS) true als je naar
 * een andere app gaat (gemeten 18 nov bij het wekwoord). Wie daarop pauzeert,
 * pauzeert nooit: de bol tekende zo 30 beelden per seconde door terwijl Luka
 * elders werkte -- 20 nov op de iMac ~57% CPU voor de webview (BOUWLIJST
 * "Beide Macs traag"). Hier telt de vensterfocus van macOS zelf.
 *
 * Buiten Tauri (browser, telefoon): gewoon document.hasFocus().
 */
let focus: boolean | null = null;
let gestart = false;

function start(): void {
  if (gestart || typeof window === 'undefined') return;
  gestart = true;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
  if (!w.__TAURI_INTERNALS__) return;
  void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
    const venster = getCurrentWindow();
    try { focus = await venster.isFocused(); } catch { /* laat null: valt terug op hasFocus */ }
    await venster.onFocusChanged(({ payload }) => { focus = payload; });
  }).catch(() => { /* geen Tauri-venster */ });
}

export function heeftEchteFocus(): boolean {
  start();
  if (focus !== null) return focus;
  return typeof document === 'undefined' ? true : document.hasFocus();
}
