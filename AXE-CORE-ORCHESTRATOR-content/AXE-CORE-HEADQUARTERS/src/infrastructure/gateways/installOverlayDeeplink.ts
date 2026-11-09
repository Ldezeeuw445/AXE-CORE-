/**
 * Overlay → HQ deeplink: de standalone notch schrijft `~/.axe/overlay-open-route`
 * (alleen /northsea of /trading) en activeert daarna com.axe.core. Deze poller
 * leest + wist het bestand via Rust en zet de HashRouter-hash.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

const POLL_MS = 700;

const NOTCH_ROUTES = new Set(['/managers', '/northsea', '/trading']);

export function installOverlayDeeplink(): void {
  if (!isTauriRuntime()) return;
  // De notch (eigen venster) vraagt het hoofdvenster een tab te openen.
  // Alleen het hoofdvenster: het notch-venster laadt dezelfde code en zou
  // anders zelf naar die tab springen.
  void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    if (getCurrentWindow().label !== 'main') return;
    return import('@tauri-apps/api/event').then(({ listen }) => listen<string>('axe://open-route', async (e) => {
    if (!NOTCH_ROUTES.has(e.payload)) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('show_main_window').catch(() => undefined);
    } catch { /* */ }
    window.location.hash = `#${e.payload}`;
    }));
  }).catch(() => undefined);
  let bezig = false;
  const tick = async () => {
    if (bezig) return;
    bezig = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const route = await invoke<string | null>('consume_overlay_open_route');
      if (route !== '/northsea' && route !== '/trading') return;
      await invoke('show_main_window').catch(() => undefined);
      window.location.hash = `#${route}`;
    } catch {
      /* oudere binary zonder command — stil blijven */
    } finally {
      bezig = false;
    }
  };
  void tick();
  window.setInterval(() => void tick(), POLL_MS);
}
