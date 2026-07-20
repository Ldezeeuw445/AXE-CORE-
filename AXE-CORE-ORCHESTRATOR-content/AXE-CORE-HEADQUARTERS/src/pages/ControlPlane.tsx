import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, Brain, Shield, Webhook, Workflow } from 'lucide-react';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { apiListRoutes, type ControlPlaneRoute, sbGetRows, type TableRow } from '@/infrastructure/gateways/axeCoreApiService';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

function kindLabel(kind: ControlPlaneRoute['kind']) {
  switch (kind) {
    case 'public': return 'Public API';
    case 'internal': return 'Internal';
    case 'hook': return 'Hooks';
    case 'integration': return 'Integrations';
  }
}

function kindColor(kind: ControlPlaneRoute['kind']) {
  switch (kind) {
    case 'public': return '#22d3ee';
    case 'internal': return '#a78bfa';
    case 'hook': return '#f59e0b';
    case 'integration': return '#10b981';
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export default function ControlPlane() {
  const [routes, setRoutes] = useState<ControlPlaneRoute[]>([]);
  const [tasks, setTasks] = useState<TableRow[]>([]);
  const [events, setEvents] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const loadFromSupabase = async () => {
          const sb = getSupabase();
          if (!sb) return { routes: [] as ControlPlaneRoute[], tasks: [] as TableRow[], events: [] as TableRow[] };
          const [routeRes, taskRes, eventRes] = await Promise.all([
            sb.from('core_route_registry').select('*').order('display_name'),
            sb.from('core_tasks').select('*').order('created_at', { ascending: false }).limit(12),
            sb.from('core_events').select('*').order('created_at', { ascending: false }).limit(12),
          ]);
          return {
            routes: (routeRes.data ?? []) as ControlPlaneRoute[],
            tasks: (taskRes.data ?? []) as TableRow[],
            events: (eventRes.data ?? []) as TableRow[],
          };
        };

        const [routeRows, taskRows, eventRows] = await (isAxeApiConfigured
          ? Promise.all([
              apiListRoutes().catch(async () => loadFromSupabase().then(d => d.routes)),
              sbGetRows('core_tasks', { limit: 12, orderBy: 'created_at', orderDir: 'desc' }).catch(async () => loadFromSupabase().then(d => d.tasks)),
              sbGetRows('core_events', { limit: 12, orderBy: 'created_at', orderDir: 'desc' }).catch(async () => loadFromSupabase().then(d => d.events)),
            ])
          : loadFromSupabase().then(d => [d.routes, d.tasks, d.events] as const));
        if (cancelled) return;
        setRoutes(routeRows);
        setTasks(taskRows);
        setEvents(eventRows);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load control plane');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    public: routes.filter(r => r.kind === 'public').length,
    internal: routes.filter(r => r.kind === 'internal').length,
    hook: routes.filter(r => r.kind === 'hook').length,
    integration: routes.filter(r => r.kind === 'integration').length,
  }), [routes]);

  const highlightRoutes = routes.filter(r => ['google_maps', 'smartthings', 'hermes', 'langgraph'].some(token => `${r.path} ${r.target ?? ''} ${r.display_name}`.toLowerCase().includes(token)));

  return (
    <motion.div className="p-4 sm:p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Control Plane</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            Routes, approvals, patches and integration contracts for AXE CORE.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <Shield size={12} />
          <Webhook size={12} />
          <span>Authenticated backend contracts</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {[
          { label: 'Public', value: counts.public, color: '#22d3ee' },
          { label: 'Internal', value: counts.internal, color: '#a78bfa' },
          { label: 'Hooks', value: counts.hook, color: '#f59e0b' },
          { label: 'Integrations', value: counts.integration, color: '#10b981' },
        ].map(card => (
          <WidgetCard key={card.label} title="">
            <div className="text-center py-1">
              <div className="text-2xl font-bold font-mono-data" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
            </div>
          </WidgetCard>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <WidgetCard title="Route Registry">
          <div className="space-y-2">
            {loading ? (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>Loading routes…</p>
            ) : routes.length === 0 ? (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>No route registry entries found.</p>
            ) : routes.map(route => (
              <div key={route.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${kindColor(route.kind)}22` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: `${kindColor(route.kind)}18`, color: kindColor(route.kind) }}>
                        {kindLabel(route.kind)}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                        {route.execution_mode}
                      </span>
                      {!route.enabled && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                          disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-small font-medium" style={{ color: 'var(--text-primary)' }}>{route.display_name}</div>
                    <div className="text-xs-custom mt-0.5" style={{ color: 'var(--text-muted)' }}>{route.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>{route.method}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{route.path}</div>
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{route.auth_required ? 'auth required' : 'public hook'}</div>
                  </div>
                </div>
                {route.target && (
                  <div className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <Workflow size={11} />
                    <span>{route.target}</span>
                    <ArrowRight size={10} />
                    <span>{route.execution_mode}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Integration Focus">
          <div className="space-y-3">
            {highlightRoutes.length > 0 ? highlightRoutes.map(route => (
              <div key={route.id} className="rounded-xl p-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{route.display_name}</div>
                    <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{route.path}</div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
                    {route.kind}
                  </span>
                </div>
                <div className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {route.target === 'google_maps' && 'Google Maps is exposed as a free-view integration: wire a browser/API key when you want actual map tiles, but the architecture is ready either way.'}
                  {route.target === 'smartthings' && 'SmartThings control is set up as an execution integration with a PAT-based token slot, so device commands can be dispatched without touching the web shell.'}
                  {route.target === 'hermes' && 'Hermes Agent is wired as a first-class optional endpoint for self-improving agent workflows and skill-driven automation.'}
                  {route.target === 'langgraph' && 'LangGraph is the orchestrator path: it receives tasks, routes them to the right specialist, and dispatches execution through the VPS API.'}
                  {!['google_maps', 'smartthings', 'hermes', 'langgraph'].some(token => `${route.path} ${route.target ?? ''}`.toLowerCase().includes(token)) && route.description}
                </div>
              </div>
            )) : (
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>No highlighted integrations found.</p>
              </div>
            )}

            <div className="rounded-xl p-3" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Brain size={13} style={{ color: 'var(--accent-cyan)' }} />
                <div className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>Architecture notes</div>
              </div>
              <ul className="space-y-1 text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                <li>• Tasks, steps, tool calls, approvals, patches, memory, and events are persisted separately.</li>
                <li>• Public API, internal dispatch, and hooks are split in the registry for cleaner control boundaries.</li>
                <li>• Google Maps and SmartThings are modeled from the start so they can be switched on without redesign.</li>
              </ul>
            </div>
          </div>
        </WidgetCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <WidgetCard title="Recent Tasks">
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>No tasks yet.</p>
            ) : tasks.map(task => (
              <div key={String(task.id)} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-small font-medium truncate" style={{ color: 'var(--text-primary)' }}>{asString(task.title)}</div>
                    <div className="text-xs-custom truncate" style={{ color: 'var(--text-muted)' }}>
                      {asString(task.status)} · {asString(task.priority)} · {asString(task.execution_mode)}
                    </div>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                    {asString(task.source_app)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Recent Events">
          <div className="space-y-2">
            {events.length === 0 ? (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>No events yet.</p>
            ) : events.map(event => (
              <div key={String(event.id)} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-small font-medium truncate" style={{ color: 'var(--text-primary)' }}>{asString(event.event_type)}</div>
                    <div className="text-xs-custom truncate" style={{ color: 'var(--text-muted)' }}>{asString(event.message)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    <Activity size={10} />
                    <span>{asString(event.severity)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>
    </motion.div>
  );
}
