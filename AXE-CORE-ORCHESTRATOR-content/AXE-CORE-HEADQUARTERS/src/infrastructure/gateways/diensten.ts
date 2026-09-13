/**
 * De twee achtergronddiensten die AXE CORE zelf draait.
 *
 * De shell-server (4022) en de lokale API (8001) draaien in de voorgrond van
 * een terminalvenster. De app staat op dezelfde Mac en kan ze net zo goed zelf
 * starten -- dan hoef je geen twee vensters open te houden die je per ongeluk
 * kunt sluiten. Het echte werk staat in src-tauri/src/diensten.rs.
 *
 * Buiten Tauri (de webbouw) bestaat dit niet: daar draait de app niet op de
 * machine waar die diensten horen. `beschikbaar()` zegt dat, zodat het scherm
 * "kan hier niet" kan tonen in plaats van een lege lijst die op een storing
 * lijkt.
 */
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

export interface DienstStand {
  id: string;
  naam: string;
  waarvoor: string;
  poort: number;
  /** Luistert er iets op die poort -- door ons gestart of niet. */
  luistert: boolean;
  /** Of de APP het draaiende proces is. Zo niet, dan mag stoppen niet. */
  van_ons: boolean;
  log: string;
  repo: string;
}

export function beschikbaar(): boolean {
  return isTauriRuntime();
}

async function roep<T>(naam: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(naam, args);
}

export async function dienstenStand(): Promise<DienstStand[]> {
  if (!beschikbaar()) return [];
  try {
    return await roep<DienstStand[]>('diensten_stand');
  } catch {
    // Een oude bouw kent dit commando nog niet. Een lege lijst is dan eerlijker
    // dan een foutmelding: er is niets kapot, het bestaat er alleen niet.
    return [];
  }
}

export async function dienstStart(id: string): Promise<string> {
  return roep<string>('dienst_start', { id });
}

export async function dienstStop(id: string): Promise<string> {
  return roep<string>('dienst_stop', { id });
}
