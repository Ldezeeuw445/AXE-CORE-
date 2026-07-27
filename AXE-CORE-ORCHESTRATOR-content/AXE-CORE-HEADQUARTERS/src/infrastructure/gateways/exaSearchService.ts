import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { exaProxyUrl } from '@/infrastructure/config/apiUrl';

const EXA_API_KEY_SETTING = 'axe_exa_api_key';

export async function getExaApiKey(): Promise<string | null> {
  // The Settings "Exa Search" card saves into the shared provider-key store
  // (axe_llm_connections.exa.key) like every other provider — read that first
  // (it's where the key the user typed actually lands), then fall back to the
  // legacy dedicated setting. Without this, the key was saved but never read,
  // so search reported "not configured".
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, { key?: string } | undefined>;
    const k = conns?.exa?.key;
    if (typeof k === 'string' && k.trim()) return k.trim();
  } catch { /* fall through */ }
  return loadSetting<string | null>(EXA_API_KEY_SETTING, null);
}

export async function saveExaApiKey(key: string): Promise<void> {
  await saveSetting(EXA_API_KEY_SETTING, key);
}

/**
 * Real connectivity test for the Exa card in Settings. Exa is a SEARCH API,
 * not an LLM, so the generic testSlot() (which does a chat completion) always
 * failed for it — making a perfectly good key look "Not Configured". This runs
 * an actual tiny Exa query and reports the true status.
 */
export async function testExaKey(key: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = key.trim();
  try {
    const res = import.meta.env.PROD
      ? await fetch(exaProxyUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'axe core connectivity test', numResults: 1, key: trimmed || undefined }),
        })
      : await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': trimmed },
          body: JSON.stringify({ query: 'axe core connectivity test', numResults: 1, type: 'auto' }),
        });
    if (res.ok) return { ok: true };
    let msg = `Exa test failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = String(body.error);
    } catch { /* keep status message */ }
    return { ok: false, error: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Exa unreachable' };
  }
}

export async function exaSearch(query: string, numResults = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const key = await getExaApiKey();
  try {
    // Prod: same-origin /api/exa proxy (a direct browser call to api.exa.ai
    // is CORS-blocked — that's why Exa "had a key but never worked"). Dev:
    // call Exa directly with the saved key.
    const res = import.meta.env.PROD
      ? await fetch(exaProxyUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, numResults, key: key ?? undefined }),
        })
      : (key
          ? await fetch('https://api.exa.ai/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': key },
              body: JSON.stringify({ query, numResults, type: 'auto', contents: { text: { maxCharacters: 500 } } }),
            })
          : null);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      title: (r.title as string) ?? '',
      url: (r.url as string) ?? '',
      // Exa returns `text` (or `highlights`) — never `snippet`; reading the
      // wrong field is why results came back blank even when the call worked.
      snippet: (r.text as string) ?? (Array.isArray(r.highlights) ? (r.highlights as string[]).join(' … ') : '') ?? '',
    }));
  } catch {
    return [];
  }
}
