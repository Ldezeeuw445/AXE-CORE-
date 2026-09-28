/**
 * Activity & plans — direct onder de War Room: links wat de agents deden
 * (nieuwste eerst, over alle agents behalve Trading), rechts wat ze gaan doen
 * (schedules en de wachtrij). Eén filter voor beide, zodat "Developer" links
 * en rechts hetzelfde betekent.
 *
 * Kleur staat in de letters (UI-MAATSTAF regel 5): de accentkleur van een
 * agent kleurt zijn naam, de toestand kleurt het werkwoord. Geen gevulde pillen.
 */
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Block } from '@/presentation/components/surface/Page';
import { AXE_AGENTS, type AxeAgentId } from '@/domain/agents/roster';
import {
  buildTimeline, agentsWithData, schedulePlans, queuesByAgent, relativeTime,
  type ActivityItem, type AgentFilter, type Tone, type SchedulePlan, type AgentQueue,
} from '@/domain/agents/activity';
import type { AgentActivitySnapshot } from '@/infrastructure/persistence/agentActivityService';

const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--success)',
  fail: 'var(--error)',
  running: 'var(--accent-cyan)',
  waiting: 'var(--warning)',
  neutral: 'var(--text-secondary)',
};

const TIMELINE_LIMIT = 80;
const QUEUE_PREVIEW = 3;

function agentMeta(id: AxeAgentId) {
  return AXE_AGENTS.find(a => a.id === id) ?? AXE_AGENTS[0];
}

function AgentTag({ id }: { id: AxeAgentId }) {
  const a = agentMeta(id);
  return (
    <span className="flex w-[118px] flex-none items-center gap-1.5 truncate">
      <span className="flex-none rounded-full" style={{ width: 7, height: 7, background: a.accent }} />
      <span className="truncate text-[11px] font-medium" style={{ color: a.accent }}>{a.name}</span>
    </span>
  );
}

/** "Completed: Refresh snapshots" → werkwoord in de toonkleur, de rest gewoon. */
function ToneText({ text, tone }: { text: string; tone: Tone }) {
  const cut = text.indexOf(': ');
  if (cut < 0) return <span style={{ color: 'var(--text-primary)' }}>{text}</span>;
  return (
    <>
      <span style={{ color: TONE_COLOR[tone] }}>{text.slice(0, cut + 1)}</span>
      <span style={{ color: 'var(--text-primary)' }}>{text.slice(cut + 1)}</span>
    </>
  );
}

function ActivityRow({ item, now }: { item: ActivityItem; now: number }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <AgentTag id={item.agent} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px]" title={item.text}>
          <ToneText text={item.text} tone={item.tone} />
          {item.count > 1 && (
            <span className="ml-1.5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>×{item.count}</span>
          )}
        </p>
        {item.detail && (
          <p className="truncate text-[11px]" title={item.detail} style={{ color: 'var(--text-muted)' }}>{item.detail}</p>
        )}
      </div>
      <span className="w-[62px] flex-none text-right font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {relativeTime(item.at, now)}
      </span>
    </div>
  );
}

function scheduleWhen(p: SchedulePlan, now: number): { text: string; color: string } {
  switch (p.state) {
    case 'disabled': return { text: 'disabled', color: 'var(--text-muted)' };
    case 'unscheduled': return { text: 'no next run', color: 'var(--text-muted)' };
    case 'overdue': return { text: `overdue ${relativeTime(p.nextAt ?? now, now).replace(' ago', '')}`, color: 'var(--warning)' };
    default: return { text: relativeTime(p.nextAt ?? now, now), color: 'var(--text-primary)' };
  }
}

