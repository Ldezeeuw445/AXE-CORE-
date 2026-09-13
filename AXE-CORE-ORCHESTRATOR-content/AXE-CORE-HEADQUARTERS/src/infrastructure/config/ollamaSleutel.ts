/**
 * De sleutel voor de Ollama-box op Hetzner.
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

const EXTERNE_OLLAMA = 'ollama.axecompanion.com';

export function isExterneOllama(url: string): boolean {
  try {
    return new URL(url).hostname === EXTERNE_OLLAMA;
  } catch {
    return false;
  }
}

/** Authorization voor dit adres, of niets. Nooit een uitzondering. */
export function ollamaHeaders(url: string): Record<string, string> {
  if (!isExterneOllama(url)) return {};
  const sleutel = loadConnectionOverrides('ollama').key?.trim();
  return sleutel ? { Authorization: `Bearer ${sleutel}` } : {};
}
