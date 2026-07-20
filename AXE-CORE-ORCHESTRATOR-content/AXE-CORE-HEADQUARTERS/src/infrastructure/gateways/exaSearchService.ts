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
  if (!key) return [];
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ query, numResults, type: 'auto' }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      title: (r.title as string) ?? '',
      url: (r.url as string) ?? '',
      snippet: (r.snippet as string) ?? '',
    }));
  } catch {
    return [];
  }
}
