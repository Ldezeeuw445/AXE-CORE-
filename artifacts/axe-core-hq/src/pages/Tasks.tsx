import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bot, Check, X, Zap, Clock, Circle } from 'lucide-react';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { getSupabase } from '@/lib/supabaseClient';

type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked';
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

const AGENTS = ['AXE Core', 'Coding Agent', 'Research Agent', 'Memory Agent', 'Browser Agent', 'Trading Agent', 'System Agent', 'Vision Agent'];

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  createdAt: number;
  progress: number;
  routedBy?: 'user' | 'axe-core';
}

type CoreTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: TaskPriority;
  assignee: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_CFG: Record<TaskStatus, { color: string; label: string }> = {
  todo: { color: 'var(--text-muted)', label: 'To Do' },
  'in-progress': { color: 'var(--accent-cyan)', label: 'In Progress' },
  done: { color: 'var(--success)', label: 'Done' },
  blocked: { color: 'var(--error)', label: 'Blocked' },
};

const PRIORITY_CFG: Record<TaskPriority, { color: string }> = {
  low: { color: 'var(--text-muted)' },
  medium: { color: 'var(--accent-blue)' },
  high: { color: 'var(--warning)' },
  critical: { color: 'var(--error)' },
};

function mapStatus(status: string): TaskStatus {
  if (status === 'done' || status === 'approved') return 'done';
  if (status === 'blocked' || status === 'rejected' || status === 'failed') return 'blocked';
  if (status === 'in_progress' || status === 'queued' || status === 'waiting_approval') return 'in-progress';
  return 'todo';
}

function progressFromRow(row: CoreTaskRow): number {
  const progress = row.metadata?.progress;
  if (typeof progress === 'number') return progress;
  return row.status === 'done' ? 100 : row.status === 'in_progress' ? 55 : 0;
}

