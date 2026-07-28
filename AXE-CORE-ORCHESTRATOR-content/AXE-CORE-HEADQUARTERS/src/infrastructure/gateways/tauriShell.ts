/** Small Tauri helpers used from the web UI. */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

export async function showMainWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('show_main_window');
  } catch {
    /* ignore */
  }
}
