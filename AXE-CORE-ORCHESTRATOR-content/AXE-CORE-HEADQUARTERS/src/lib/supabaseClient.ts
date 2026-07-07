import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _lastUrl = '';
let _lastKey = '';

// Env vars baked in at build time (Vercel) — localStorage overrides for local dev
const ENV_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Returns a lazy Supabase client.
 * Priority: localStorage (dev override) → VITE env vars (production)
 */
export function getSupabase(): SupabaseClient | null {
  const url = (typeof localStorage !== 'undefined' ? localStorage.getItem('axe_supa_url') : null) ?? ENV_URL;
  const key = (typeof localStorage !== 'undefined' ? localStorage.getItem('axe_supa_key') : null) ?? ENV_KEY;
  if (!url || !key) return null;
  if (_client && url === _lastUrl && key === _lastKey) return _client;
  _client = createClient(url, key);
  _lastUrl = url;
  _lastKey = key;
  return _client;
}

/** Get a Supabase client guaranteed to work (throws if not configured) */
export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return c;
}

export function resetSupabaseClient(): void {
  _client = null;
  _lastUrl = '';
  _lastKey = '';
}

export const SUPABASE_URL = ENV_URL || 'https://pqnngpcgbdwxavbatbia.supabase.co';

