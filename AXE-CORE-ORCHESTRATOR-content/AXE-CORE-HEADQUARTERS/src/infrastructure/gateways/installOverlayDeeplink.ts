/**
 * Overlay → HQ deeplink: de standalone notch schrijft `~/.axe/overlay-open-route`
 * (alleen /northsea of /trading) en activeert daarna com.axe.core. Deze poller
 * leest + wist het bestand via Rust en zet de HashRouter-hash.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

const POLL_MS = 700;

export function installOverlayDeeplink(): void {
  if (!isTauriRuntime()) return;
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
