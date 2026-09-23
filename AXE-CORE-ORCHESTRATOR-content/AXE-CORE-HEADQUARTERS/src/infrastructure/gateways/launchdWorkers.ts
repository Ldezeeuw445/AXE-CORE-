/**
 * launchdWorkers — herstart de launchd-agents die AXE's eigen workers zijn.
 *
 * Anders dan de twee diensten in `diensten.ts` (shell-server, lokale API,
 * kind-processen van deze app) zijn `com.axe.computer-worker` en
 * `com.axe.browser-agent` launchd-agents die al draaien voordat AXE CORE
 * opent en die door moeten blijven draaien nadat de app weer dicht is. Het
 * echte werk staat in src-tauri/src/launchd.rs; dit bestand is alleen de
 * dunne brug ernaartoe, met dezelfde `beschikbaar()`-wachter als diensten.ts
 * omdat dit buiten Tauri (de webbouw) net zo min bestaat.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/** De enige twee ids die de Rust-kant kent — zie BEHEERD in launchd.rs. */
export type LaunchdWorkerId = 'computer-worker' | 'browser-agent';

export interface LaunchdStand {
  id: string;
  label: string;
  running: boolean;
  detail: string;
}

export function beschikbaar(): boolean {
  return isTauriRuntime();
}

async function roep<T>(naam: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(naam, args);
}

export async function workerDienstStand(id: LaunchdWorkerId): Promise<LaunchdStand | null> {
  if (!beschikbaar()) return null;
  try {
    return await roep<LaunchdStand>('worker_dienst_stand', { id });
  } catch {
    // Oude bouw kent dit commando nog niet, of het label bestaat niet op deze
    // Mac (bijv. AXE CORE draait op de iMac terwijl de worker op de Mac Mini
    // hoort). Beide zijn "kan hier niet vaststellen", niet een storing.
    return null;
  }
}

export async function workerDienstHerstart(id: LaunchdWorkerId): Promise<string> {
  return roep<string>('worker_dienst_herstart', { id });
}
