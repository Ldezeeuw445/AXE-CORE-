import type { LiveOsintPoint } from './types';

/* ──────────────────── NASA EONET (FREE, no key) ──────────────────── */

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50';
const CACHE_TTL_MS = 120000; // 2 minutes

interface EonetEvent {
  id: string;
  title: string;
  categories: Array<{ id: string; title: string }>;
  geometries: Array<{
    date: string;
    type: string;
    coordinates: number[]; // [lon, lat] or polygon
  }>;
  sources?: Array<{ id: string; url: string }>;
}

interface EonetResponse {
  events: EonetEvent[];
}

const SEVERITY_MAP: Record<string, 'info' | 'warning' | 'critical'> = {
  wildfires: 'critical',
  severeStorms: 'warning',
  volcanoes: 'critical',
  earthquakes: 'warning',
  floods: 'warning',
  drought: 'info',
  landslides: 'warning',
  snow: 'info',
  tempExtremes: 'info',
  manmade: 'warning',
};

const KIND_MAP: Record<string, 'disaster' | 'threat' | 'news'> = {
  wildfires: 'disaster',
  severeStorms: 'disaster',
  volcanoes: 'disaster',
  earthquakes: 'disaster',
  floods: 'disaster',
  drought: 'disaster',
  landslides: 'disaster',
  snow: 'disaster',
  tempExtremes: 'disaster',
  manmade: 'threat',
};

let cache: { data: LiveOsintPoint[]; at: number } | null = null;

export async function fetchNasaDisasters(): Promise<LiveOsintPoint[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.map(p => ({ ...p, stale: true }));
  }

  try {
    const res = await fetch(EONET_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`EONET ${res.status}`);
    const json: EonetResponse = await res.json();

    const points: LiveOsintPoint[] = [];

    for (const evt of json.events ?? []) {
      const geo = evt.geometries?.[0];
      if (!geo || geo.type !== 'Point') continue;

      const [lon, lat] = geo.coordinates;
      if (lon == null || lat == null) continue;

      const catId = evt.categories?.[0]?.id ?? 'unknown';
      const severity = SEVERITY_MAP[catId] ?? 'info';
      const kind = KIND_MAP[catId] ?? 'disaster';
      const sourceUrl = evt.sources?.[0]?.url ?? '';

      points.push({
        id: `nasa-${evt.id}`,
        kind,
        lat,
        lon,
        title: evt.title,
        detail: `Category: ${evt.categories?.[0]?.title ?? 'Unknown'}`,
        severity,
        source: 'nasa',
        timestamp: geo.date,
        metadata: {
          eventId: evt.id,
          category: catId,
          sourceUrl,
        },
      });
    }

    cache = { data: points, at: Date.now() };
    return points;
  } catch (err) {
    console.warn('[NASA] fetch failed:', err);
    if (cache) return cache.data.map(p => ({ ...p, stale: true }));
    return [];
  }
}
