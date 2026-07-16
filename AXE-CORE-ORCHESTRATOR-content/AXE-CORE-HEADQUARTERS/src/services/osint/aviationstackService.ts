import type { LiveOsintPoint } from './types';

/* ──────────────────── AviationStack (backup for OpenSky) ──────────────────── */

const AVIATIONSTACK_KEY = import.meta.env.VITE_AVIATIONSTACK_API_KEY;
const CACHE_TTL_MS = 300000; // 5 min – free tier is 100 calls/month

interface AviationStackFlight {
  flight_number: string;
  airline: { name: string };
  live?: {
    latitude: number;
    longitude: number;
    altitude: number;
    speed_horizontal: number;
    direction: number;
  };
  flight_date: string;
  flight_status: string;
}

interface AviationStackResponse {
  data: AviationStackFlight[];
}

let cache: { data: LiveOsintPoint[]; at: number } | null = null;

export async function fetchAviationStackFlights(): Promise<LiveOsintPoint[]> {
  if (!AVIATIONSTACK_KEY) return [];
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.map(p => ({ ...p, stale: true }));
  }

  try {
    const res = await fetch(
      `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_KEY}&limit=100`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) throw new Error(`AviationStack ${res.status}`);
    const json: AviationStackResponse = await res.json();

    const points: LiveOsintPoint[] = (json.data ?? [])
      .filter((f) => f.live && f.live.latitude && f.live.longitude)
      .slice(0, 50)
      .map((f) => {
        const live = f.live!;
        return {
          id: `avstack-${f.flight_number}-${Date.now()}`,
          kind: 'flight' as const,
          lat: live.latitude,
          lon: live.longitude,
          title: `${f.flight_number} — ${f.airline?.name ?? 'Unknown'}`,
          detail: `Alt: ${Math.round(live.altitude)}ft · ${Math.round(live.speed_horizontal)}kts · ${Math.round(live.direction)}°`,
          severity: 'info' as const,
          source: 'aviationstack' as const,
          timestamp: f.flight_date ?? new Date().toISOString(),
          metadata: {
            flight_number: f.flight_number,
            airline: f.airline?.name,
            altitude: live.altitude,
            speed: live.speed_horizontal,
            heading: live.direction,
            status: f.flight_status,
          },
        };
      });

    cache = { data: points, at: Date.now() };
    return points;
  } catch (err) {
    console.warn('[AviationStack] fetch failed:', err);
    if (cache) return cache.data.map(p => ({ ...p, stale: true }));
    return [];
  }
}
