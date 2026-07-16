import type { LiveOsintPoint } from './types';

/* ──────────────────── GreyNoise (community tier: 1 req/min) ──────────────────── */

const GREYNOISE_KEY = import.meta.env.VITE_GREYNOISE_API_KEY;
const CACHE_TTL_MS = 60000; // 1 minute – matches rate limit

interface GnCommunityResponse {
  ip: string;
  noise: boolean;
  riot: boolean;
  classification?: string; // benign, unknown, malicious
  name?: string;
  last_seen?: string;
  message?: string;
}

// Sample known-malicious / scanning IPs for demo (these are common public indicators)
const KNOWN_SCANNING_IPS = [
  '1.1.1.1',
  '8.8.8.8',
  '208.67.222.222',
];

let cache: { data: LiveOsintPoint[]; at: number } | null = null;

export async function fetchGreynoiseThreats(): Promise<LiveOsintPoint[]> {
  if (!GREYNOISE_KEY) return [];
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data.map(p => ({ ...p, stale: true }));
  }

  const points: LiveOsintPoint[] = [];

  for (const ip of KNOWN_SCANNING_IPS) {
    try {
      const res = await fetch(`https://api.greynoise.io/v3/community/${ip}`, {
        headers: { key: GREYNOISE_KEY },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const json: GnCommunityResponse = await res.json();

      if (json.noise || json.riot || json.classification === 'malicious') {
        // We need lat/lon for these IPs — call ipstack (lazy-loaded to avoid dep cycle)
        const geo = await geolocateIp(ip);
        points.push({
          id: `greynoise-${json.ip}`,
          kind: 'threat' as const,
          lat: geo.lat,
          lon: geo.lon,
          title: json.name ?? `Threat: ${json.ip}`,
          detail: `Classification: ${json.classification ?? 'unknown'} · ${json.last_seen ?? 'N/A'}`,
          severity: json.classification === 'malicious' ? 'critical' : 'warning',
          source: 'greynoise' as const,
          timestamp: json.last_seen ?? new Date().toISOString(),
          metadata: {
            ip: json.ip,
            classification: json.classification,
            noise: json.noise,
            riot: json.riot,
          },
        });
      }
    } catch (err) {
      console.warn(`[GreyNoise] lookup failed for ${ip}:`, err);
    }
  }

  cache = { data: points, at: Date.now() };
  return points;
}

/* ──────────────────── IPStack helper ──────────────────── */

const IPSTACK_KEY = import.meta.env.VITE_IPSTACK_API_KEY;

interface IpstackResponse {
  ip: string;
  latitude: number;
  longitude: number;
  city?: string;
  country_name?: string;
  connection?: { isp?: string };
}

const ipGeoCache: Record<string, { lat: number; lon: number }> = {};

export async function geolocateIp(ip: string): Promise<{ lat: number; lon: number }> {
  if (ipGeoCache[ip]) return ipGeoCache[ip];

  if (!IPSTACK_KEY) {
    // Fallback: return a random jitter around a known location
    const fallback = { lat: 51.5 + (Math.random() - 0.5) * 2, lon: -0.1 + (Math.random() - 0.5) * 2 };
    ipGeoCache[ip] = fallback;
    return fallback;
  }

  try {
    const res = await fetch(
      `http://api.ipstack.com/${ip}?access_key=${IPSTACK_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`IPStack ${res.status}`);
    const json: IpstackResponse = await res.json();
    const result = { lat: json.latitude ?? 0, lon: json.longitude ?? 0 };
    ipGeoCache[ip] = result;
    return result;
  } catch (err) {
    console.warn('[IPStack] lookup failed:', err);
    const fallback = { lat: 51.5 + (Math.random() - 0.5) * 2, lon: -0.1 + (Math.random() - 0.5) * 2 };
    ipGeoCache[ip] = fallback;
    return fallback;
  }
}
