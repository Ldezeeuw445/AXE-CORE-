import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Calendar, Play, Pause, RefreshCw, Zap, Clock, AlertCircle, CheckCircle, Circle } from 'lucide-react';
import {
  n8nListWorkflows, n8nActivate, n8nDeactivate, n8nExecute,
  isAxeApiConfigured, type N8nWorkflow,
} from '@/infrastructure/gateways/axeCoreApiService';

// Parse cron expression to human-readable
function cronToHuman(cron: string | null | undefined): string {
  if (!cron) return 'Manual';
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;

  if (min === '0' && hour !== '*' && dom === '*' && dow === '*') {
    const h = parseInt(hour);
    return `Daily at ${h.toString().padStart(2, '0')}:00`;
  }
  if (min === '0' && hour !== '*' && dom !== '*') {
    return `Monthly on day ${dom} at ${hour}:00`;
  }
  if (dow !== '*' && dom === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `Weekly (${days[parseInt(dow)] ?? dow}) at ${hour}:${min.padStart(2,'0')}`;
  }
  if (min !== '*' && hour === '*') return `Every hour at :${min.padStart(2,'0')}`;
  return cron;
}

function extractCron(workflow: N8nWorkflow): string | null {
  if (!workflow.nodes) return null;
  const triggerNode = (workflow.nodes as Array<Record<string, unknown>>).find(
    (n: Record<string, unknown>) => n.type === 'n8n-nodes-base.cron' || n.type === 'n8n-nodes-base.scheduleTrigger'
  );
  if (!triggerNode) return null;
  const params = triggerNode.parameters as Record<string, unknown> | undefined;
  if (!params) return null;
  // Try different cron field names
  return (params.cronExpression as string)
    ?? (params.triggerTimes as { item?: Array<Record<string, unknown>> })?.item?.[0]?.cronExpression as string
    ?? null;
}

const WORKFLOW_ICONS: Record<string, string> = {
  morning: '🌅',
  brief: '🌅',
  news: '📰',
  recap: '📊',
  market: '📈',
  intel: '🔭',
  weekly: '📋',
  alert: '🔔',
  report: '📄',
  sync: '🔄',
  deploy: '🚀',
  backup: '💾',
};

function getIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(WORKFLOW_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '⚙️';
}

export default function CronManager() {
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [lastRun, setLastRun] = useState<Record<string, string>>({});
  // Deep-link support: chat can send ?open=<workflowId> to jump straight to
  // a specific cron workflow (see chatActionService.ts resolveRecordDeepLink).
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const workflowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await n8nListWorkflows();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAxeApiConfigured) { setLoading(false); return; }
    load();
  }, []);

  // Once workflows are loaded, honor a deep-link (?open=<id>) by scrolling
  // it into view and briefly highlighting it. Falls through silently if the
  // id no longer exists.
  useEffect(() => {
    if (!openId || loading) return;
    const wf = workflows.find(w => w.id === openId);
    if (!wf) return;
    setHighlightedId(openId);
    requestAnimationFrame(() => {
      workflowRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearParams = new URLSearchParams(searchParams);
    clearParams.delete('open');
    setSearchParams(clearParams, { replace: true });
    const timer = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading, workflows]);

  const handleToggle = async (wf: N8nWorkflow) => {
    setToggling(s => new Set([...s, wf.id]));
    try {
      if (wf.active) {
        await n8nDeactivate(wf.id);
      } else {
        await n8nActivate(wf.id);
      }
      setWorkflows(ws => ws.map(w => w.id === wf.id ? { ...w, active: !w.active } : w));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setToggling(s => { const n = new Set(s); n.delete(wf.id); return n; });
    }
  };

  const handleRunNow = async (wf: N8nWorkflow) => {
    setRunning(s => new Set([...s, wf.id]));
    try {
      await n8nExecute(wf.id);
      setLastRun(r => ({ ...r, [wf.id]: new Date().toLocaleTimeString() }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Execution failed');
    } finally {
      setTimeout(() => setRunning(s => { const n = new Set(s); n.delete(wf.id); return n; }), 2000);
    }
  };

  if (!isAxeApiConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ color: 'var(--text-secondary)' }}>
        <AlertCircle size={32} style={{ color: 'var(--warning)' }} />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>AXE Core API not configured</p>
        <p className="text-sm text-center max-w-md">
          Deploy the VPS service first. See <code className="px-1 rounded" style={{ background: '#1a1a1a' }}>backend/axe_api/deploy.sh</code>
        </p>
      </div>
    );
  }

  const active = workflows.filter(w => w.active).length;
  const withCron = workflows.filter(w => extractCron(w));

  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-page-title font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Cron Manager
          </h1>
          <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
            {loading ? 'Loading from n8n…' : `${active} active · ${workflows.length} total · ${withCron.length} scheduled`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)' }} />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-muted)' }}>
          <Calendar size={28} />
          <span className="text-sm">No workflows found in n8n</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {workflows.map((wf, i) => {
            const cron = extractCron(wf);
            const cronHuman = cronToHuman(cron);
            const isRunning = running.has(wf.id);
            const isToggling = toggling.has(wf.id);
            const ranAt = lastRun[wf.id];

            return (
              <motion.div
                key={wf.id}
                ref={el => { workflowRefs.current[wf.id] = el; }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.3 }}
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${wf.active ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: highlightedId === wf.id ? '0 0 0 2px rgba(34,211,238,0.4)' : undefined,
                }}
              >
                {/* Header */}
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{getIcon(wf.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {wf.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {wf.active ? (
                        <CheckCircle size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      ) : (
                        <Circle size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )}
                      <span className="text-xs" style={{ color: wf.active ? 'var(--success)' : 'var(--text-muted)' }}>
                        {wf.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Schedule */}
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <Clock size={12} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {cronHuman}
                  </span>
                  {cron && (
                    <span className="text-xs ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
                      {cron}
                    </span>
                  )}
                </div>

                {/* Last manual run */}
                {ranAt && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
                    <CheckCircle size={10} />
                    Triggered at {ranAt}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => handleToggle(wf)}
                    disabled={isToggling}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: wf.active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      border: `1px solid ${wf.active ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                      color: wf.active ? '#ef4444' : '#4ade80',
                      opacity: isToggling ? 0.5 : 1,
                    }}
                  >
                    {isToggling ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : wf.active ? (
                      <><Pause size={11} /> Pause</>
                    ) : (
                      <><Play size={11} /> Activate</>
                    )}
                  </button>
                  <button
                    onClick={() => handleRunNow(wf)}
                    disabled={isRunning}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: isRunning ? 'rgba(34,211,238,0.15)' : 'rgba(34,211,238,0.08)',
                      border: '1px solid rgba(34,211,238,0.2)',
                      color: 'var(--accent-cyan)',
                      opacity: isRunning ? 0.7 : 1,
                    }}
                  >
                    {isRunning ? (
                      <><RefreshCw size={11} className="animate-spin" /> Running…</>
                    ) : (
                      <><Zap size={11} /> Run Now</>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
