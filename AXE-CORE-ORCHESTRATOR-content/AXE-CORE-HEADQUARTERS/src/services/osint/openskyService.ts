import type { LiveOsintPoint } from './types';

/* ──────────────────── OpenSky API (FREE) ──────────────────── */

const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const CACHE_TTL_MS = 25000; // 25s – OpenSky rate-limits to ~1 req/10s

interface OpenSkyState {
  0: string; // icao24
  1: string; // callsign (trimmed)
  2: string; // origin_country
  3: number; // time_position
  4: number; // last_contact
  5: number; // longitude
  6: number; // latitude
  7: number | null; // baro_altitude (m)
  8: boolean; // on_ground
  9: number | null; // velocity (m/s)
  10: number | null; // true_track (°)
  11: number | null; // vertical_rate
  12: number[] | null; // sensors
  13: number | null; // geo_altitude (m)
  14: string | null; // squawk
  15: boolean; // spi
  16: number; // position_source
  17: number | null; // category (1-6)
}

interface OpenSkyResponse {
  time: number;
  states: OpenSkyState[] | null;
}

let cache: { data: LiveOsintPoint[]; at: number } | null = null;

export async function fetchOpenSkyAircraft(): Promise<LiveOsintPoint[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.map(p => ({ ...p, stale: true }));
  }

  try {
    const res = await fetch(OPENSKY_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`OpenSky ${res.status}`);
    const json: OpenSkyResponse = await res.json();
    const states = json.states ?? [];

    const points: LiveOsintPoint[] = states
      .filter((s) => {
        const lat = s[6];
        const lon = s[5];
        const alt = s[13] ?? s[7] ?? 0;
        const vel = s[9] ?? 0;
        const cat = s[17];
        if (lat == null || lon == null) return false;
        if (alt < 1000) return false; // > 1000m
        if (vel * 3.6 < 50) return false; // > 50 km/h
        // Corporate jets: category 1-4 (light→heavy aircraft)
        if (cat != null && (cat < 1 || cat > 4)) return false;
        return true;
      })
      .slice(0, 100)
      .map((s) => {
        const lat = s[6]!;
        const lon = s[5]!;
        const icao24 = s[0];
        const callsign = (s[1] ?? '').trim() || icao24;
        const country = s[2];
        const alt = s[13] ?? s[7] ?? 0;
        const vel = s[9] ?? 0;
        const track = s[10] ?? 0;
        const squawk = s[14];

        return {
          id: `opensky-${icao24}`,
          kind: 'flight' as const,
          lat,
          lon,
          title: `${callsign}`,
          detail: `${country} · ${Math.round(alt)}m · ${Math.round(vel * 3.6)} km/h · ${Math.round(track)}°`,
          severity: 'info' as const,
          source: 'opensky' as const,
          timestamp: new Date().toISOString(),
          metadata: {
            icao24,
            callsign,
            origin_country: country,
            altitude: alt,
            velocity: vel,
            true_track: track,
            squawk,
          },
        };
      });

    cache = { data: points, at: Date.now() };
    return points;
  } catch (err) {
    console.warn('[OpenSky] fetch failed:', err);
    if (cache) return cache.data.map(p => ({ ...p, stale: true }));
    return [];
  }
}
