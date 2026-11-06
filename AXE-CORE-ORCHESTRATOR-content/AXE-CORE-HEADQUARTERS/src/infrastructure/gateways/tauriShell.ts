/** Small Tauri helpers used from the web UI. */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/**
 * Toon het hoofdvenster zonder het toetsenbord over te nemen.
 *
 * Voor alles wat AXE uit zichzelf doet (de klap-detector, een wekwoord). Een
 * klapdetector die op toetsaanslagen afgaat zou anders bij elke zin die je op
 * een ander scherm typt AXE naar voren trekken. Oudere binaries kennen het
 * commando niet; dan liever niets dan alsnog de focus pakken.
 */
export async function showMainWindowQuietly(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('toon_hoofdvenster_stil');
  } catch {
    /* ignore */
  }
}
