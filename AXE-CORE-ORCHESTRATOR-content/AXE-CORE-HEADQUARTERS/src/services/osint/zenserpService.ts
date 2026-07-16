import type { LiveOsintPoint } from './types';

/* ──────────────────── Zenserp (Google Search proxy) ──────────────────── */

const ZENSERP_KEY = import.meta.env.VITE_ZENSERP_API_KEY;
const CACHE_TTL_MS = 120000; // 2 minutes

interface ZenserpResult {
  title: string;
  url: string;
  description: string;
}

interface ZenserpResponse {
  results?: ZenserpResult[];
}

let cache: { data: LiveOsintPoint[]; at: number } | null = null;

export async function fetchZenserpNews(cityName?: string): Promise<LiveOsintPoint[]> {
  if (!ZENSERP_KEY) return [];
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.map(p => ({ ...p, stale: true }));
  }

  const q = cityName
    ? `breaking news ${cityName} security incident`
    : 'breaking news worldwide security incident geopolitical';

  try {
    const res = await fetch(
      `https://app.zenserp.com/api/v2/search?q=${encodeURIComponent(q)}&apikey=${ZENSERP_KEY}&num=10`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error(`Zenserp ${res.status}`);
    const json: ZenserpResponse = await res.json();

    const points: LiveOsintPoint[] = (json.results ?? []).map((r, i) => ({
      id: `zenserp-${i}-${Date.now()}`,
      kind: 'news' as const,
      lat: 0,
      lon: 0,
      title: r.title ?? 'Untitled',
      detail: r.description ?? r.url ?? '',
      severity: 'warning' as const,
      source: 'zenserp' as const,
      timestamp: new Date().toISOString(),
      metadata: { url: r.url },
    }));

    cache = { data: points, at: Date.now() };
    return points;
  } catch (err) {
    console.warn('[Zenserp] fetch failed:', err);
    if (cache) return cache.data.map(p => ({ ...p, stale: true }));
    return [];
  }
}
