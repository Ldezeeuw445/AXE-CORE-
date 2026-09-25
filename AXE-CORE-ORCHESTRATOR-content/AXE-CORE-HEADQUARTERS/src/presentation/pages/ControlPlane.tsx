import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ArrowRight, Brain, Shield, Webhook, Workflow } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { apiListRoutes, type ControlPlaneRoute, sbGetRows, type TableRow } from '@/infrastructure/gateways/axeCoreApiService';
import { isAxeApiConfigured } from '@/infrastructure/gateways/axeCoreApiService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { TabRuimte, Kaart, StatRij, SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { SchedulesBlock } from '@/presentation/pages/controlPlane/SchedulesBlock';
import { TasksBlock } from '@/presentation/pages/controlPlane/TasksBlock';
import { useSchedules, useTasks } from '@/presentation/pages/controlPlane/useControlPlaneData';
import { useNow } from '@/presentation/components/agents/useAgentActivity';
import '@/presentation/pages/controlPlane/controlPlane.css';

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
    case 'public': return 'var(--accent-cyan)';
    case 'internal': return '#a78bfa';
    case 'hook': return 'var(--warning)';
    case 'integration': return 'var(--success)';
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export default function ControlPlane() {
  const schedules = useSchedules();
  const taken = useTasks();
  const now = useNow();
  const [routes, setRoutes] = useState<ControlPlaneRoute[]>([]);
  const [tasks, setTasks] = useState<TableRow[]>([]);
  const [events, setEvents] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [soort, setSoort] = useState<ControlPlaneRoute['kind'] | null>(null);
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
    <motion.div className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <TabRail kant="links">
        <SchuifBalk
          groepen={[{
            titel: 'Route registry',
            items: [
              { id: 'all', label: `All · ${routes.length}`, actief: soort === null, onKies: () => setSoort(null) },
              ...(['public', 'internal', 'hook', 'integration'] as const).map((k) => ({
                id: k,
                label: `${kindLabel(k)} · ${routes.filter(r => r.kind === k).length}`,
                icoon: <span className="inline-block h-2 w-2 rounded-full" style={{ background: kindColor(k) }} />,
                actief: soort === k,
                onKies: () => setSoort(k),
              })),
            ],
          }]}
        />
      </TabRail>
      <TabRuimte vullen>
      <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
      {/* Titel en omschrijving weg: de nav onderin zegt al waar je bent, en
          twee regels die dat herhalen kosten op elke pagina ruimte. */}
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <Shield size={12} />
          <Webhook size={12} />
          <span>Authenticated backend contracts</span>
        </div>
      </div>

      <StatRij className="flex-none">
        {[
          { label: 'Public', value: counts.public, color: 'var(--accent-cyan)' },
          { label: 'Internal', value: counts.internal, color: '#a78bfa' },
          { label: 'Hooks', value: counts.hook, color: 'var(--warning)' },
          { label: 'Integrations', value: counts.integration, color: 'var(--success)' },
        ].map(card => (
          <Kaart key={card.label} compact>
            <div className="text-center py-1">
              <div className="text-2xl font-bold font-mono-data" style={{ color: card.color }}>{card.value}</div>
              <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
            </div>
          </Kaart>
        ))}
      </StatRij>

      {error && (
        <div className="mb-4 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Eén raster van 2x2 dat de resthoogte vult, in het ritme van de vier
          tellers erboven (twee tellers per kaart). Dit stond als twee
          CARD_GRID_TALL's onder elkaar: auto-fill houdt lege sporen, dus op
          1728 breed stonden er twee kaarten in vier sporen en was de rechter
          helft van de tab leeg (UI-MAATSTAF regel 6), terwijl de tweede rij
          onder de chatplaat verdween. Elke kaart scrolt zelf. */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
        <WidgetCard title="Route Registry">
          <div className="space-y-2">
            {loading ? (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>Loading routes…</p>
            ) : routes.length === 0 ? (
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>No route registry entries found.</p>
            ) : routes.filter(r => !soort || r.kind === soort).map(route => (
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
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}>
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

        {/* Schema's en taken: elk met een eigen ritme en knoppen (run now,
            goedkeuren). Vervangt "Integration Focus" en "Recent Tasks". */}
        <WidgetCard title="Schedules">
          <SchedulesBlock peiling={schedules} now={now} />
        </WidgetCard>

        <WidgetCard title="Tasks">
          <TasksBlock peiling={taken} now={now} />
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
      </div>
      </TabRuimte>
    </motion.div>
  );
}