function ScheduleRow({ p, now }: { p: SchedulePlan; now: number }) {
  const when = scheduleWhen(p, now);
  const lastColor = p.lastStatus === 'ok' ? 'var(--success)'
    : p.lastStatus === 'fail' || p.lastStatus === 'timeout' ? 'var(--error)'
    : 'var(--text-muted)';
  return (
    <div className="py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2">
        <AgentTag id={p.agent} />
        <span className="min-w-0 flex-1 truncate text-[12px]" title={p.name} style={{ color: 'var(--text-primary)' }}>{p.name}</span>
        <span className="flex-none font-mono text-[11px] tabular-nums" style={{ color: when.color }}>{when.text}</span>
      </div>
      <p className="truncate pl-[128px] text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {p.cron && <span className="font-mono">{p.cron}</span>}
        {p.lastAt != null && (
          <>
            {p.cron && ' · '}last <span style={{ color: lastColor }}>{p.lastStatus || 'run'}</span> {relativeTime(p.lastAt, now)}
          </>
        )}
        {p.failures > 0 && <span style={{ color: 'var(--error)' }}> · {p.failures} failures in a row</span>}
      </p>
    </div>
  );
}

function QueueGroup({ q, now, onOpen }: { q: AgentQueue; now: number; onOpen: () => void }) {
  const more = q.total - Math.min(q.total, QUEUE_PREVIEW);
  return (
    <div className="py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2">
        <AgentTag id={q.agent} />
        <span className="flex-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {q.total} queued
          {q.approvals > 0 && <span style={{ color: 'var(--warning)' }}> · {q.approvals} need{q.approvals === 1 ? 's' : ''} your approval</span>}
        </span>
      </div>
      {q.tasks.slice(0, QUEUE_PREVIEW).map(t => (
        <div key={t.key} className="flex items-center gap-2 pl-[128px]">
          <span className="min-w-0 flex-1 truncate text-[12px]" title={t.title} style={{ color: 'var(--text-primary)' }}>{t.title}</span>
          <span
            className="flex-none font-mono text-[11px] tabular-nums"
            style={{ color: t.needsApproval ? 'var(--warning)' : t.dueAt != null && t.dueAt < now ? 'var(--error)' : 'var(--text-muted)' }}
          >
            {t.needsApproval
              ? 'approval'
              : t.dueAt != null
                ? `due ${relativeTime(t.dueAt, now)}`
                : t.queuedAt != null ? `queued ${relativeTime(t.queuedAt, now)}` : t.status}
          </span>
        </div>
      ))}
      {more > 0 && (
        <button type="button" onClick={onOpen} className="pl-[128px] text-[11px]" style={{ color: 'var(--accent-cyan)' }}>
          +{more} more in Tasks
        </button>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

export function LiveIndicator({ lastOkAt, errors, loading, now }: {
  lastOkAt: number | null; errors: string[]; loading: boolean; now: number;
}) {
  // "live" alleen als de laatste geslaagde poll binnen twee intervallen viel.
  const fresh = lastOkAt != null && now - lastOkAt < 40_000;
  const label = loading && lastOkAt == null ? 'connecting…'
    : fresh ? `live · updated ${relativeTime(Math.min(lastOkAt, now), now)}`
    : lastOkAt != null ? `stale · last update ${relativeTime(Math.min(lastOkAt, now), now)}`
    : 'offline · could not read';
  const color = fresh ? 'var(--success)' : lastOkAt != null ? 'var(--warning)' : loading ? 'var(--text-muted)' : 'var(--error)';
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color }} title={errors.join('\n') || undefined}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: color, animation: fresh ? 'pulse 2s ease-in-out infinite' : 'none' }} />
      {label}
      {fresh && errors.length > 0 && <span style={{ color: 'var(--warning)' }}>· {errors.length} source{errors.length === 1 ? '' : 's'} failed</span>}
    </span>
  );
}

