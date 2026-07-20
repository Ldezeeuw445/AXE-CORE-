import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Trash2, Download, Activity } from 'lucide-react';
import { logMessage, loadLogs } from '@/infrastructure/persistence/coreDB';
import type { CoreLogEntry } from '@/infrastructure/persistence/coreDB';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

const LEVEL_COLORS: Record<string, string> = {
  info: '#22D3EE',
  warn: '#F59E0B',
  error: '#EF4444',
  debug: '#8B5CF6',
};

function mapToLogEntry(core: CoreLogEntry): LogEntry {
  return {
    id: core.id,
    timestamp: new Date(core.created_at).toLocaleTimeString('en-US', { hour12: false }),
    level: core.level as 'info' | 'warn' | 'error' | 'debug',
    source: core.source,
    message: core.message,
  };
}

export function AICoreLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reloadLogs = useCallback(async () => {
    try {
      const loaded = await loadLogs(100);
      if (loaded.length > 0) {
        setLogs(loaded.map(mapToLogEntry));
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem('axe_core_logs');
        if (stored) {
          try { setLogs(JSON.parse(stored).slice(-200)); } catch { /* ignore */ }
        }
      }
    } catch {
      const stored = localStorage.getItem('axe_core_logs');
      if (stored) {
        try { setLogs(JSON.parse(stored).slice(-200)); } catch { /* ignore */ }
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reloadLogs().then(() => setLoading(false));
  }, [reloadLogs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const addLog = async (level: LogEntry['level'], source: string, message: string) => {
    await logMessage(level, source, message);
    // Also save to localStorage as backup
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      source,
      message,
    };
    setLogs(prev => {
      const next = [...prev, entry].slice(-200);
      localStorage.setItem('axe_core_logs', JSON.stringify(next));
      return next;
    });
  };

  // Expose globally — now async
  useEffect(() => {
    (window as unknown as Record<string, unknown>).axeLog = addLog;
    return () => { delete (window as unknown as Record<string, unknown>).axeLog; };
  }, []);

  const clearLogs = async () => {
    setLogs([]);
    localStorage.removeItem('axe_core_logs');
    // Note: we don't delete from Supabase to preserve audit trail
  };

  const exportLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `axe-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 pb-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['all', 'info', 'warn', 'error', 'debug'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className="text-[8px] px-1.5 py-0.5 rounded capitalize" style={{ background: filter === f ? 'rgba(34,211,238,0.15)' : 'transparent', border: `1px solid ${filter === f ? 'rgba(34,211,238,0.3)' : 'transparent'}`, color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{f}</button>
        ))}
        <div className="flex-1" />
        <button onClick={exportLogs} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }} title="Export"><Download size={10} /></button>
        <button onClick={clearLogs} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }} title="Clear"><Trash2 size={10} /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto mt-1 space-y-0.5 font-mono-data" style={{ maxHeight: 200 }}>
        {loading && <div className="text-[9px] text-center py-4" style={{ color: 'var(--text-muted)' }}>Loading logs...</div>}
        {!loading && filtered.length === 0 && <div className="text-[9px] text-center py-4" style={{ color: 'var(--text-muted)' }}>No logs yet</div>}
        {!loading && filtered.map(log => (
          <div key={log.id} className="flex gap-1.5 text-[8px] leading-tight">
            <span style={{ color: 'var(--text-muted)' }}>{log.timestamp}</span>
            <span style={{ color: LEVEL_COLORS[log.level], fontWeight: 600 }}>{log.level.toUpperCase().padEnd(5)}</span>
            <span style={{ color: 'var(--accent-blue)' }}>{log.source}</span>
            <span style={{ color: 'var(--text-primary)' }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
