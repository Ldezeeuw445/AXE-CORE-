import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

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

/** Returns true if Supabase URL + key are configured (env vars take priority over localStorage) */
export function isSupabaseConnected(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('axe_supa_url');
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('axe_supa_key');
  return !!(url && key);
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

const LS_CORE_KEY = 'axe_core_memory_local';

function loadLocalCore(): CoreMemoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CORE_KEY) || '[]');
    return Array.isArray(raw) ? (raw as CoreMemoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocalCore(entries: CoreMemoryEntry[]): void {
  try {
    localStorage.setItem(LS_CORE_KEY, JSON.stringify(entries.slice(0, 500)));
  } catch {
    /* quota */
  }
}

function pushLocalCore(entry: CoreMemoryEntry): void {
  const all = loadLocalCore().filter((e) => e.id !== entry.id && e.content !== entry.content);
  all.unshift(entry);
  saveLocalCore(all);
}

/** Save a memory entry to core_memory (Supabase + local fallback so Memory tab never stays empty) */
export async function saveMemory(
  content: string,
  tags: string[] = [],
  importance = 5,
  source = 'manual',
): Promise<CoreMemoryEntry | null> {
  const localEntry: CoreMemoryEntry = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    tags,
    importance,
    source,
    created_at: new Date().toISOString(),
  };

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('core_memory')
        .insert({ content, tags, importance, source })
        .select()
        .single();
      if (!error && data) {
        const remote = data as CoreMemoryEntry;
        pushLocalCore(remote);
        return remote;
      }
      if (error) console.warn('[coreDB] saveMemory:', error.message);
    } catch (e) {
      console.warn('[coreDB] saveMemory exception', e);
    }
  }

  pushLocalCore(localEntry);
  return localEntry;
}

/** Load recent memory entries (newest first). Merges Supabase + local. */
export async function loadMemories(limit = 50): Promise<CoreMemoryEntry[]> {
  const local = loadLocalCore();
  let remote: CoreMemoryEntry[] = [];
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('core_memory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error) remote = (data ?? []) as CoreMemoryEntry[];
      else console.warn('[coreDB] loadMemories:', error.message);
    } catch (e) {
      console.warn('[coreDB] loadMemories exception', e);
    }
  }

  const seen = new Set<string>();
  const merged: CoreMemoryEntry[] = [];
  for (const e of [...remote, ...local]) {
    const key = e.id || e.content.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }
  merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return merged.slice(0, limit);
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
