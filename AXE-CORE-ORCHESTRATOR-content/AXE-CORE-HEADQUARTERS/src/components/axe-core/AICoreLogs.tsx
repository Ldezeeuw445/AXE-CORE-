import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Trash2, Download, Activity, Loader2 } from 'lucide-react';
import {
  loadLogs,
  saveLog,
  clearLogs,
  exportLogsToText,
  type AICoreLogEntry,
} from '@/services/aiCoreLogService';

const LEVEL_COLORS: Record<string, string> = {
  info: '#22D3EE',
  warn: '#F59E0B',
  error: '#EF4444',
  debug: '#8B5CF6',
  system: '#10B981',
};

export function AICoreLogs() {
  const [logs, setLogs] = useState<AICoreLogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'debug' | 'system'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  // Load logs on mount (persistent like WhatsApp)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const loaded = await loadLogs(500);
        if (mounted) {
          setLogs(loaded);
          setIsConnected(true);
        }
      } catch (err) {
        console.error('[AICoreLogs] Failed to load:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Auto-scroll: only scroll to bottom if user is already at bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50; // pixels from bottom
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  // Add log (exposed globally)
  const addLog = useCallback(
    async (level: AICoreLogEntry['level'], source: string, message: string) => {
      await saveLog(level, source, message);
      const updated = await loadLogs(500);
      setLogs(updated);
    },
    []
  );

  // Expose globally
  useEffect(() => {
    (window as unknown as Record<string, unknown>).axeLog = addLog;
    return () => { delete (window as unknown as Record<string, unknown>).axeLog; };
  }, [addLog]);

  // Periodic refresh (every 5 seconds) to catch new logs from other components
  useEffect(() => {
    const interval = setInterval(async () => {
      const updated = await loadLogs(500);
      setLogs(prev => {
        // Only update if there are new logs
        if (updated.length > prev.length) return updated;
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = async () => {
    await clearLogs();
    setLogs([]);
  };

  const handleExport = () => {
    const text = exportLogsToText(logs);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `axe-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1 pb-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <Activity
          size={10}
          style={{
            color: isConnected ? 'var(--accent-cyan)' : 'var(--text-muted)',
          }}
        />
        <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {isConnected ? 'Connected' : 'Offline'}
        </span>
        <div className="flex-1" />
        {(['all', 'info', 'warn', 'error', 'system'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-[8px] px-1.5 py-0.5 rounded capitalize"
            style={{
              background:
                filter === f ? 'rgba(34,211,238,0.15)' : 'transparent',
              border: `1px solid ${filter === f ? 'rgba(34,211,238,0.3)' : 'transparent'}`,
              color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}
          >
            {f}
          </button>
        ))}
        <button
          onClick={handleExport}
          className="p-0.5 rounded"
          style={{ color: 'var(--text-muted)' }}
          title="Export"
        >
          <Download size={10} />
        </button>
        <button
          onClick={handleClear}
          className="p-0.5 rounded"
          style={{ color: 'var(--text-muted)' }}
          title="Clear"
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* Logs area - WhatsApp style scrollable */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto mt-1 space-y-0.5 font-mono-data"
        style={{ maxHeight: 'calc(100% - 30px)' }}
      >
        {isLoading && (
          <div className="flex items-center justify-center gap-1 py-4">
            <Loader2 size={10} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              Loading logs…
            </span>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-[9px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No logs yet
          </div>
        )}

        {filtered.map((log) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex gap-1.5 text-[8px] leading-tight py-0.5 px-1 rounded"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              {new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span
              style={{ color: LEVEL_COLORS[log.level], fontWeight: 600 }}
            >
              {log.level.toUpperCase().padEnd(5)}
            </span>
            <span style={{ color: 'var(--accent-blue)' }}>{log.source}</span>
            <span style={{ color: 'var(--text-primary)' }}>{log.message}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
