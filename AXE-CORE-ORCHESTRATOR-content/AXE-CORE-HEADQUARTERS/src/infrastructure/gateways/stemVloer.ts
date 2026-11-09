/**
 * ADR-01 "Eén stem in de kamer": mag DIT apparaat luisteren?
 *
 * Hoort zowel de Mac mini als de iMac "hey AXE" (of drie klappen), dan
 * claimen ze allebei en kiest de VPS er één: waar Luka het laatst typte of
 * klikte, anders de vaste volgorde. Zie backend/axe_api/stem_vloer.py.
 *
 * Nooit stil door een fout: geen VPS, te traag of iets onverwachts betekent
 * "luister" -- het gedrag van voor ADR-01.
 */
import { claimStemVloer, type StemVloerBesluit } from '@/infrastructure/gateways/axeCoreApiService';
import { ditToestel } from '@/infrastructure/gateways/axeDeviceService';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

const TIJDSLIMIET_MS = 1500;
export const STEM_VLOER_EVT = 'axe-stem-vloer';

async function idleSeconden(): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const s = await invoke<number | null>('systeem_idle_s');
    return typeof s === 'number' && Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

export async function magLuisteren(trigger: 'wake' | 'clap'): Promise<StemVloerBesluit> {
  const luister: StemVloerBesluit = { winner: true, reden: 'fallback' };
  try {
    const [toestel, idle] = await Promise.all([ditToestel(), idleSeconden()]);
    const besluit = await Promise.race<StemVloerBesluit>([
      claimStemVloer({ device_id: toestel.device_id, device_name: toestel.device_name, trigger, idle_s: idle }),
      new Promise<StemVloerBesluit>((klaar) => setTimeout(() => klaar(luister), TIJDSLIMIET_MS)),
    ]);
    if (!besluit.winner) {
      // De notch/Home kan "Listening on <naam>" tonen; dit apparaat blijft stil.
      try { globalThis.dispatchEvent?.(new CustomEvent(STEM_VLOER_EVT, { detail: besluit })); } catch { /* */ }
    }
    return besluit;
  } catch {
    return luister;
  }
}
