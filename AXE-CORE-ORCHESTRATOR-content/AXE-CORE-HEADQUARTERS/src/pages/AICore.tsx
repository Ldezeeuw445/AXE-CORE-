import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Activity, Clock, Search, Filter, X, ChevronDown, ChevronUp,
  RefreshCw, Zap, AlertTriangle, CheckCircle, Loader2, Server,
  Terminal, BarChart3, Layers, Eye, EyeOff,
} from 'lucide-react';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { getSupabase } from '@/lib/supabaseClient';
import { isAgenticModeEnabled, setAgenticMode } from '@/services/agenticEngine';
import { useVoiceStore } from '@/store/voiceStore';

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface AgenticLog {
  id: string;
  conversation_id: string;
  user_id: string | null;
  agent: string;
  model: string | null;
  provider: string | null;
  step_number: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: Record<string, unknown> | null;
  status: 'pending' | 'running' | 'success' | 'error';
  latency_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface FilterState {
  agent: string;
  model: string;
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatLatency(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: string) {
  switch (status) {
    case 'success': return <CheckCircle size={13} style={{ color: 'var(--success)' }} />;
    case 'error': return <AlertTriangle size={13} style={{ color: 'var(--error)' }} />;
    case 'running': return <Loader2 size={13} className="animate-spin" style={{ color: 'var(--warning)' }} />;
    default: return <Clock size={13} style={{ color: 'var(--text-muted)' }} />;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'var(--success)';
    case 'error': return 'var(--error)';
    case 'running': return 'var(--warning)';
    default: return 'var(--text-muted)';
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user': return 'USER';
    case 'assistant': return 'LLM';
    case 'tool': return 'TOOL';
    case 'system': return 'SYS';
    default: return role.toUpperCase();
  }
}

function roleColor(role: string): string {
  switch (role) {
    case 'user': return '#22D3EE';
    case 'assistant': return '#A5F3FC';
    case 'tool': return '#F59E0B';
    case 'system': return '#8B5CF6';
    default: return '#6B7280';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function AICore() {
  const voice = useVoiceStore();
  const [logs, setLogs] = useState<AgenticLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AgenticLog | null>(null);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);
  const [agenticMode, setAgenticModeState] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    agent: '', model: '', status: '', search: '', dateFrom: '', dateTo: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<(() => void) | null>(null);

  // ── Load agentic mode state ────────────────────────────────────────────────
  useEffect(() => {
    isAgenticModeEnabled().then(setAgenticModeState);
  }, []);

  const toggleAgenticMode = useCallback(() => {
    const next = !agenticMode;
    setAgenticMode(next);
    setAgenticModeState(next);
  }, [agenticMode]);

  // ── Load initial logs ──────────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }

    try {
      const { data, error } = await sb
        .from('agentic_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('[AICore] loadLogs error:', error.message);
        return;
      }

      setLogs((data ?? []) as AgenticLog[]);
    } catch (err) {
      console.error('[AICore] loadLogs failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!live) {
      realtimeRef.current?.();
      realtimeRef.current = null;
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    const channel = sb
      .channel('agentic-logs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agentic_logs' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLogs(prev => {
              const newLog = payload.new as AgenticLog;
              if (prev.some(l => l.id === newLog.id)) return prev;
              return [newLog, ...prev].slice(0, 500);
            });
          }
        }
      )
      .subscribe();

    realtimeRef.current = () => { void channel.unsubscribe(); };

    return () => {
      realtimeRef.current?.();
      realtimeRef.current = null;
    };
  }, [live]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current && live) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length, live]);

  // ── Filtered logs ──────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filters.agent && log.agent !== filters.agent) return false;
      if (filters.model && log.model !== filters.model) return false;
      if (filters.status && log.status !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [
          log.content,
          log.tool_name,
          log.agent,
          log.model,
          log.conversation_id,
          JSON.stringify(log.tool_input),
          JSON.stringify(log.tool_output),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.dateFrom) {
        if (new Date(log.created_at) < new Date(filters.dateFrom)) return false;
      }
      if (filters.dateTo) {
        if (new Date(log.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      }
      return true;
    });
  }, [logs, filters]);

  // ── Unique filter values ───────────────────────────────────────────────────
  const uniqueAgents = useMemo(() => [...new Set(logs.map(l => l.agent).filter(Boolean))].sort(), [logs]);
  const uniqueModels = useMemo(() => [...new Set(logs.map(l => l.model).filter(Boolean))].sort(), [logs]);

  // ── Conversation grouping ──────────────────────────────────────────────────
  const conversations = useMemo(() => {
    const map = new Map<string, AgenticLog[]>();
    for (const log of filteredLogs) {
      const arr = map.get(log.conversation_id) || [];
      arr.push(log);
      map.set(log.conversation_id, arr);
    }
    // Sort each conversation by step_number
    for (const [, arr] of map) {
      arr.sort((a, b) => a.step_number - b.step_number);
    }
    // Sort conversations by latest log
    return Array.from(map.entries()).sort((a, b) => {
      const aLatest = a[1][a[1].length - 1]?.created_at || '';
      const bLatest = b[1][b[1].length - 1]?.created_at || '';
      return bLatest.localeCompare(aLatest);
    });
  }, [filteredLogs]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter(l => l.status === 'success').length;
    const error = logs.filter(l => l.status === 'error').length;
    const running = logs.filter(l => l.status === 'running').length;
    const latencies = logs.map(l => l.latency_ms).filter((l): l is number => l !== null && l > 0);
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const uniqueConvs = new Set(logs.map(l => l.conversation_id)).size;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

    return { total, success, error, running, avgLatency, uniqueConvs, successRate };
  }, [logs]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="flex flex-col xl:flex-row gap-3 p-3 h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* ── LEFT: Stats + Controls ─────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 w-full xl:w-[220px] flex-shrink-0 overflow-visible xl:overflow-y-auto">
        <WidgetCard title="AGENTIC ENGINE" headerAction={<LiveIndicator size={6} active={live} />}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Mode</span>
            <button
              onClick={toggleAgenticMode}
              className="text-[10px] px-2 py-0.5 rounded-md font-medium transition-all"
              style={{
                background: agenticMode ? 'var(--accent-cyan)' : 'var(--bg-hover)',
                color: agenticMode ? '#000' : 'var(--text-muted)',
              }}
            >
              {agenticMode ? 'AGENTIC ON' : 'AGENTIC OFF'}
            </button>
          </div>
          <div className="space-y-1.5">
            {[
              { icon: Activity, label: 'Status', val: live ? 'Live' : 'Paused', ok: live },
              { icon: Zap, label: 'Total Steps', val: String(stats.total), ok: stats.total > 0 },
              { icon: CheckCircle, label: 'Success Rate', val: `${stats.successRate}%`, ok: stats.successRate > 80 },
              { icon: Clock, label: 'Avg Latency', val: formatLatency(stats.avgLatency), ok: stats.avgLatency < 5000 },
              { icon: Layers, label: 'Conversations', val: String(stats.uniqueConvs), ok: stats.uniqueConvs > 0 },
            ].map(({ icon: Icon, label, val, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <span className="text-[10px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="BREAKDOWN">
          <div className="space-y-2">
            <StatBar label="Success" value={stats.success} total={stats.total} color="#10B981" />
            <StatBar label="Error" value={stats.error} total={stats.total} color="#EF4444" />
            <StatBar label="Running" value={stats.running} total={stats.total} color="#F59E0B" />
          </div>
        </WidgetCard>

        <WidgetCard title="CONTROLS">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setLive(v => !v)}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-all"
              style={{
                background: live ? 'rgba(34,211,238,0.1)' : 'var(--bg-hover)',
                color: live ? 'var(--accent-cyan)' : 'var(--text-muted)',
              }}
            >
              {live ? <Eye size={11} /> : <EyeOff size={11} />}
              {live ? 'Live Feed On' : 'Live Feed Off'}
            </button>
            <button
              onClick={() => { setLoading(true); void loadLogs().then(() => setLoading(false)); }}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md transition-all hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshCw size={11} />
              Refresh Now
            </button>
          </div>
        </WidgetCard>
      </div>

      {/* ── CENTER: Log Feed ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-2xl overflow-hidden" style={{ background: '#030a0a', border: '1px solid rgba(34,211,238,0.1)' }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
          <div className="flex gap-1.5">
            <span className="rounded-full" style={{ width: 10, height: 10, background: 'rgba(255,59,48,0.7)', display: 'inline-block' }} />
            <span className="rounded-full" style={{ width: 10, height: 10, background: 'rgba(255,196,0,0.7)', display: 'inline-block' }} />
            <span className="rounded-full" style={{ width: 10, height: 10, background: 'rgba(50,215,75,0.7)', display: 'inline-block' }} />
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Terminal size={11} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>AGENTIC LOGS</span>
          </div>
          <div className="flex-1" />
          {/* Search */}
          <div className="flex items-center gap-1.5">
            <Search size={11} style={{ color: 'var(--text-muted)' }} />
            <input
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Search logs..."
              className="text-[10px] px-2 py-0.5 rounded-md outline-none w-32 xl:w-48"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => setShowFilters(v => !v)}
              className="p-1 rounded-md transition-all"
              style={{
                background: showFilters ? 'rgba(34,211,238,0.1)' : 'transparent',
                color: showFilters ? 'var(--accent-cyan)' : 'var(--text-muted)',
              }}
            >
              <Filter size={11} />
            </button>
            {live && <LiveIndicator size={5} />}
          </div>
        </div>

        {/* Filter bar */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-2 px-4 py-2 flex-shrink-0 overflow-hidden"
              style={{ borderBottom: '1px solid rgba(34,211,238,0.05)', background: 'rgba(0,0,0,0.3)' }}
            >
              <FilterSelect label="Agent" value={filters.agent} options={uniqueAgents} onChange={v => setFilters(f => ({ ...f, agent: v }))} />
              <FilterSelect label="Model" value={filters.model} options={uniqueModels} onChange={v => setFilters(f => ({ ...f, model: v }))} />
              <FilterSelect label="Status" value={filters.status} options={['pending', 'running', 'success', 'error']} onChange={v => setFilters(f => ({ ...f, status: v }))} />
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                className="text-[9px] px-2 py-0.5 rounded-md outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                className="text-[9px] px-2 py-0.5 rounded-md outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => setFilters({ agent: '', model: '', status: '', search: '', dateFrom: '', dateTo: '' })}
                className="text-[9px] px-2 py-0.5 rounded-md"
                style={{ color: 'var(--text-muted)', background: 'var(--bg-hover)' }}
              >
                Clear
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Log stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <Brain size={24} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {logs.length === 0 ? 'No agentic logs yet. Enable agentic mode and send a message.' : 'No logs match your filters.'}
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(([convId, convLogs]) => {
                const isExpanded = expandedConv === convId;
                const latest = convLogs[convLogs.length - 1];
                const first = convLogs[0];
                const hasError = convLogs.some(l => l.status === 'error');
                const allSuccess = convLogs.every(l => l.status === 'success');

                return (
                  <motion.div
                    key={convId}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${hasError ? 'rgba(239,68,68,0.15)' : allSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)'}`,
                    }}
                  >
                    {/* Conversation header */}
                    <button
                      onClick={() => setExpandedConv(isExpanded ? null : convId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover:bg-white/3"
                    >
                      {isExpanded ? <ChevronUp size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />}
                      <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{convId.slice(0, 8)}</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{convLogs.length} steps</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{formatDate(first.created_at)} {formatTimestamp(first.created_at)}</span>
                      <div className="flex-1" />
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                        background: hasError ? 'rgba(239,68,68,0.1)' : allSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                        color: hasError ? 'var(--error)' : allSuccess ? 'var(--success)' : 'var(--warning)',
                      }}>
                        {hasError ? 'ERROR' : allSuccess ? 'DONE' : 'PARTIAL'}
                      </span>
                    </button>

                    {/* Expanded steps */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: 'auto' }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-2 space-y-0.5">
                            {convLogs.map(log => (
                              <button
                                key={log.id}
                                onClick={() => setSelectedLog(log)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all hover:bg-white/5"
                              >
                                <span className="text-[9px] font-mono-data w-5 text-right" style={{ color: 'var(--text-muted)' }}>{log.step_number}</span>
                                <span className="text-[9px] font-mono w-8 text-center rounded px-1" style={{
                                  background: `${roleColor(log.role)}15`,
                                  color: roleColor(log.role),
                                }}>
                                  {roleLabel(log.role)}
                                </span>
                                {log.tool_name && (
                                  <span className="text-[9px] font-mono px-1 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
                                    {log.tool_name}
                                  </span>
                                )}
                                <span className="text-[10px] flex-1 truncate" style={{ color: log.role === 'user' ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>
                                  {(log.content || '').slice(0, 80)}{((log.content || '').length > 80 ? '...' : '') || (log.tool_name ? '→ executing...' : '—')}
                                </span>
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  {statusIcon(log.status)}
                                  {log.latency_ms && (
                                    <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{formatLatency(log.latency_ms)}</span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Detail Panel ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 w-full xl:w-[280px] flex-shrink-0 overflow-visible xl:overflow-y-auto">
        <WidgetCard title="LOG DETAIL">
          {selectedLog ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Step {selectedLog.step_number}</span>
                <span className="text-[9px] font-mono" style={{ color: roleColor(selectedLog.role) }}>{roleLabel(selectedLog.role)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {statusIcon(selectedLog.status)}
                <span className="text-[10px]" style={{ color: statusColor(selectedLog.status) }}>{selectedLog.status.toUpperCase()}</span>
                {selectedLog.latency_ms && (
                  <span className="text-[9px] font-mono-data ml-auto" style={{ color: 'var(--text-muted)' }}>{formatLatency(selectedLog.latency_ms)}</span>
                )}
              </div>
              {selectedLog.model && (
                <div className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>
                  {selectedLog.provider}/{selectedLog.model}
                </div>
              )}
              {selectedLog.agent && (
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Agent: {selectedLog.agent}</div>
              )}
              <div className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>
                {selectedLog.created_at}
              </div>
              <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Content</div>
                <pre className="text-[10px] font-mono-data leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)', maxHeight: 200, overflowY: 'auto' }}>
                  {selectedLog.content || '(no content)'}
                </pre>
              </div>
              {selectedLog.tool_name && (
                <>
                  <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)' }}>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tool: {selectedLog.tool_name}</div>
                    {selectedLog.tool_input && (
                      <pre className="text-[9px] font-mono-data whitespace-pre-wrap break-words" style={{ color: '#F59E0B' }}>
                        {JSON.stringify(selectedLog.tool_input, null, 2)}
                      </pre>
                    )}
                  </div>
                  {selectedLog.tool_output && (
                    <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Output</div>
                      <pre className="text-[9px] font-mono-data whitespace-pre-wrap break-words" style={{ color: 'var(--accent-cyan)' }}>
                        {JSON.stringify(selectedLog.tool_output, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
              <button
                onClick={() => setSelectedLog(null)}
                className="flex items-center gap-1 text-[9px] px-2 py-1 rounded-md transition-all hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={10} /> Close
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <BarChart3 size={20} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Click a log entry to view details</span>
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="CONVERSATION INFO">
          {selectedLog ? (
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Conv ID</span>
                <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-secondary)' }}>{selectedLog.conversation_id.slice(0, 16)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>User</span>
                <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{selectedLog.user_id || '—'}</span>
              </div>
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <pre className="text-[9px] font-mono-data mt-2 p-1.5 rounded" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Select a log entry</span>
          )}
        </WidgetCard>

        <WidgetCard title="LEGEND">
          <div className="space-y-1.5">
            {[
              { label: 'USER', color: '#22D3EE', desc: 'User message' },
              { label: 'LLM', color: '#A5F3FC', desc: 'LLM decision / response' },
              { label: 'TOOL', color: '#F59E0B', desc: 'Tool execution' },
              { label: 'SYS', color: '#8B5CF6', desc: 'System event' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[9px] font-mono w-8 text-center rounded px-1" style={{ background: `${item.color}15`, color: item.color }}>
                  {item.label}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{item.desc}</span>
              </div>
            ))}
            <div className="pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />
            {[
              { icon: CheckCircle, color: 'var(--success)', label: 'Success' },
              { icon: AlertTriangle, color: 'var(--error)', label: 'Error' },
              { icon: Loader2, color: 'var(--warning)', label: 'Running' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <item.icon size={11} style={{ color: item.color }} />
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>

      {/* ── Log Detail Modal (mobile overlay) ──────────────────────────── */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 xl:hidden flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="w-full max-h-[80vh] overflow-y-auto rounded-t-2xl p-4"
              style={{ background: '#0A0A0A', borderTop: '1px solid rgba(34,211,238,0.2)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono" style={{ color: 'var(--accent-cyan)' }}>LOG DETAIL</span>
                <button onClick={() => setSelectedLog(null)}><X size={14} style={{ color: 'var(--text-muted)' }} /></button>
              </div>
              <pre className="text-[10px] font-mono-data whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
                {selectedLog.content || '(no content)'}
              </pre>
              {selectedLog.tool_input && (
                <div className="mt-3">
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Tool Input</div>
                  <pre className="text-[9px] font-mono-data whitespace-pre-wrap break-words" style={{ color: '#F59E0B' }}>
                    {JSON.stringify(selectedLog.tool_input, null, 2)}
                  </pre>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function StatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-[9px] font-mono-data" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-[9px] px-1.5 py-0.5 rounded-md outline-none cursor-pointer"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
      >
        <option value="">All</option>
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
