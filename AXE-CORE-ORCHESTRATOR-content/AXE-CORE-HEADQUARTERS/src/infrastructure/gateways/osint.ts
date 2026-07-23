/**
 * Unified OSINT service used by OSINTPanel and maps3d components.
 * Wraps axe_api's /osint/* routes (real adapters: USGS quakes, ADSB
 * aircraft, AIS vessels, GDELT news, VIIRS thermal hotspots, satellites)
 * and normalises everything into LiveOsintPoint[]. This replaced both the
 * never-implemented /api/osint/all serverless route this file used to call
 * and the old Math.random() mock in maps3d/intelApi.ts.
 */
import { osintAll } from '@/infrastructure/gateways/axeCoreApiService';

export type LiveOsintKind = 'quake' | 'flight' | 'news' | 'disaster' | 'threat' | 'intel';

export interface LiveOsintPoint {
  id: string;
  kind: LiveOsintKind;
  lat: number;
  lon: number;
  title: string;
  detail?: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  stale?: boolean;
  magnitude?: number;
  time?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedOsintResult {
  points: LiveOsintPoint[];
  lastUpdated: string;
  errors: Partial<Record<string, string>>;
}

function severityFromKind(kind: LiveOsintKind, magnitude?: number): 'critical' | 'warning' | 'info' {
  if (kind === 'quake') {
    if ((magnitude ?? 0) >= 6) return 'critical';
    if ((magnitude ?? 0) >= 4) return 'warning';
    return 'info';
  }
  if (kind === 'disaster') return 'warning';
  if (kind === 'threat') return 'critical';
  return 'info';
}

/** Map an adapter layer name + item onto the map's point kinds. */
function kindFor(layer: string, item: Record<string, unknown>): LiveOsintKind {
  switch (layer) {
    case 'air': return 'flight';
    case 'news': return 'news';
    case 'heatmap': return 'disaster';       // VIIRS thermal hotspots
    case 'intel': return typeof item.magnitude === 'number' ? 'quake' : 'threat';
    default: return 'intel';                 // vessel, space, anything new
  }
}

export async function fetchUnifiedOsint(): Promise<UnifiedOsintResult> {
  const now = new Date().toISOString();
  try {
    const layers = await osintAll();
    const points: LiveOsintPoint[] = [];
    const errors: Record<string, string> = {};

    for (const [layer, result] of Object.entries(layers)) {
      if (result.status === 'error') {
        if (result.error) errors[layer] = result.error;
        continue;
      }
      const isStale = result.status === 'stale';
      for (const item of result.items ?? []) {
        const lat = item.lat;
        const lon = item.lon;
        // Coordinate-less intel (CVEs, headlines without geo, macro rows)
        // can't be plotted — panels that want it can read the raw layers
        // via osintAll() directly.
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;
        const kind = kindFor(layer, item);
        const magnitude = typeof item.magnitude === 'number' ? item.magnitude : undefined;
        points.push({
          id: String(item.id ?? `${layer}-${lat}-${lon}`),
          kind,
          lat,
          lon,
          title: String(item.title ?? layer),
          detail: typeof item.place === 'string' ? item.place : typeof item.detail === 'string' ? item.detail : undefined,
          magnitude,
          time: typeof item.ts === 'string' ? item.ts : undefined,
          severity: severityFromKind(kind, magnitude),
          source: String(item.source ?? layer),
          stale: isStale,
          metadata: item,
        });
      }
    }

    return { points, lastUpdated: now, errors };
  } catch (err) {
    // Return empty result on failure — the map shows its own offline state.
    return {
      points: [],
      lastUpdated: now,
      errors: { fetch: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}
