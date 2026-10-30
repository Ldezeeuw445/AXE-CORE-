/**
 * De sleutel voor de Ollama-box (`ollama.axecompanion.com`).
 *
 * Die stond op Hetzner tot 1 oktober 2026 en staat sindsdien op een tweede
 * Strato. De hostnaam is dezelfde gebleven, dus er is hier niets te wijzigen:
 * de omschakeling is een A-record. Daarom staat die naam hieronder ook maar op
 * één plek -- twee plekken en één verhuizing is één vergeten plek.
 *
 * Tot 13 september was `ollama.axecompanion.com` voor iedereen op internet
 * bruikbaar -- modellen draaien, en tot die dag ook downloaden en verwijderen.
 * nginx laat nu door: Strato (op IP) en verzoeken met deze sleutel. Eerst in
 * meet-modus (alleen gelogd), daarna dicht.
 *
 * De sleutel staat NIET in de bundel. Je zet hem in Instellingen bij Ollama
 * (veld "key"), per apparaat; hij komt uit AXE-VAULT als OLLAMA_PROXY_KEY.
 *
 * Alleen naar de externe box. Je eigen Ollama op localhost krijgt hem nooit:
 * een sleutel die de machine niet uit hoeft, hoort hem niet te verlaten.
 */
import { loadConnectionOverrides } from '@/domain/providers';
import { VPS_API_ORIGIN, vpsAuthHeaders } from '@/infrastructure/config/apiUrl';

const EXTERNE_OLLAMA = 'ollama.axecompanion.com';

/**
 * De modelbox via de AXE-API op de VPS (backend/axe_api/modelbox.py).
 *
 * Sinds het slot (2 okt) wil de box per toestel een sleutel, en die stond op
 * geen enkel toestel: Ollama en Hermes stonden overal op "Failed". De VPS komt
 * er wel zonder sleutel in, en de app heeft de AXE-sleutel al. Dus: geen eigen
 * sleutel op dit toestel, wel de AXE-sleutel (Tauri, Android) -> via de VPS.
 */
export const OLLAMA_VIA_VPS = `${VPS_API_ORIGIN}/ollama`;

function eigenSleutel(): string {
  return loadConnectionOverrides('ollama').key?.trim() ?? '';
}

/**
 * Het adres waar een aanroep naar de box echt heen gaat. Pad en query blijven
 * staan; alles wat niet de externe box is komt ongewijzigd terug.
 */
export function ollamaUrl(url: string): string {
  if (!isExterneOllama(url) || eigenSleutel()) return url;
  if (!Object.keys(vpsAuthHeaders(`${OLLAMA_VIA_VPS}/api/tags`)).length) return url;
  try {
    const u = new URL(url);
    return `${OLLAMA_VIA_VPS}${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function isExterneOllama(url: string): boolean {
  try {
    return new URL(url).hostname === EXTERNE_OLLAMA;
  } catch {
    return false;
  }
}

/** Authorization voor dit adres, of niets. Nooit een uitzondering. */
export function ollamaHeaders(url: string): Record<string, string> {
  if (url === OLLAMA_VIA_VPS || url.startsWith(`${OLLAMA_VIA_VPS}/`)) return vpsAuthHeaders(url);
  if (!isExterneOllama(url)) return {};
  const sleutel = eigenSleutel();
  return sleutel ? { Authorization: `Bearer ${sleutel}` } : {};
}
