import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { logMessage, loadLogs } from '@/infrastructure/persistence/coreDB';
import type { CoreLogEntry } from '@/infrastructure/persistence/coreDB';
import { useVoiceStore, type RoutingEvent } from '@/presentation/store/voiceStore';

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

function routeToLog(e: RoutingEvent): LogEntry {
  const time = new Date(e.ts).toLocaleTimeString('en-US', { hour12: false });
  const winner = e.winner
    ? `winner: ${e.winner}${e.winnerModel ? '/' + e.winnerModel : ''}`
    : 'no winner';
  const cascade = e.slotOrder?.length ? ` cascade:[${e.slotOrder.slice(0, 4).join(',')}]` : '';
  return {
    id: e.id,
    timestamp: time,
    level: e.via === 'none' ? 'warn' : 'info',
    source: 'route',
    message: `cap:${e.capability} via:${e.via} ${winner}${cascade}`,
  };
}

export function AICoreLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug'>('all');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const routingLog = useVoiceStore(s => s.routingLog);
  const activeProvider = useVoiceStore(s => s.activeProvider);
  const voiceStatus = useVoiceStore(s => s.voiceStatus);

  const routeLogs = useMemo(
    () => routingLog.slice(0, 25).map(routeToLog),
    [routingLog],
  );

  const reloadLogs = useCallback(async () => {
    try {
      const loaded = await loadLogs(80);
      if (loaded.length > 0) {
        setLogs(loaded.map(mapToLogEntry));
      } else {
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
    void reloadLogs().then(() => setLoading(false));
    const t = window.setInterval(() => void reloadLogs(), 15_000);
    return () => window.clearInterval(t);
  }, [reloadLogs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0; // newest routing at top of merged view
  }, [routeLogs, logs]);

  const addLog = async (level: LogEntry['level'], source: string, message: string) => {
    await logMessage(level, source, message);
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

  useEffect(() => {
    (window as unknown as Record<string, unknown>).axeLog = addLog;
    return () => { delete (window as unknown as Record<string, unknown>).axeLog; };
  }, []);

  const clearLogs = async () => {
    setLogs([]);
    localStorage.removeItem('axe_core_logs');
  };

  const exportLogs = () => {
    const merged = [...routeLogs, ...logs];
    const text = merged.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `axe-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const merged = useMemo(() => {
    const all = [...routeLogs, ...logs];
    if (filter === 'all') return all.slice(0, 60);
    return all.filter(l => l.level === filter).slice(0, 60);
  }, [routeLogs, logs, filter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 pb-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['all', 'info', 'warn', 'error'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-[8px] px-1.5 py-0.5 rounded capitalize"
            style={{
              background: filter === f ? 'rgba(34,211,238,0.15)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(34,211,238,0.3)' : 'transparent'}`,
              color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        {activeProvider && (
          <span className="text-[8px] font-mono px-1" style={{ color: 'var(--accent-cyan)' }}>
            {activeProvider} · {voiceStatus}
          </span>
        )}
        <button onClick={exportLogs} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }} title="Export"><Download size={10} /></button>
        <button onClick={() => void clearLogs()} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }} title="Clear"><Trash2 size={10} /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto mt-1 space-y-0.5 font-mono-data min-h-0" style={{ maxHeight: 180 }}>
        {loading && merged.length === 0 && (
          <div className="text-[9px] text-center py-3" style={{ color: 'var(--text-muted)' }}>Loading…</div>
        )}
        {!loading && merged.length === 0 && (
          <div className="text-[9px] text-center py-3" style={{ color: 'var(--text-muted)' }}>
            No logs yet — send a message to see routing
          </div>
        )}
        {merged.map(log => (
          <div key={log.id} className="flex gap-1 text-[8px] leading-tight">
            <span style={{ color: 'var(--text-muted)' }}>{log.timestamp}</span>
            <span style={{ color: LEVEL_COLORS[log.level], fontWeight: 600 }}>
              {log.level === 'info' ? 'INF' : log.level === 'warn' ? 'WRN' : log.level === 'error' ? 'ERR' : 'DBG'}
            </span>
            <span style={{ color: log.source === 'route' ? '#A78BFA' : 'var(--accent-blue)' }}>{log.source}</span>
            <span className="truncate" style={{ color: 'var(--text-primary)' }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
