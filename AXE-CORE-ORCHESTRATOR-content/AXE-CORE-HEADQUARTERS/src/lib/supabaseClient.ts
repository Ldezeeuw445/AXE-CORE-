import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _lastUrl = '';
let _lastKey = '';

/**
 * Returns a lazy Supabase client using credentials stored in localStorage.
 * Returns null if credentials are not configured yet.
 * Re-creates the client if credentials change.
 */
export function getSupabase(): SupabaseClient | null {
  const url = localStorage.getItem('axe_supa_url') ?? '';
  const key = localStorage.getItem('axe_supa_key') ?? '';
  if (!url || !key) return null;
  if (_client && url === _lastUrl && key === _lastKey) return _client;
  _client = createClient(url, key);
  _lastUrl = url;
  _lastKey = key;
  return _client;
}

export function resetSupabaseClient(): void {
  _client = null;
  _lastUrl = '';
  _lastKey = '';
}