export function ActivityPlansPanel({ snapshot, items, filter, onFilter, now, loading, live }: {
  snapshot: AgentActivitySnapshot | null;
  items: ActivityItem[];
  filter: AgentFilter;
  onFilter: (f: AgentFilter) => void;
  now: number;
  loading: boolean;
  live: ReactNode;
}) {
  const navigate = useNavigate();
  const timeline = useMemo(() => buildTimeline(items, filter, TIMELINE_LIMIT), [items, filter]);
  const schedules = useMemo(() => schedulePlans(snapshot?.schedules ?? [], now), [snapshot, now]);
  const queues = useMemo(() => queuesByAgent(snapshot?.openTasks ?? []), [snapshot]);

  const shownSchedules = schedules.filter(s => filter === 'all' || s.agent === filter);
  const shownQueues = queues.filter(q => filter === 'all' || q.agent === filter);
  const chips = agentsWithData([
    ...items.map(i => i.agent), ...schedules.map(s => s.agent), ...queues.map(q => q.agent),
  ]);
  const errors = snapshot?.errors ?? [];
  const nothingRead = snapshot != null && snapshot.sourcesOk === 0;
  const filterName = filter === 'all' ? null : agentMeta(filter).name;

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-small font-semibold tracking-wide" style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
          ACTIVITY &amp; PLANS
        </h2>
        {live}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1" role="tablist" aria-label="Filter by agent">
        {(['all', ...chips] as AgentFilter[]).map(id => {
          const on = filter === id;
          const color = id === 'all' ? 'var(--text-primary)' : agentMeta(id).accent;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onFilter(id)}
              className="text-[11px] font-medium"
              style={{
                color: on ? color : 'var(--text-muted)',
                borderBottom: `1px solid ${on ? color : 'transparent'}`,
                paddingBottom: 1,
              }}
            >
              {id === 'all' ? 'All agents' : agentMeta(id).name}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-3" style={{ gridAutoRows: '440px' }}>
        <Block
          className="lg:col-span-2"
          title={filterName ? `Activity · ${filterName}` : 'Activity'}
          action={
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              tasks · episodes · job runs · memory
            </span>
          }
        >
          {nothingRead ? (
            <p className="pt-1 text-[12px]" style={{ color: 'var(--error)' }}>
              Could not read any activity source — this is a failed read, not a quiet day.
              <span className="mt-1 block font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{errors.join(' · ')}</span>
            </p>
          ) : timeline.length === 0 ? (
            <p className="pt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {loading
                ? 'Reading…'
                : filterName
                  ? `${filterName} has no recorded activity in the last week of tasks, learning episodes, job runs or memory writes.`
                  : 'No agent has recorded activity yet. Work shows up here as soon as a task finishes, a schedule runs, or an agent opens a learning episode.'}
            </p>
          ) : (
            <div className="flex flex-col">
              {timeline.map(i => <ActivityRow key={i.key} item={i} now={now} />)}
            </div>
          )}
          {!nothingRead && errors.length > 0 && (
            <p className="pt-2 font-mono text-[10px]" style={{ color: 'var(--warning)' }}>
              Not read: {errors.join(' · ')}
            </p>
          )}
        </Block>

        <Block
          title={filterName ? `Plans · ${filterName}` : 'Plans'}
          action={
            <button type="button" onClick={() => navigate('/cron-manager')} className="text-[10px]" style={{ color: 'var(--accent-cyan)' }}>
              Cron manager
            </button>
          }
        >
          <SectionLabel>Schedules</SectionLabel>
          {shownSchedules.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Reading…' : filterName ? `No schedule runs as ${filterName}.` : 'No schedules in core_schedules. Add one in the Cron manager.'}
            </p>
          ) : (
            shownSchedules.map(p => <ScheduleRow key={p.key} p={p} now={now} />)
          )}

          <SectionLabel>Queued tasks</SectionLabel>
          {shownQueues.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Reading…' : filterName ? `Nothing queued for ${filterName}.` : 'Nothing queued — no open tasks outside Trading.'}
            </p>
          ) : (
            shownQueues.map(q => <QueueGroup key={q.agent} q={q} now={now} onOpen={() => navigate('/tasks')} />)
          )}
        </Block>
      </div>
    </section>
  );
}
