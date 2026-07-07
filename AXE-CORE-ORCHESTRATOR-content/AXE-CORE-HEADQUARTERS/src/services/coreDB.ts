import { getSupabase } from '@/lib/supabaseClient';

export interface CoreMemoryEntry {
  id: string;
  content: string;
  tags: string[];
  importance: number;
  source: string;
  created_at: string;
}

export interface CoreLogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Returns true if Supabase URL + key are configured in localStorage */
export function isSupabaseConnected(): boolean {
  return !!(localStorage.getItem('axe_supa_url') && localStorage.getItem('axe_supa_key'));
}

/**
 * Fire-and-forget: log a message to core_system_logs.
 * Silently does nothing if Supabase is not configured.
 */
export async function logMessage(
  level: 'debug' | 'info' | 'warn' | 'error',
  source: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('core_system_logs').insert({ level, source, message, metadata });
  } catch {
    // Never throw — logging must not break the UI
  }
}

/** Save a memory entry to core_memory */
export async function saveMemory(
  content: string,
  tags: string[] = [],
  importance = 5,
  source = 'manual',
): Promise<CoreMemoryEntry | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('core_memory')
    .insert({ content, tags, importance, source })
    .select()
    .single();
  if (error) {
    console.warn('[coreDB] saveMemory:', error.message);
    return null;
  }
  return data as CoreMemoryEntry;
}

/** Load recent memory entries (newest first) */
export async function loadMemories(limit = 50): Promise<CoreMemoryEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('core_memory')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[coreDB] loadMemories:', error.message);
    return [];
  }
  return (data ?? []) as CoreMemoryEntry[];
}

/** Delete a memory entry by id */
export async function deleteMemory(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('core_memory').delete().eq('id', id);
  } catch {
    // Ignore
  }
}

/** Load recent system logs (newest first) */
export async function loadLogs(limit = 100): Promise<CoreLogEntry[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('core_system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[coreDB] loadLogs:', error.message);
    return [];
  }
  return (data ?? []) as CoreLogEntry[];
}
