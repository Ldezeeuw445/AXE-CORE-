/**
 * Eén agent, in de rechterlade — met dezelfde vier onderwerpen als de tab
 * zelf, plus "Now".
 *
 * Dat is de hele truc van deze tab: de vier weergaven laten alle agents zien
 * op één onderwerp, en dit laat één agent zien op alle onderwerpen. Je hoeft
 * dus nooit te kiezen tussen "alles zien" en "één agent begrijpen" — het is
 * dezelfde informatie, twee kanten op.
 *
 * In de RECHTERLADE en niet in een eigen zwevend paneel: UI-MAATSTAF regel 5
 * zegt dat per-tab-context daar hoort, `TabRail kant="rechts" vast={...}` is
 * het patroon dat NorthSea's Tegenpartijen al gebruikt, en het is meteen goed
 * op alle drie de apparaten — op de telefoon adopteert `ladeSloten` dezelfde
 * inhoud in de rechterlade van de plaat. Eén implementatie, drie schermen.
 *
 * Alle rijen komen uit activity.ts, die deze tab al las. Er komt geen tweede
 * bron bij: wat hier staat is hetzelfde wat de grote panelen tonen, alleen
 * gefilterd op deze ene agent.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { LADE_TABS, namespaceVan, teltMeeOpDezeTab, type LadeTab } from '@/domain/agents/agentsTab';
// Dezelfde regel als Settings toont: uit roster.ts via motorScope, niet een
// tweede keer hier opgeschreven.
import { SCOPE_TEKST } from '@/domain/agents/motorScope';
import {
  buildTimeline, relativeTime, loopAgentFor,
  type ActivityItem, type AgentPulse, type SchedulePlan, type AgentQueue, type Tone,
} from '@/domain/agents/activity';
import type { AxeAgent } from '@/domain/agents/roster';
import type { LoopHealth } from '@/domain/memory/agentLoop';
import type { NamespaceCount } from '@/infrastructure/persistence/agentActivityService';

const TIMELINE_IN_LADE = 14;

const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--success)',
  fail: 'var(--error)',
  running: 'var(--accent-cyan)',
  waiting: 'var(--warning)',
  neutral: 'var(--text-secondary)',
};


function Kop({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.13em]" style={{ color: 'var(--text-muted)' }}>
      {children}
    </div>
  );
}

function Vak({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mb-3.5">
      <Kop>{titel}</Kop>
      {children}
    </section>
  );
}

function Feit({ l, r }: { l: string; r: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 py-0.5 text-[11.5px]">
      <span className="w-[86px] flex-none" style={{ color: 'var(--text-muted)' }}>{l}</span>
      <span className="min-w-0 flex-1" style={{ color: 'var(--text-primary)' }}>{r}</span>
    </div>
  );
}

function Leeg({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{children}</p>;
}

function Rij({ item, now }: { item: ActivityItem; now: number }) {
  return (
    <div className="flex items-start gap-2 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px]" title={item.text} style={{ color: TONE_COLOR[item.tone] }}>
          {item.text}
          {item.count > 1 && (
            <span className="ml-1.5 font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>×{item.count}</span>
          )}
        </p>
        {item.detail && (
          <p className="truncate text-[10.5px]" title={item.detail} style={{ color: 'var(--text-muted)' }}>{item.detail}</p>
        )}
      </div>
      <span className="flex-none font-mono text-[10.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {relativeTime(item.at, now)}
      </span>
    </div>
  );
}

export interface AgentDetailProps {
  agent: AxeAgent;
  pulse: AgentPulse | undefined;
  items: readonly ActivityItem[];
  plans: readonly SchedulePlan[];
  queues: readonly AgentQueue[];
  counts: Record<string, NamespaceCount>;
  loopHealth: Record<string, LoopHealth>;
  now: number;
  tab: LadeTab;
  onTab: (t: LadeTab) => void;
  sluit: () => void;
}

export function AgentDetail(p: AgentDetailProps) {
  const { agent } = p;
  const navigate = useNavigate();
  const tijdlijn = useMemo(
    () => buildTimeline(p.items, agent.id, TIMELINE_IN_LADE),
    [p.items, agent.id],
  );
  const schedules = p.plans.filter((s) => s.agent === agent.id);
  const queue = p.queues.find((q) => q.agent === agent.id);
  const ns = namespaceVan(agent.id);
  const telling = ns ? p.counts[ns] : undefined;
  const loopNaam = loopAgentFor(agent.id);
  const health = loopNaam ? p.loopHealth[loopNaam] : undefined;
  const werkt = !!p.pulse?.working;

  return (
    <div className="axe-paneel" data-axe-doel="agent-detail">
      <header className="mb-3 flex items-start gap-2.5">
        <ManagerAvatar agent={agent} size={30} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-semibold" style={{ color: agent.accent }}>{agent.name}</h2>
          <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{agent.role}</div>
          <div
            className="font-mono text-[9.5px] uppercase tracking-[0.08em]"
            style={{ color: werkt ? 'var(--accent-cyan)' : 'var(--text-muted)' }}
          >
            {werkt ? 'working' : 'idle'}
          </div>
        </div>
        <button
          type="button"
          onClick={p.sluit}
          aria-label="Close agent"
          className="flex-none text-[16px] leading-none"
          style={{ color: 'var(--text-muted)' }}
        >
          ×
        </button>
      </header>

      <div className="axe-viewctl axe-viewctl--inline mb-3" role="tablist" aria-label="Agent detail">
        {LADE_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={p.tab === t.id}
            className="axe-viewknop"
            data-aan={p.tab === t.id ? 'ja' : undefined}
            onClick={() => p.onTab(t.id)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {p.tab === 'nu' && (
        <>
          <Vak titel="What he does">
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{agent.handles}</p>
          </Vak>
          <Vak titel="Right now">
            {p.pulse ? (
              <>
                <p className="text-[12px]" style={{ color: TONE_COLOR[p.pulse.tone] }}>{p.pulse.text}</p>
                <p className="mt-0.5 font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                  {relativeTime(p.pulse.at, p.now)}
                </p>
              </>
            ) : (
              <Leeg>Nothing on the timeline for {agent.kort ?? agent.name} yet.</Leeg>
            )}
          </Vak>
          {agent.route && (
            <button
              type="button"
              onClick={() => navigate(`/${agent.route}`)}
              className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium"
              style={{
                background: 'var(--tint-line)',
                border: '1px solid var(--tint-line)',
                color: 'var(--accent-cyan)',
              }}
            >
              Open {agent.route}
            </button>
          )}
        </>
      )}

      {p.tab === 'activity' && (
        tijdlijn.length > 0
          ? <div>{tijdlijn.map((i) => <Rij key={i.key} item={i} now={p.now} />)}</div>
          : <Leeg>Nothing from {agent.kort ?? agent.name} in this window.</Leeg>
      )}

      {p.tab === 'plans' && (
        <>
          <Vak titel="Schedules">
            {schedules.length > 0 ? schedules.map((s) => (
              <div key={s.key} className="py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11.5px]" title={s.name} style={{ color: 'var(--text-primary)' }}>
                    {s.name}
                  </span>
                  <span
                    className="flex-none font-mono text-[10.5px] tabular-nums"
                    style={{ color: s.state === 'overdue' ? 'var(--warning)' : 'var(--text-muted)' }}
                  >
                    {s.state === 'overdue'
                      ? `overdue ${relativeTime(s.nextAt ?? p.now, p.now).replace(' ago', '')}`
                      : s.state === 'upcoming' ? relativeTime(s.nextAt ?? p.now, p.now)
                      : s.state}
                  </span>
                </div>
                {s.cron && <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.cron}</p>}
              </div>
            )) : <Leeg>No schedules.</Leeg>}
          </Vak>
          <Vak titel="Queued tasks">
            {queue ? (
              <>
                <p className="text-[11.5px]" style={{ color: 'var(--text-primary)' }}>
                  {queue.total} queued
                  {queue.approvals > 0 && (
                    <span style={{ color: 'var(--warning)' }}> · {queue.approvals} need your approval</span>
                  )}
                </p>
                {queue.tasks.slice(0, 4).map((t) => (
                  <div key={t.key} className="flex items-baseline gap-2 py-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="min-w-0 flex-1 truncate text-[11.5px]" title={t.title} style={{ color: 'var(--text-secondary)' }}>
                      {t.title}
                    </span>
                    {t.needsApproval && (
                      <span className="flex-none font-mono text-[10px]" style={{ color: 'var(--warning)' }}>approval</span>
                    )}
                  </div>
                ))}
                {queue.total > 4 && (
                  <button
                    type="button"
                    onClick={() => navigate('/tasks')}
                    className="mt-1 text-[11px]"
                    style={{ color: 'var(--accent-cyan)' }}
                  >
                    +{queue.total - 4} more in Tasks
                  </button>
                )}
              </>
            ) : <Leeg>Nothing queued.</Leeg>}
          </Vak>
        </>
      )}

      {p.tab === 'memory' && (
        <>
          <Vak titel="Namespace">
            <Feit l="Namespace" r={<span className="font-mono text-[11px]">{ns ?? '—'}</span>} />
            {teltMeeOpDezeTab(ns) ? (
              <>
                <Feit l="Own rows" r={telling?.own ?? '—'} />
                {(telling?.desk ?? 0) > 0 && (
                  <Feit
                    l="From the desk"
                    r={<span style={{ color: 'var(--warning)' }}>{telling?.desk} written here by the Trading desk</span>}
                  />
                )}
              </>
            ) : (
              <Leeg>This namespace is counted on the Trading tab, not here.</Leeg>
            )}
          </Vak>
          <Vak titel="Learning loop">
            {!loopNaam ? <Leeg>Learning loop (agent_learning_episodes): not wired yet.</Leeg>
              : !health || health.opened === 0 ? <Leeg>Learning loop: 0 episodes.</Leeg>
              : (
                <p className="text-[11.5px]" style={{ color: 'var(--accent-cyan)' }}>
                  {health.opened} episodes · {Math.round(health.closeRate * 100)}% outcomes
                  {' · '}{health.applied}/{health.reinforceable} learned
                </p>
              )}
          </Vak>
        </>
      )}

      {p.tab === 'settings' && (
        <>
          <Vak titel="How he runs">
            <Feit l="Tier" r={agent.tier === 'axe' ? 'Above the tiers' : agent.tier.replace('tier', 'Tier ')} />
            <Feit l="Engine" r={agent.runtime} />
            <Feit l="Engine rule" r={SCOPE_TEKST[agent.dropdownScope]} />
            <Feit l="Own tab" r={agent.route ? <span className="font-mono text-[11px]">{agent.route}</span> : 'none'} />
            <Feit
              l="Decides"
              r={agent.canDecide
                ? <span style={{ color: 'var(--success)' }}>yes, where it is safe</span>
                : 'no, it asks you'}
            />
          </Vak>
          <button
            type="button"
            onClick={() => navigate('/settings?section=agent-motoren')}
            className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium"
            style={{
              background: 'var(--tint-line)',
              border: '1px solid var(--tint-line)',
              color: 'var(--accent-cyan)',
            }}
          >
            Change engine in Settings
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Een crew-persona. Bewust korter: ze hebben geen eigen wachtrij, schedules of
 * namespace — hun werk staat onder Wingman. Dat zeggen in plaats van vier lege
 * tabbladen tonen is eerlijker en scheelt klikken.
 */
