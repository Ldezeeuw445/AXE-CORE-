import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

const EXA_API_KEY_SETTING = 'axe_exa_api_key';

export async function getExaApiKey(): Promise<string | null> {
  return loadSetting<string | null>(EXA_API_KEY_SETTING, null);
}

export async function saveExaApiKey(key: string): Promise<void> {
  await saveSetting(EXA_API_KEY_SETTING, key);
}

export async function exaSearch(query: string, numResults = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const key = await getExaApiKey();
  try {
    // Prod: same-origin /api/exa proxy (a direct browser call to api.exa.ai
    // is CORS-blocked — that's why Exa "had a key but never worked"). Dev:
    // call Exa directly with the saved key.
    const res = import.meta.env.PROD
      ? await fetch('/api/exa', {
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
