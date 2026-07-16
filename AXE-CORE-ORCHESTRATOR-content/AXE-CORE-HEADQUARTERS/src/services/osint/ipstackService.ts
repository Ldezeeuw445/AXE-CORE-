/**
 * IPStack Service — IP geolocation helper
 * Used for geolocating threat IPs from Greynoise
 */
import type { IpGeolocation } from './types';

const API_KEY = import.meta.env.VITE_IPSTACK_API_KEY;

let cache: Record<string, { data: IpGeolocation; ts: number }> = {};
const CACHE_TTL_MS = 60_000 * 5; // 5 minutes

export async function geolocateIp(ip: string): Promise<IpGeolocation | null> {
  if (!API_KEY) return null;

  const now = Date.now();
  if (cache[ip] && now - cache[ip].ts < CACHE_TTL_MS) {
    return cache[ip].data;
  }

  try {
    const url = `http://api.ipstack.com/${encodeURIComponent(ip)}?access_key=${API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.latitude || !data.longitude) return null;

    const result: IpGeolocation = {
      ip: data.ip,
      lat: data.latitude,
      lon: data.longitude,
      city: data.city ?? null,
      country: data.country_name ?? null,
    };

    cache[ip] = { data: result, ts: now };
    return result;
  } catch {
    return null;
  }
}