export function CrewDetail({
  naam, rol, namespace, sluit,
}: {
  naam: string;
  rol: string;
  namespace: string;
  sluit: () => void;
}) {
  return (
    <div className="axe-paneel" data-axe-doel="agent-detail">
      <header className="mb-3 flex items-start gap-2.5">
        <span className="mt-1 flex-none rounded-full" style={{ width: 8, height: 8, background: '#38BDF8' }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-semibold" style={{ color: '#38BDF8' }}>{naam}</h2>
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Wingman&apos;s crew</div>
        </div>
        <button
          type="button"
          onClick={sluit}
          aria-label="Close agent"
          className="flex-none text-[16px] leading-none"
          style={{ color: 'var(--text-muted)' }}
        >
          ×
        </button>
      </header>
      <Vak titel="What he is for">
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rol}</p>
      </Vak>
      <Vak titel="How he runs">
        <Feit l="Belongs to" r="Wingman · Tier 1" />
        <Feit l="Memory" r={<span className="font-mono text-[11px]">{namespace}</span>} />
        <Feit l="Engine rule" r="No choice of his own — he runs on whatever Wingman runs on." />
      </Vak>
      <Vak titel="Activity, plans and memory">
        <Leeg>Crew personas have no queue or schedules of their own: their work shows up under Wingman.</Leeg>
      </Vak>
    </div>
  );
}
