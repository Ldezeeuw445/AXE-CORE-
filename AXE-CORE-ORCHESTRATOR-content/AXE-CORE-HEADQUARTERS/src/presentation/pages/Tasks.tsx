import { useState, useEffect } from 'react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Plus, X, Zap, Clock } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { AppTaken, type AppTaak } from './taken/AppTaken';
import { APPS, appMeta, appVan, metMetaApp, type AppId } from '@/domain/apps';
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
  /** Welke van de vijf apps. Uit metadata.app; onbekend valt terug op AXE Core. */
  app: AppId;
}

const STATUS_CFG: Record<TaskStatus, { color: string; label: string }> = {
  todo: { color: 'var(--text-muted)', label: 'To Do' },
  'in-progress': { color: 'var(--accent-cyan)', label: 'In Progress' },
  done: { color: 'var(--success)', label: 'Done' },
  blocked: { color: 'var(--error)', label: 'Blocked' },
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
    app: appVan(row.metadata),
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
  const [newTask, setNewTask] = useState<{ title: string; description: string; priority: TaskPriority; assignee: string; dueAt: string; app: AppId }>({
    title: '', description: '', priority: 'medium', assignee: 'AXE Core', dueAt: '', app: 'axe_core',
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

  /* Een deep-link (?open=<id>) haalt het statusfilter weg, zodat de taak in
     beeld staat.
     Scrollen en oplichten deed hij ook; dat werkte op één lange lijst met een
     ref per taak. Met vijf panelen naast elkaar bestaat die lijst niet meer.
     Het filter weghalen is wat ervan overblijft en het is het deel dat telt:
     zonder dat kon de taak er wél staan en tóch verborgen zijn. */
  useEffect(() => {
    if (!openId || loading) return;
    if (!tasks.some(t => t.id === openId)) return;
    setFilterStatus('all');
    const clearParams = new URLSearchParams(searchParams);
    clearParams.delete('open');
    setSearchParams(clearParams, { replace: true });
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
        metadata: metMetaApp(newTask.app, {
          uiStatus: 'todo', progress: 0,
          routedBy: newTask.assignee === 'AXE Core' ? 'user' : 'axe-core',
          ...(dueIso ? { dueAt: dueIso } : {}),
        }),
      });
      // De app blijft staan: maak je er twee achter elkaar voor Companion,
      // dan is het onzin om hem elke keer opnieuw te kiezen.
      setNewTask(v => ({ title: '', description: '', priority: 'medium', assignee: 'AXE Core', dueAt: '', app: v.app }));
      setAdding(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create task');
    }
  };

  const updateStatus = async (id: string, status: TaskStatus) => {
    try {
      await updateDurableTask(id, {
        /* De app MOET mee. metadata wordt vervangen en niet samengevoegd:
           zonder dit veld verliest een taak zijn app zodra je hem afvinkt, en
           springt hij naar de AXE Core-kolom. Dat is precies het soort stille
           verhuizing waar je nooit achter komt. */
        metadata: metMetaApp(
          tasks.find(t => t.id === id)?.app ?? 'axe_core',
          { uiStatus: status, progress: status === 'done' ? 100 : status === 'in-progress' ? 55 : 0 },
        ),
      });
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

  /* De taken van één app, in de vorm die AppTaken leest. Het statusfilter uit
     de schuifbalk werkt gewoon door: kies je 'todo', dan tonen alle vijf de
     panelen alleen dat. */
  const takenVan = (app: AppId): AppTaak[] =>
    displayed
      .filter(t => t.app === app)
      .map(t => ({
        id: t.id,
        titel: t.title,
        van: t.assignee,
        prioriteit: t.priority,
        deadline: t.dueAt,
        voortgang: t.progress,
        klaar: t.status === 'done',
        stand: t.status,
      }));

  /* Het formulier openen MET die app erin. Zonder dit moest je hem in het
     formulier nog eens kiezen terwijl je net op de + van die app klikte. */
  const nieuwVoor = (app: AppId) => {
    setNewTask(v => ({ ...v, app }));
    setAdding(true);
  };

  return (
    /* Flexkolom: knoppen en cijfers vast, de takenlijst krijgt de rest. */
    <motion.div className="axe-tabruimte flex min-h-0 flex-1 flex-col pt-4 sm:pt-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
      {/* Titel en omschrijving weg: de nav onderin zegt al waar je bent, en
          twee regels die dat herhalen kosten op elke pagina ruimte. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => { void autoRoute(); }}
            disabled={routing || tasks.filter(t => t.assignee === 'AXE Core' && t.status === 'todo').length === 0}
            className="inline-flex items-center justify-center gap-1.5 text-xs-custom px-3 py-2 rounded-lg transition-all"
            style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)', opacity: routing ? 0.6 : 1 }}
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

      {/* De cijferrij die hier stond telde ALLE apps bij elkaar op. Dat getal
          beantwoordt geen vraag die je hebt: "twaalf te doen" zegt niets als je
          wil weten of Companion achterloopt. Hij staat nu per kaart, op dezelfde
          plek in alle vijf. */}

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
                  {/* Voor welke app. Eerst, want dat bepaalt in welke kolom hij
                      terechtkomt -- en dat is het veld dat je het vaakst
                      verkeerd zou laten staan. */}
                  <select
                    value={newTask.app}
                    onChange={e => setNewTask(n => ({ ...n, app: e.target.value as AppId }))}
                    className="flex-1 text-xs-custom px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: appMeta(newTask.app).kleur }}
                  >
                    {APPS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
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

      {/* De statusfilters kostten een regel boven elke lijst, terwijl je er
          meestal maar één keer aan draait.
          In de schuifbalk kun je er even goed bij, zonder dat het altijd
          breedte kost. */}
      <TabRail kant="links">
        <div className="axe-paneel">
          <h2 className="axe-paneel-kop">Status</h2>
          <div className="axe-paneel-body">
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
          </div>
        </div>
      </TabRail>

      {/* De lijst is de enige schuif, en hij vult wat er onder de cijfers over
          is. De lege staat gebruikt diezelfde ruimte in plaats van als strookje
          bovenin te blijven hangen met een halve pagina plaat eronder. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Per app zijn deadlines, en eronder zijn dagen.
        *
        * Dit was één lange lijst met alle taken van alles door elkaar, met een
        * statusfilter erbij. Dat werkt zolang je één ding bouwt. Met vijf apps
        * is "wat ligt er bij Companion" de vraag die je stelt, en die kon je
        * alleen beantwoorden door de hele lijst te lezen.
        *
        * De app staat in metadata.app, precies zoals de cron-tab het doet --
        * geen migratie, en alles wat er al staat valt terug op AXE Core. */}
      {/* Vijf naast elkaar, AXE Core links.
        *
        * De cron-tab zet AXE Core apart omdat hij daar iets ANDERS doet:
        * lokaal draaien tegenover een webhook. Bij taken is dat verschil er
        * niet -- een taak is een taak, welke app hij ook raakt. Dan zijn vijf
        * gelijke kolommen eerlijker dan er één uitlichten. */}
      <div className="axe-appvijf">
        {APPS.map(a => (
          <AppTaken
            key={a.id}
            label={a.label}
            kleur={a.kleur}
            blurb={a.blurb}
            taken={takenVan(a.id)}
            opNieuw={() => nieuwVoor(a.id)}
            opKlaar={t => { void updateStatus(t.id, 'done'); }}
            opWeg={t => { void removeTask(t.id); }}
          />
        ))}
      </div>

      </div>
    </motion.div>
  );
}
