/**
 * WarRoom — one glance at who is doing what.
 *
 * The Agents tab used to be a flat list of ~29 boxes with no sense of who runs
 * the show or who is busy right now. This is the opposite: the twelve tiered
 * agents AXE actually delegates to (domain/agents/roster.ts), each showing
 * whether it is working this second and what it last handled. AXE is always
 * at the head — it runs and delegates; the rest light up only when AXE hands
 * them work.
 *
 * Data comes from the live routing log (voiceStore.routingLog), which now tags
 * every turn with the agent that handled it. No new plumbing, no polling — the
 * War Room simply reads the decisions AXE already made.
 */
import { useNavigate } from 'react-router';
import { useVoiceStore, type RoutingEvent } from '@/presentation/store/voiceStore';
import { AXE_AGENTS, type AxeAgentId } from '@/domain/agents/roster';
import { relativeTime, type AgentPulse } from '@/domain/agents/activity';

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * `pulses` komt van de Agents-tab (domain/agents/activity.ts): wat elke agent
 * volgens core_tasks, core_job_runs, episodes en memory het laatst deed. De
 * routing-log hierboven ziet alleen chatbeurten; zonder pulses zei elke kaart
 * behalve AXE "idle" terwijl de planner en de NorthSea-engine gewoon werkten.
 */
export function WarRoom({ pulses, now }: {
  pulses: Partial<Record<AxeAgentId, AgentPulse>>;
  now: number;
}) {
  const routingLog = useVoiceStore((s) => s.routingLog);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);
  const navigate = useNavigate();

  const busy = voiceStatus !== 'idle';
  const currentAgent: AxeAgentId = (routingLog[0]?.delegate ?? 'axe') as AxeAgentId;

  // Most recent routing event per agent — its "last handled".
  const lastByAgent = new Map<AxeAgentId, RoutingEvent>();
  for (const ev of routingLog) {
    const d = (ev.delegate ?? 'axe') as AxeAgentId;
    if (!lastByAgent.has(d)) lastByAgent.set(d, ev);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-small font-semibold tracking-wide" style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
          WAR ROOM
        </h2>
        <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
          {busy
            ? `AXE is working${currentAgent !== 'axe' ? ` → ${AXE_AGENTS.find((a) => a.id === currentAgent)?.name}` : ''}…`
            : 'All quiet — AXE is ready'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {AXE_AGENTS.map((agent) => {
          const last = lastByAgent.get(agent.id);
          const active = busy && currentAgent === agent.id;
          const isOrchestrator = agent.id === 'axe';
          const pulse = pulses[agent.id];
          // De nieuwste van de twee wint: een chatbeurt van net is actueler
          // dan een taak van gisteren, en andersom.
          const showPulse = pulse && (pulse.working || !last || pulse.at >= last.ts);
          return (
            <button
              key={agent.id}
              onClick={() => navigate(`/${agent.route}`)}
              // Zelfde matzwarte kaart als overal (25 sep). Actief = een dunne
              // lijn in de kleur van de agent, geen gloed.
              className="axe-kaart text-left p-3 transition-transform"
              style={{
                outline: active ? `1px solid ${agent.accent}` : undefined,
                outlineOffset: -1,
                opacity: last || pulse || isOrchestrator || active ? 1 : 0.72,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="flex-shrink-0 rounded-full"
                  style={{
                    width: 9,
                    height: 9,
                    background: active || pulse?.working ? agent.accent : last || pulse ? 'var(--border-active)' : 'var(--border-subtle)',
                    boxShadow: active ? `0 0 8px ${agent.accent}` : 'none',
                    animation: active ? 'pulse 1.4s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="text-small font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {agent.name}
                </span>
                {agent.canDecide && (
                  <span className="text-xs-custom px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--bg-active)', color: 'var(--text-muted)', fontSize: 10 }}>
                    decides
                  </span>
                )}
              </div>

              <p className="text-xs-custom truncate mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {agent.role}
              </p>
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)', lineHeight: 1.35 }}>
                {agent.handles}
              </p>

              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {active ? (
                  <p className="text-xs-custom truncate" style={{ color: agent.accent }}>
                    ● working{routingLog[0]?.query ? `: ${routingLog[0].query}` : ''}
                  </p>
                ) : showPulse && pulse.working ? (
                  <p className="text-xs-custom truncate" title={pulse.text} style={{ color: agent.accent }}>
                    ● {pulse.text.replace(/^Working on:/, 'working on')}
                  </p>
                ) : showPulse ? (
                  <p className="text-xs-custom truncate" title={pulse.text} style={{ color: 'var(--text-muted)' }}>
                    {/* Tijd vooraan: de regel wordt afgekapt, en de tijd is wat je moet zien. */}
                    last {relativeTime(pulse.at, now)} · <span style={{ color: pulse.tone === 'fail' ? 'var(--error)' : 'var(--text-secondary)' }}>{pulse.text}</span>
                  </p>
                ) : last ? (
                  <p className="text-xs-custom truncate" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(last.ts)}{last.winner ? ` · ${last.winner}` : ''}{last.query ? ` · ${last.query}` : ''}
                  </p>
                ) : (
                  <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                    {isOrchestrator
                      ? 'always on'
                      : agent.id === 'trading'
                        ? 'its activity lives in the Trading tab'
                        : 'idle — nothing recorded yet'}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
