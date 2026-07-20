/**
 * Client for the OSINT layers proxied through api-server (see
 * artifacts/api-server/src/routes/osint.ts) — live earthquakes, flights,
 * geocoded news/conflict events, and global disasters, all from free
 * public sources, cached server-side.
 */
import { getSupabase } from '@/core/supabase/client';

export type OsintKind = 'quake' | 'flight' | 'news' | 'disaster';

export interface OsintPoint {
  id: string;
  kind: OsintKind;
  lat: number;
  lon: number;
  title: string;
  detail?: string;
  magnitude?: number;
  time?: string;
}

export interface OsintResult {
  points: OsintPoint[];
  errors: Partial<Record<OsintKind extends 'quake' ? 'quakes' : string, string | null>> & Record<string, string | null>;
}

export async function fetchOsintData(): Promise<OsintResult> {
  const sb = getSupabase();
  const token = (await sb?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch('/api/osint/all', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`OSINT feed request failed (${res.status})`);
  return res.json();
}
