/**
 * Managers tab — axe-core-v3 mockup (managers.html):
 * 3-column card grid of DAX managers with status + Open chat.
 * Chat embeds ManagerChat (layout=desk); Home morph chat unchanged.
 */
import { useMemo, useState } from 'react';
import { agentById, type AxeAgent, type AxeAgentId } from '@/domain/agents/roster';
import { grokManagers } from '@/domain/agents/grokManagers';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { ManagerChat } from '@/presentation/components/axe-core/ManagerChat';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { startAxeJobs } from '@/presentation/store/installTierRouter';
import { classifyAxeTier } from '@/domain/tierRouter/axeRoute';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { followupIsAkkoord, followupIsAfwijzing } from '@/domain/goedkeuringFollowup';
import { wachtOpOk } from '@/domain/agents/pendingApproval';
import { pauseMission, resumeMission } from '@/infrastructure/gateways/axeCoreApiService';
import { agentTierRegel } from '@/domain/agents/agentTiers';

const SUBTITELS: Partial<Record<AxeAgentId, string>> = {
  axe: 'Central orchestrator',
  axemanager: 'Boss · routes alle managers',
  northseamgr: 'Deal desk · commodities',
  tradingos: 'Demo only · geen live orders',
  projectsmgr: 'Build & ship · repos & PRs',
  companionmgr: 'Product twin · UX stem',
  axon: 'Memory twin · long-term',
};

function deskLijst(): AxeAgent[] {
  /* v3 mockup: six Grok managers (CORE Mgr first). AXE stays the orchestrator
     behind Open chat routes — not a seventh card. */
  return grokManagers();
}

function statusVoor(
  agent: AxeAgent,
  busy: boolean,
  srvStatus?: string,
): { label: string; tone: 'live' | 'busy' | 'idle' } {
  if (busy || srvStatus === 'WORKING') return { label: 'Live · working', tone: 'busy' };
  if (srvStatus === 'WAITING') return { label: 'Needs you', tone: 'busy' };
  if (agent.id === 'tradingos') return { label: 'Demo', tone: 'idle' };
  if (agent.id === 'axon') return { label: 'Index OK', tone: 'live' };
  if (agent.id === 'axemanager') return { label: 'Live · idle queue 0', tone: 'live' };
  if (agent.id === 'northseamgr') return { label: 'Desk ready', tone: 'live' };
  if (agent.id === 'projectsmgr') return { label: 'Ready', tone: 'live' };
  if (agent.id === 'companionmgr') return { label: 'Standby', tone: 'idle' };
  return { label: 'Ready', tone: 'live' };
}

function initialen(agent: AxeAgent): string {
  const kort = (agent.kort || agent.name || '?').trim();
  const parts = kort.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return kort.slice(0, 2).toUpperCase();
}

export function ManagersDesk() {
  const lijst = useMemo(() => deskLijst(), []);
  const [gekozen, setGekozen] = useState<AxeAgentId | null>(null);
  const jobs = useAxeJobStore((s) => s.jobs);
  const server = useServerAgents();
  const agent = gekozen ? agentById(gekozen) : null;
  const agentJobs = agent
    ? jobs.filter((j) => j.agent === agent.id)
    : [];
  const job = agentJobs.find((j) => j.state === 'waiting' || j.state === 'running' || j.state === 'queued')
    ?? agentJobs[0]
    ?? null;
  const extra = server.approvals.map((a) => ({
    id: a.id,
    task_id: a.task_id,
    wat: a.wat,
    waarom: a.waarom,
    title: a.title,
    detail: a.detail,
  }));

  return (
    <div className="axe-managers-v3" data-axe-managers-desk="v3">
      <div className="axe-managers-v3-grid" role="list" aria-label="Managers">
        {lijst.map((a) => {
          const srv = server.agents[a.id];
          const busy = jobs.some((j) => j.agent === a.id && (j.state === 'running' || j.state === 'queued' || j.state === 'waiting'));
          const status = statusVoor(a, busy, srv?.status);
          const open = gekozen === a.id;
          return (
            <article
              key={a.id}
              className="axe-managers-v3-card"
              role="listitem"
              data-open={open ? 'ja' : undefined}
              style={{ ['--mgr-accent' as string]: a.accent }}
            >
              <header className="axe-managers-v3-card-kop">
                <span className="axe-managers-v3-av" aria-hidden style={{ background: a.accent }}>
                  {initialen(a)}
                </span>
                <span className="axe-managers-v3-pill" data-tone={status.tone}>{status.label}</span>
              </header>
              <h3 className="axe-managers-v3-naam">{a.kort || a.name}</h3>
              <p className="axe-managers-v3-sub">{SUBTITELS[a.id] || a.role}</p>
              <div className="axe-managers-v3-acties">
                <button
                  type="button"
                  className="axe-managers-v3-chatbtn"
                  aria-pressed={open}
                  onClick={() => setGekozen(open ? null : a.id)}
                >
                  {open ? 'Close chat' : 'Open chat'}
                </button>
                <span className="axe-managers-v3-av-soft" aria-hidden>
                  <ManagerAvatar agent={a} size={28} />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {agent && (
        <div className="axe-managers-v3-chat" aria-label={`Chat with ${agent.name}`}>
          <ManagerChat
            key={agent.id}
            layout="desk"
            agent={agent}
            job={job}
            jobs={agentJobs}
            server={server.agents[agent.id]}
            extraGoedkeuringen={extra}
            tierRegel={agentTierRegel(server.tiers, agent.id)}
            onSluit={() => setGekozen(null)}
            onMissie={(id, actie) => {
              void (actie === 'pause' ? pauseMission(id) : resumeMission(id)).then(verversServerAgents);
            }}
            onOpvolging={(tekst) => {
              const srv = server.agents[agent.id];
              const akkoord = followupIsAkkoord(tekst);
              const afwijs = followupIsAfwijzing(tekst);
              if ((akkoord || afwijs) && wachtOpOk(srv, job?.state === 'waiting')) {
                void beslisAgentOk({
                  akkoord,
                  agent: srv,
                  job,
                  reden: akkoord ? 'Approved in Managers desk.' : 'Declined in Managers desk.',
                }).then((ok) => {
                  if (ok && job) {
                    useAxeJobStore.getState().patch(job.id, { state: akkoord ? 'running' : 'failed' });
                  }
                  verversServerAgents();
                });
                return;
              }
              startAxeJobs([{
                text: tekst,
                titel: tekst.slice(0, 60),
                device: job?.device ?? null,
                tab: job?.tab,
                bron: 'followup',
                route: {
                  ...classifyAxeTier(tekst),
                  tier: 3,
                  kind: 'agent',
                  agent: agent.id,
                  skill: null,
                  confident: true,
                  reason: 'managers:v3',
                },
              }]);
            }}
            onGoedkeuring={(akkoord) => {
              void beslisAgentOk({
                akkoord,
                agent: server.agents[agent.id],
                job,
                reden: akkoord ? 'Approved in Managers desk.' : 'Declined in Managers desk.',
              }).then((ok) => {
                if (ok && job) {
                  useAxeJobStore.getState().patch(job.id, { state: akkoord ? 'running' : 'failed' });
                }
                verversServerAgents();
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
