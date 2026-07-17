/**
 * Free, no-key OSINT data feeds for the AXE Earth 3D map. Each fetcher
 * normalizes its upstream source into a common lightweight point shape so
 * the frontend doesn't need to know each source's schema, and results are
 * cached server-side (shared across all connected clients) so we never
 * hammer rate-limited public APIs like OpenSky.
 */
import { logger } from "./logger";

export interface OsintPoint {
  id: string;
  kind: "quake" | "flight" | "news" | "disaster";
  lat: number;
  lon: number;
  title: string;
  detail?: string;
  magnitude?: number;
  time?: string; // ISO
}

interface CacheEntry { data: OsintPoint[]; fetchedAt: number; error?: string }
const cache = new Map<string, CacheEntry>();

async function withCache(key: string, ttlMs: number, fetcher: () => Promise<OsintPoint[]>): Promise<CacheEntry> {
  const existing = cache.get(key);
  if (existing && Date.now() - existing.fetchedAt < ttlMs) return existing;
  try {
    const data = await fetcher();
    const entry: CacheEntry = { data, fetchedAt: Date.now() };
    cache.set(key, entry);
    return entry;
  } catch (err) {
    logger.warn({ err, key }, "OSINT feed fetch failed");
    // Serve stale data if we have it, otherwise an empty/error result.
    const fallback: CacheEntry = existing ?? { data: [], fetchedAt: Date.now(), error: (err as Error).message };
    fallback.error = (err as Error).message;
    cache.set(key, fallback);
    return fallback;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// USGS earthquakes (last 24h, magnitude 2.5+) — stable, well-documented, CORS-open.
export function getQuakes() {
  return withCache("quakes", 5 * 60_000, async () => {
    const json = await fetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson") as {
      features: Array<{ id: string; properties: { mag: number; place: string; time: number; url: string }; geometry: { coordinates: [number, number, number] } }>;
    };
    return json.features.map((f): OsintPoint => ({
      id: `quake-${f.id}`,
      kind: "quake",
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      title: `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`,
      detail: f.properties.url,
      magnitude: f.properties.mag,
      time: new Date(f.properties.time).toISOString(),
    }));
  });
}

// OpenSky Network live ADS-B flight states — anonymous access is rate-limited,
// so we cache for a full minute and cap the payload to a manageable size.
export function getFlights() {
  return withCache("flights", 60_000, async () => {
    const json = await fetchJson("https://opensky-network.org/api/states/all") as {
      states: Array<[string, string, string, number, number, number, number, number, boolean, number, number, number, ...unknown[]]> | null;
    };
    const states = json.states ?? [];
    return states
      .filter(s => s[5] != null && s[6] != null && !s[8]) // has lon/lat, not on ground
      .slice(0, 800)
      .map((s): OsintPoint => ({
        id: `flight-${s[0]}`,
        kind: "flight",
        lat: s[6],
        lon: s[5],
        title: (s[1] || s[0]).trim() || "Unknown",
        detail: s[2],
        time: s[4] ? new Date(s[4] * 1000).toISOString() : undefined,
      }));
  });
}

// GDELT GEO 2.0 — geocoded global news events, free & unauthenticated.
export function getNewsEvents() {
  return withCache("news", 10 * 60_000, async () => {
    const query = encodeURIComponent("conflict OR attack OR earthquake OR disaster");
    const json = await fetchJson(
      `https://api.gdeltproject.org/api/v2/geo/geo?query=${query}&mode=PointData&format=GeoJSON&timespan=24h`
    ) as { features?: Array<{ properties: { name?: string; count?: number; html?: string }; geometry: { coordinates: [number, number] } }> };
    return (json.features ?? []).slice(0, 300).map((f, i): OsintPoint => ({
      id: `news-${i}-${f.geometry.coordinates.join(",")}`,
      kind: "news",
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      title: f.properties.name ?? "News event",
      detail: f.properties.html,
    }));
  });
}

// GDACS — Global Disaster Alert and Coordination System (cyclones, floods,
// volcanoes, droughts). Free, no key required.
export function getDisasters() {
  return withCache("disasters", 15 * 60_000, async () => {
    const json = await fetchJson("https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP") as {
      features?: Array<{ properties: Record<string, unknown>; geometry: { coordinates: [number, number] } }>;
    };
    return (json.features ?? []).slice(0, 200).map((f, i): OsintPoint => {
      const p = f.properties;
      return {
        id: `disaster-${i}-${String(p.eventid ?? i)}`,
        kind: "disaster",
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        title: String(p.name ?? p.eventtype ?? "Disaster event"),
        detail: String(p.description ?? p.htmldescription ?? ""),
        time: p.fromdate ? new Date(String(p.fromdate)).toISOString() : undefined,
      };
    });
  });
}
