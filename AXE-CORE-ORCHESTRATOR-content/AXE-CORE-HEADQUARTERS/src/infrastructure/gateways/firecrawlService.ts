/** Firecrawl — scrape sites that block plain fetch / Jina. */
import { getCrewToolsConfig } from '@/infrastructure/persistence/crewToolsConfigService';

export async function firecrawlScrape(url: string): Promise<{ ok: boolean; markdown?: string; error?: string }> {
  const cfg = await getCrewToolsConfig();
  const key = cfg.firecrawlApiKey?.trim();
  if (!key) return { ok: false, error: 'Firecrawl API key not configured (Crew tools settings)' };

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Firecrawl ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { success?: boolean; data?: { markdown?: string }; error?: string };
    const md = data.data?.markdown;
    if (!md) return { ok: false, error: data.error || 'No markdown returned' };
    return { ok: true, markdown: md.slice(0, 50_000) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function firecrawlSearch(query: string, limit = 5): Promise<{ ok: boolean; results?: string; error?: string }> {
  const cfg = await getCrewToolsConfig();
  const key = cfg.firecrawlApiKey?.trim();
  if (!key) return { ok: false, error: 'Firecrawl not configured' };

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Firecrawl search ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, results: JSON.stringify(data).slice(0, 40_000) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
