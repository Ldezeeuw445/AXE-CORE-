import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Plus, Bot, Check, X, Zap, Clock, Circle } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  listDurableTasks, createDurableTask, updateDurableTask, deleteDurableTask,
  type DurableTaskRun,
} from '@/infrastructure/gateways/axeCoreApiService';

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
  dueAt?: number;
}

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

/**
 * The kanban status this page shows lives in `metadata.uiStatus`, not the
 * durable kernel's `core_tasks.status` column. That column is a real state
 * machine gated by worker leases (see task_runtime.py's TRANSITIONS) — a
 * plain "remember to renew the domain" item can't jump straight from
 * `queued` to `done` there, and the machine's CHECK constraint doesn't even
 * accept the literal string `'todo'` this UI used to write. Falls back to a
 * status-derived guess only for rows this page didn't create (e.g. real
 * agentic/task_manage runs dispatched from chat), so those still show up
 * sensibly instead of stuck at "To Do" forever.
 */
function uiStatusOf(row: DurableTaskRun): TaskStatus {
  const stored = row.metadata?.uiStatus;
  if (stored === 'todo' || stored === 'in-progress' || stored === 'done' || stored === 'blocked') return stored;
  if (row.status === 'completed' || row.status === 'done') return 'done';
  if (row.status === 'failed' || row.status === 'rejected' || row.status === 'cancelled') return 'blocked';
  if (row.status === 'queued' || row.status === 'pending') return 'todo';
  return 'in-progress';
}

function progressFromRow(row: DurableTaskRun): number {
  const progress = row.metadata?.progress;
  if (typeof progress === 'number') return progress;
  const status = uiStatusOf(row);
  return status === 'done' ? 100 : status === 'in-progress' ? 55 : 0;
}

function dueFromRow(row: DurableTaskRun): number | undefined {
  const raw = row.metadata?.dueAt;
  if (typeof raw !== 'string' || !raw) return undefined;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** Human due-date label + whether it's overdue (only meaningful for open tasks). */
function dueLabel(dueAt: number): { text: string; overdue: boolean } {
  const now = Date.now();
  const overdue = dueAt < now;
  const d = new Date(dueAt);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const text = d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit', minute: '2-digit',
  });
  return { text, overdue };
}

