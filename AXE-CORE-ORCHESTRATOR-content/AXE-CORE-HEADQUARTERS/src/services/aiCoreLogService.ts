/**
 * aiCoreLogService.ts
 * ------------------------------------------------------------------
 * Persistent AI Core logging to Supabase.
 * All logs are stored in the database so they survive page refreshes
 * and can be scrolled back like WhatsApp chat history.
 * ------------------------------------------------------------------ */

import { getSupabase } from '@/lib/supabaseClient';
import { AXE_USER_ID } from '@/services/chatPersistence';

export interface AICoreLogEntry {
  id: string;
  user_id: string;
  session_id: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'system';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

const LOG_SESSION_KEY = 'axe_log_session_id';

function getLogSessionId(): string {
  try {
    let id = localStorage.getItem(LOG_SESSION_KEY);
    if (!id) {
      id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(LOG_SESSION_KEY, id);
    }
    return id;
  } catch {
    return `log_${Date.now()}`;
  }
}

/**
 * Save a log entry to Supabase
 */
export async function saveLog(
  level: AICoreLogEntry['level'],
  source: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    // Fallback to localStorage
    const entry: AICoreLogEntry = {
      id: `local_${Date.now()}`,
      user_id: AXE_USER_ID,
      session_id: getLogSessionId(),
      level,
      source,
      message,
      metadata,
      created_at: new Date().toISOString(),
    };
    const stored = localStorage.getItem('axe_ai_logs');
    const logs: AICoreLogEntry[] = stored ? JSON.parse(stored) : [];
    logs.push(entry);
    localStorage.setItem('axe_ai_logs', JSON.stringify(logs.slice(-500)));
    return;
  }

  try {
    await supabase.from('ai_core_logs').insert({
      user_id: AXE_USER_ID,
      session_id: getLogSessionId(),
      level,
      source,
      message,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error('[AICoreLog] Failed to save log:', err);
  }
}

/**
 * Load logs from Supabase (with localStorage fallback)
 */
export async function loadLogs(limit = 200): Promise<AICoreLogEntry[]> {
  const supabase = getSupabase();
  if (!supabase) {
    const stored = localStorage.getItem('axe_ai_logs');
    return stored ? JSON.parse(stored).slice(-limit) : [];
  }

  try {
    const { data, error } = await supabase
      .from('ai_core_logs')
      .select('*')
      .eq('user_id', AXE_USER_ID)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (data || []) as AICoreLogEntry[];
  } catch (err) {
    console.error('[AICoreLog] Failed to load logs:', err);
    const stored = localStorage.getItem('axe_ai_logs');
    return stored ? JSON.parse(stored).slice(-limit) : [];
  }
}

/**
 * Clear logs
 */
export async function clearLogs(): Promise<void> {
  localStorage.removeItem('axe_ai_logs');
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('ai_core_logs')
        .delete()
        .eq('user_id', AXE_USER_ID)
        .eq('session_id', getLogSessionId());
    } catch (err) {
      console.error('[AICoreLog] Failed to clear logs:', err);
    }
  }
}

/**
 * Export logs as text
 */
export function exportLogsToText(logs: AICoreLogEntry[]): string {
  return logs
    .map(l => `[${new Date(l.created_at).toLocaleTimeString('en-US', { hour12: false })}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
    .join('\n');
}

// ── Convenience helpers ─────────────────────────────────────────────────

export const logInfo = (source: string, message: string, meta?: Record<string, unknown>) =>
  saveLog('info', source, message, meta);
export const logWarn = (source: string, message: string, meta?: Record<string, unknown>) =>
  saveLog('warn', source, message, meta);
export const logError = (source: string, message: string, meta?: Record<string, unknown>) =>
  saveLog('error', source, message, meta);
export const logDebug = (source: string, message: string, meta?: Record<string, unknown>) =>
  saveLog('debug', source, message, meta);
export const logSystem = (source: string, message: string, meta?: Record<string, unknown>) =>
  saveLog('system', source, message, meta);

// Global logger for window.axeLog
export function createGlobalLogger() {
  return (level: string, source: string, message: string) => {
    const validLevel = ['info', 'warn', 'error', 'debug', 'system'].includes(level)
      ? (level as AICoreLogEntry['level'])
      : 'info';
    saveLog(validLevel, source, message);
  };
}
