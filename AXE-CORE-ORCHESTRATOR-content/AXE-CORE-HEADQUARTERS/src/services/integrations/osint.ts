/**
 * Unified OSINT service used by OSINTPanel and maps3d components.
 * Wraps the api-server OSINT proxy and normalises results into LiveOsintPoint[].
 */
import { getSupabase } from '@/core/supabase/client';

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

export async function fetchUnifiedOsint(_cityName?: string): Promise<UnifiedOsintResult> {
  const sb = getSupabase();
  const token = (await sb?.auth.getSession())?.data.session?.access_token;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const now = new Date().toISOString();

  try {
    const res = await fetch('/api/osint/all', { headers });
    if (!res.ok) throw new Error(`OSINT ${res.status}`);
    const data = await res.json() as {
      points?: Array<{
        id?: string;
        kind: string;
        lat: number;
        lon: number;
        title: string;
        detail?: string;
        magnitude?: number;
        time?: string;
        [key: string]: unknown;
      }>;
      errors?: Record<string, string | null>;
    };

    const points: LiveOsintPoint[] = (data.points ?? []).map((p) => {
      const kind = p.kind as LiveOsintKind;
      return {
        id: (p.id as string) ?? `${kind}-${p.lat}-${p.lon}-${Date.now()}`,
        kind,
        lat: p.lat,
        lon: p.lon,
        title: p.title,
        detail: p.detail,
        magnitude: p.magnitude,
        time: p.time,
        severity: severityFromKind(kind, p.magnitude),
        source: kind === 'quake' ? 'USGS' : kind === 'flight' ? 'ADSB' : kind === 'news' ? 'GDELT' : 'GDACS',
        stale: false,
        metadata: p as Record<string, unknown>,
      };
    });

    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.errors ?? {})) {
      if (v) errors[k] = v;
    }

    return { points, lastUpdated: now, errors };
  } catch (err) {
    // Return empty result with stale flag on failure
    return {
      points: [],
      lastUpdated: now,
      errors: { fetch: err instanceof Error ? err.message : 'Unknown error' },
    };
  }
}