function normalizeRows(rows: DurableTaskRun[]): Task[] {
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: uiStatusOf(row),
    priority: row.priority,
    assignee: row.assignee ?? 'AXE Core',
    createdAt: new Date(row.created_at).getTime(),
    progress: progressFromRow(row),
    routedBy: row.assignee === 'AXE Core' ? 'user' : 'axe-core',
    dueAt: dueFromRow(row),
  }));
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [routing, setRouting] = useState(false);
  // Deep-link support: chat can send ?open=<taskId> to jump straight to a
  // specific task (see chatActionService.ts resolveRecordDeepLink).
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const taskRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [newTask, setNewTask] = useState<{ title: string; description: string; priority: TaskPriority; assignee: string; dueAt: string }>({
    title: '', description: '', priority: 'medium', assignee: 'AXE Core', dueAt: '',
  });

  const refresh = async () => {
    try {
      const { tasks: rows } = await listDurableTasks({ limit: 100 });
      setTasks(normalizeRows(rows));
    } catch (e) {
      // Leave whatever was last loaded rather than blanking the board, but
      // say so — a silent failure here is indistinguishable from "no tasks".
      toast.error(e instanceof Error ? e.message : 'Could not reach AXE API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Once tasks are loaded, honor a deep-link (?open=<id>) by clearing any
  // status filter that would hide it, scrolling it into view, and briefly
  // highlighting it. Falls through silently if the id no longer exists.
  useEffect(() => {
    if (!openId || loading) return;
    const task = tasks.find(t => t.id === openId);
    if (!task) return;
    setFilterStatus('all');
    setHighlightedId(openId);
    requestAnimationFrame(() => {
      taskRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearParams = new URLSearchParams(searchParams);
    clearParams.delete('open');
    setSearchParams(clearParams, { replace: true });
    const timer = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading, tasks]);

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    // Schedule is stored in metadata.dueAt (ISO), same as before. capability
    // 'task_manage' is what makes this a real, worked task instead of a dead
    // row: axe-task-worker picks it up (task_manage_handler), acknowledges
    // it, and leaves a memory trail tagged agentId 'task_agent' — the same
    // pattern cron_manager/crewai_manager already use.
    const dueIso = newTask.dueAt ? new Date(newTask.dueAt).toISOString() : undefined;
    try {
      await createDurableTask({
        title: newTask.title.trim(),
        goal: newTask.description.trim() || newTask.title.trim(),
        description: newTask.description.trim() || undefined,
        priority: newTask.priority,
        assignee: newTask.assignee,
        requested_by: 'luka',
        capability: 'task_manage',
        execution_mode: 'read',
        metadata: {
          uiStatus: 'todo', progress: 0,
          routedBy: newTask.assignee === 'AXE Core' ? 'user' : 'axe-core',
          ...(dueIso ? { dueAt: dueIso } : {}),
        },
      });
      setNewTask({ title: '', description: '', priority: 'medium', assignee: 'AXE Core', dueAt: '' });
      setAdding(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create task');
    }
  };

  const updateStatus = async (id: string, status: TaskStatus) => {
    try {
      await updateDurableTask(id, {
        metadata: { uiStatus: status, progress: status === 'done' ? 100 : status === 'in-progress' ? 55 : 0 },
      });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update task');
    }
  };

  const updateProgress = async (id: string, delta: number) => {
    const current = tasks.find(t => t.id === id);
    if (!current) return;
    const nextProgress = Math.max(0, Math.min(100, current.progress + delta));
    try {
      await updateDurableTask(id, { metadata: { progress: nextProgress } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update task');
    }
  };

  const removeTask = async (id: string) => {
    try {
      await deleteDurableTask(id);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete task');
    }
  };

  const autoRoute = async () => {
    setRouting(true);
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
    try {
      for (const task of tasks) {
        if (task.assignee === 'AXE Core' && task.status === 'todo') {
          const matched = Object.entries(agentMap).find(([kw]) => task.title.toLowerCase().includes(kw));
          if (matched) {
            await updateDurableTask(task.id, {
              assignee: matched[1],
              metadata: { uiStatus: 'in-progress', progress: 25, routedBy: 'axe-core' },
            });
          }
        }
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Auto-route failed');
    } finally {
      setRouting(false);
    }
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
                <label className="flex items-center gap-2 text-xs-custom px-1" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={13} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="shrink-0">Schedule</span>
                  <input
                    type="datetime-local"
                    value={newTask.dueAt}
                    onChange={e => setNewTask(n => ({ ...n, dueAt: e.target.value }))}
                    className="flex-1 text-xs-custom px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)', colorScheme: 'dark' }}
                  />
                  {newTask.dueAt && (
                    <button onClick={() => setNewTask(n => ({ ...n, dueAt: '' }))} className="shrink-0 px-1.5 py-1 rounded" style={{ color: 'var(--text-muted)' }} title="Clear schedule"><X size={12} /></button>
                  )}
                </label>
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
            <motion.div
              key={task.id}
              ref={el => { taskRefs.current[task.id] = el; }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              style={highlightedId === task.id ? { outline: '2px solid var(--accent-cyan)', outlineOffset: 2, borderRadius: 12 } : undefined}
            >
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
                        {task.dueAt != null && (() => {
                          const { text, overdue } = dueLabel(task.dueAt);
                          const isLate = overdue && task.status !== 'done';
                          return (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1"
                              style={{
                                background: isLate ? 'rgba(239,68,68,0.12)' : 'rgba(34,211,238,0.1)',
                                color: isLate ? 'var(--error)' : 'var(--accent-cyan)',
                                border: `1px solid ${isLate ? 'rgba(239,68,68,0.3)' : 'rgba(34,211,238,0.25)'}`,
                              }}
                              title={isLate ? 'Over tijd' : 'Gepland'}
                            >
                              <Clock size={9} /> {text}{isLate ? ' · te laat' : ''}
                            </span>
                          );
                        })()}
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
