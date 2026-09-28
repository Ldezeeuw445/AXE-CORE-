import { aiProxyUrl, vpsAuthHeaders } from '@/infrastructure/config/apiUrl';

/** Waar de chat leest welke providers de VPS met zijn eigen sleutel bedient. */
export const SERVER_PROVIDERS_KEY = 'axe_server_providers';

/**
 * Haalt op welke providers de VPS zelf bedient, en bewaart dat voor de chat.
 *
 * De chat neemt een provider zonder sleutel op dit toestel alleen mee als hij
 * in deze lijst staat (voiceStore.getProviderKeySlot). Tot 28 sep vulde alleen
 * het instellingenscherm hem, via /api/proxy/ai/providers op het domein -- een
 * proxy die sinds 27 sep niet meer draaide. Op de telefoon was de lijst dus
 * leeg, viel Groq en OpenAI weg, en probeerde AXE alleen Gemini (tegoed op),
 * Ollama en OpenRouter (tegoed op): "AXE Core is temporarily unavailable".
 *
 * Nu via aiProxyUrl(), dezelfde weg als de chat zelf, en ook bij het opstarten.
 * Een fout of een niet-JSON-antwoord laat de bewaarde lijst staan: een haperende
 * server mag werkende providers niet uit de chat vegen.
 */
export async function haalServerProviders(): Promise<string[] | null> {
  const url = `${aiProxyUrl()}/providers`;
  try {
    const res = await fetch(url, { headers: vpsAuthHeaders(url), signal: AbortSignal.timeout(10_000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const body = (await res.json()) as { providers?: string[]; keyless?: string[] };
    const bediend = [...(body.providers ?? []), ...(body.keyless ?? [])];
    try { localStorage.setItem(SERVER_PROVIDERS_KEY, JSON.stringify(bediend)); } catch { /* cache is optioneel */ }
    return bediend;
  } catch {
    return null;
  }
}
