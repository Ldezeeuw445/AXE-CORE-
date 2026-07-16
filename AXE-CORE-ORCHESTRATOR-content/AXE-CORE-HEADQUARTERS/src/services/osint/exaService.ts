import type { LiveOsintPoint } from './types';

/* ──────────────────── Exa Search (geopolitical incidents) ──────────────────── */

const EXA_KEY = import.meta.env.VITE_EXA_API_KEY;
const CACHE_TTL_MS = 120000; // 2 minutes

interface ExaResult {
  title: string;
  url: string;
  score?: number;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
}

interface ExaResponse {
  results?: ExaResult[];
  autocompletions?: unknown[];
}

let cache: { data: LiveOsintPoint[]; at: number } | null = null;

/**
 * Search for latest geopolitical / security incidents near a city.
 */
export async function fetchExaNews(cityName?: string): Promise<LiveOsintPoint[]> {
  if (!EXA_KEY) return [];
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.map(p => ({ ...p, stale: true }));
  }

  const query = cityName
    ? `latest geopolitical incidents ${cityName} security breaking`
    : 'latest geopolitical incidents worldwide security breaking';

  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_KEY,
      },
      body: JSON.stringify({
        query,
        numResults: 10,
        type: 'auto',
        contents: { highlights: true, text: { maxCharacters: 300 } },
        useAutoprompt: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Exa ${res.status}`);
    const json: ExaResponse = await res.json();

    const points: LiveOsintPoint[] = (json.results ?? []).map((r, i) => ({
      id: `exa-${i}-${Date.now()}`,
      kind: 'news' as const,
      lat: 0, // will be assigned by city-based heuristic in caller
      lon: 0,
      title: r.title ?? 'Untitled',
      detail: r.highlights?.[0] ?? r.text ?? r.url ?? '',
      severity: 'warning' as const,
      source: 'exa' as const,
      timestamp: r.publishedDate ?? new Date().toISOString(),
      metadata: {
        url: r.url,
        score: r.score,
        author: r.author,
        highlights: r.highlights,
      },
    }));

    cache = { data: points, at: Date.now() };
    return points;
  } catch (err) {
    console.warn('[Exa] fetch failed:', err);
    if (cache) return cache.data.map(p => ({ ...p, stale: true }));
    return [];
  }
}
