/**
 * intelProxyGateway — calls Trading OS's `intel-proxy` Supabase edge
 * function (same Supabase project this app already uses) for the OSINT map
 * layers that AXE Core's own VPS (`/osint/all`, see osint.ts) doesn't carry:
 * GDELT conflict/war-zone events, NOAA weather alerts, WHO health alerts,
 * corporate jets (ADS-B + named-owner registry) and AIS vessels.
 *
 * Every function here returns [] on any failure (network, auth, missing
 * provider key, malformed response) — never a placeholder point. The map
 * layer simply shows nothing for that source rather than guessing.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

async function callIntelProxy<T>(action: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke<{ ok: boolean; data?: T; error?: string }>('intel-proxy', {
    body: { action, args },
  });
  if (error || !data?.ok) return null;
  return data.data ?? null;
}

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  detail?: string;
  source: string;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ── GDELT conflict / war-zone events ───────────────────────────────────────
export async function fetchConflictEvents(timespan = '24h', maxrecords = 100): Promise<MapPoint[]> {
  const rows = await callIntelProxy<Array<Record<string, unknown>>>('gdeltEvents', { timespan, maxrecords });
  if (!Array.isArray(rows)) return [];
  const out: MapPoint[] = [];
  for (const r of rows) {
    const lat = num(r.lat), lon = num(r.lon);
    if (lat === null || lon === null) continue;
    out.push({
      id: `conflict-${lat.toFixed(2)}-${lon.toFixed(2)}-${out.length}`,
      lat, lon,
      label: String(r.title ?? 'Conflict event'),
      detail: typeof r.country === 'string' ? r.country : undefined,
      source: 'GDELT',
    });
  }
  return out;
}

// ── NOAA severe weather alerts ─────────────────────────────────────────────
export async function fetchWeatherAlerts(): Promise<MapPoint[]> {
  const rows = await callIntelProxy<Array<Record<string, unknown>>>('weatherAlerts', {});
  if (!Array.isArray(rows)) return [];
  const out: MapPoint[] = [];
  for (const r of rows) {
    const lat = num(r.lat), lon = num(r.lon);
    if (lat === null || lon === null) continue;
    out.push({
      id: `weather-${lat.toFixed(2)}-${lon.toFixed(2)}-${out.length}`,
      lat, lon,
      label: String(r.title ?? 'Weather alert'),
      detail: typeof r.area === 'string' ? r.area : undefined,
      source: 'NOAA',
    });
  }
  return out;
}

// ── WHO health outbreak alerts ─────────────────────────────────────────────
export async function fetchHealthAlerts(): Promise<MapPoint[]> {
  const rows = await callIntelProxy<Array<Record<string, unknown>>>('healthAlerts', {});
  if (!Array.isArray(rows)) return [];
  const out: MapPoint[] = [];
  for (const r of rows) {
    const lat = num(r.lat), lon = num(r.lon);
    if (lat === null || lon === null) continue;
    out.push({
      id: `health-${lat.toFixed(2)}-${lon.toFixed(2)}-${out.length}`,
      lat, lon,
      label: String(r.title ?? 'Health alert'),
      detail: typeof r.country === 'string' ? r.country : undefined,
      source: 'WHO',
    });
  }
  return out;
}

// ── Corporate jets (ADS-B live + named-owner registry) ─────────────────────
export interface JetPoint extends MapPoint {
  operator: string;
  altitude: number;
  speed: number;
}

export async function fetchCorporateJets(): Promise<JetPoint[]> {
  const res = await callIntelProxy<{ data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>('corporateJets', {});
  const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
  const out: JetPoint[] = [];
  for (const r of rows) {
    const lat = num(r.lat), lon = num(r.lon);
    if (lat === null || lon === null) continue;
    const operator = String(r.company ?? 'Unknown operator');
    out.push({
      id: `jet-${String(r.icao24 ?? out.length)}`,
      lat, lon,
      label: operator,
      detail: typeof r.aircraft === 'string' ? r.aircraft : undefined,
      operator,
      altitude: num(r.altitude) ?? 0,
      speed: num(r.speed) ?? 0,
      source: 'ADS-B',
    });
  }
  return out;
}

// ── AIS vessels ──────────────────────────────────────────────────────────
export interface VesselPoint extends MapPoint {
  mmsi: string;
}

export async function fetchVessels(): Promise<VesselPoint[]> {
  const res = await callIntelProxy<{ vessels?: Array<Record<string, unknown>> }>('vesselStream', {});
  const rows = Array.isArray(res?.vessels) ? res.vessels : [];
  const out: VesselPoint[] = [];
  for (const r of rows) {
    const lat = num(r.lat ?? r.latitude), lon = num(r.lon ?? r.longitude);
    if (lat === null || lon === null) continue;
    const mmsi = String(r.mmsi ?? '');
    out.push({
      id: `vessel-${mmsi || out.length}`,
      lat, lon,
      label: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `MMSI ${mmsi || '—'}`,
      detail: typeof r.shipType === 'string' ? r.shipType : undefined,
      mmsi,
      source: 'AIS',
    });
  }
  return out;
}