function normalizeRows(rows: CoreTaskRow[]): Task[] {
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: mapStatus(row.status),
    priority: row.priority,
    assignee: row.assignee ?? 'AXE Core',
    createdAt: new Date(row.created_at).getTime(),
    progress: progressFromRow(row),
    routedBy: row.assignee === 'AXE Core' ? 'user' : 'axe-core',
  }));
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [routing, setRouting] = useState(false);
  const [newTask, setNewTask] = useState<{ title: string; description: string; priority: TaskPriority; assignee: string }>({
    title: '', description: '', priority: 'medium', assignee: 'AXE Core',
  });

  const refresh = async () => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data } = await sb.from('core_tasks').select('*').order('created_at', { ascending: false }).limit(100);
    setTasks(normalizeRows((data ?? []) as CoreTaskRow[]));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('core_tasks').insert({
      title: newTask.title.trim(),
      description: newTask.description.trim() || null,
      status: 'pending',
      priority: newTask.priority,
      source_app: 'axe_core',
      requested_by: 'ui',
      assignee: newTask.assignee,
      execution_mode: 'read',
      metadata: { progress: 0, routedBy: newTask.assignee === 'AXE Core' ? 'user' : 'axe-core' },
    });
    setNewTask({ title: '', description: '', priority: 'medium', assignee: 'AXE Core' });
    setAdding(false);
    await refresh();
  };

  const updateStatus = async (id: string, status: TaskStatus) => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('core_tasks').update({
      status: status === 'in-progress' ? 'in_progress' : status,
      metadata: { progress: status === 'done' ? 100 : status === 'in-progress' ? 55 : 0 },
    }).eq('id', id);
    await refresh();
  };

  const updateProgress = async (id: string, delta: number) => {
    const current = tasks.find(t => t.id === id);
    if (!current) return;
    const sb = getSupabase();
    if (!sb) return;
    const nextProgress = Math.max(0, Math.min(100, current.progress + delta));
    await sb.from('core_tasks').update({ metadata: { progress: nextProgress } }).eq('id', id);
    await refresh();
  };

  const removeTask = async (id: string) => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('core_tasks').delete().eq('id', id);
    await refresh();
  };

  const autoRoute = async () => {
    setRouting(true);
    const sb = getSupabase();
    if (!sb) {
      setRouting(false);
      return;
    }
    const agentMap: Record<string, string> = {
      code: 'Coding Agent',
      build: 'Coding Agent',
      refactor: 'Coding Agent',
      research: 'Research Agent',
      analyze: 'Research Agent',
      find: 'Research Agent',
      remember: 'Memory Agent',
      store: 'Memory Agent',
      save: 'Memory Agent',
      browse: 'Browser Agent',
      scrape: 'Browser Agent',
      web: 'Browser Agent',
      trade: 'Trading Agent',
      buy: 'Trading Agent',
      sell: 'Trading Agent',
    };
    for (const task of tasks) {
      if (task.assignee === 'AXE Core' && task.status === 'todo') {
        const matched = Object.entries(agentMap).find(([kw]) => task.title.toLowerCase().includes(kw));
        if (matched) {
          await sb.from('core_tasks').update({
            assignee: matched[1],
            status: 'in_progress',
            metadata: { progress: 25, routedBy: 'axe-core' },
          }).eq('id', task.id);
        }
      }
    }
    await refresh();
    setRouting(false);
  };

  const displayed = filterStatus === 'all' ? tasks : tasks.filter(t => t.status === filterStatus);
  const counts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    'in-progress': tasks.filter(t => t.status === 'in-progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <motion.div className="p-4 sm:p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Task Management</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{loading ? 'Loading…' : `${tasks.length} tasks · ${counts.done} done`}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => { void autoRoute(); }}
            disabled={routing || tasks.filter(t => t.assignee === 'AXE Core' && t.status === 'todo').length === 0}
            className="inline-flex items-center justify-center gap-1.5 text-xs-custom px-3 py-2 rounded-lg transition-all"
            style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)', opacity: routing ? 0.6 : 1 }}
          >
            {routing ? <span className="animate-spin inline-block w-3 h-3 border border-cyan-400 border-t-transparent rounded-full" /> : <Zap size={12} />}
            {routing ? 'Routing...' : 'Auto-Route (AXE Core)'}
          </button>
          <button
            onClick={() => setAdding(v => !v)}
            className="inline-flex items-center justify-center gap-1.5 text-xs-custom px-3 py-2 rounded-lg"
            style={{ background: 'var(--accent-cyan)', color: '#000' }}
          >
            <Plus size={13} /> New Task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {[
          { label: 'Total', val: tasks.length, color: 'var(--text-primary)' },
          { label: 'To Do', val: counts.todo, color: 'var(--text-muted)' },
          { label: 'In Progress', val: counts['in-progress'], color: 'var(--accent-cyan)' },
          { label: 'Done', val: counts.done, color: 'var(--success)' },
        ].map(({ label, val, color }) => (
          <WidgetCard key={label} title="">
            <div className="text-center py-0.5">
              <div className="text-2xl font-bold font-mono-data" style={{ color }}>{val}</div>
              <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          </WidgetCard>
        ))}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -8, height: 0 }} className="overflow-hidden mb-4">
            <WidgetCard title="New Task">
              <div className="space-y-2.5">
                <input
                  autoFocus
                  value={newTask.title}
                  onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) { void addTask(); } if (e.key === 'Escape') setAdding(false); }}
                  placeholder="Task title..."
                  className="w-full text-small px-3 py-2 rounded-lg outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                />
                <input
                  value={newTask.description}
                  onChange={e => setNewTask(n => ({ ...n, description: e.target.value }))}
                  placeholder="Description (optional)..."
                  className="w-full text-xs-custom px-3 py-2 rounded-lg outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
                />
                <div className="flex gap-2">
                  <select
                    value={newTask.priority}
                    onChange={e => setNewTask(n => ({ ...n, priority: e.target.value as TaskPriority }))}
                    className="flex-1 text-xs-custom px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
                  >
                    {(['low', 'medium', 'high', 'critical'] as const).map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} Priority</option>)}
                  </select>
                  <select
                    value={newTask.assignee}
                    onChange={e => setNewTask(n => ({ ...n, assignee: e.target.value }))}
                    className="flex-1 text-xs-custom px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
                  >
                    {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button onClick={() => { void addTask(); }} className="px-4 py-1.5 rounded-lg text-xs-custom font-medium" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Add</button>
                  <button onClick={() => setAdding(false)} className="px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}><X size={13} /></button>
                </div>
              </div>
            </WidgetCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap gap-1 mb-3">
        {(['all', 'todo', 'in-progress', 'done', 'blocked'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className="text-xs-custom px-2.5 py-1 rounded-md transition-all"
            style={{ background: filterStatus === f ? 'var(--bg-active)' : 'transparent', color: filterStatus === f ? 'var(--accent-cyan)' : 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
          >
            {f === 'all' ? 'All' : STATUS_CFG[f as TaskStatus]?.label ?? f}
            {f !== 'all' && tasks.filter(t => t.status === f).length > 0 && (
              <span className="ml-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {tasks.filter(t => t.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Circle size={28} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <span className="text-small" style={{ color: 'var(--text-muted)' }}>No tasks yet — create one above</span>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((task, i) => (
            <motion.div key={task.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <WidgetCard title="">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: PRIORITY_CFG[task.priority].color, display: 'inline-block' }} title={task.priority} />
                        <span className={`text-small font-medium ${task.status === 'done' ? 'line-through' : ''}`} style={{ color: task.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{task.title}</span>
                        {task.routedBy === 'axe-core' && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>AXE Routed</span>}
                      </div>
                      {task.description && <p className="text-xs-custom mb-2" style={{ color: 'var(--text-muted)' }}>{task.description}</p>}
                      <div className="flex items-center gap-2">
                        <Bot size={11} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>{task.assignee}</span>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <Clock size={10} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{new Date(task.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => { void updateStatus(task.id, task.status === 'done' ? 'todo' : 'done'); }} title="Toggle done">
                        <Check size={12} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${STATUS_CFG[task.status].color}15`, color: STATUS_CFG[task.status].color, border: `1px solid ${STATUS_CFG[task.status].color}30` }}>
                        {STATUS_CFG[task.status].label}
                      </span>
                      <button onClick={() => { void removeTask(task.id); }} style={{ color: 'var(--text-muted)' }} title="Delete"><X size={12} /></button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${task.progress}%`, background: `linear-gradient(90deg, ${PRIORITY_CFG[task.priority].color}, var(--accent-cyan))` }} />
                    </div>
                    <span className="text-[9px] w-8 text-right" style={{ color: 'var(--text-muted)' }}>{task.progress}%</span>
                    <button onClick={() => { void updateProgress(task.id, -10); }} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>-</button>
                    <button onClick={() => { void updateProgress(task.id, 10); }} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>+</button>
                  </div>
                </div>
              </WidgetCard>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
