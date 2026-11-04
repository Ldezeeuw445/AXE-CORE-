/**
 * Managers tab — Grok-style chat room:
 * left: Boss (AXE Core) pinned on top, then the six app managers
 * right: conversation thread + composer (ManagerChat, real jobs/server data)
 *
 * Boss is not a manager: he classifies Luka's message and forwards it
 * ("doorgestuurd naar <Manager>"). Managers create durable coding tasks
 * (branch/PR only — never auto-merge/deploy from this path).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { agentById, type AxeAgent, type AxeAgentId } from '@/domain/agents/roster';
import { isGrokManager, type GrokManagerId } from '@/domain/agents/grokManagers';
import {
  BOSS_ID,
  bossAgent,
  classificeerBossNaarManager,
  doorgestuurdTekst,
  isBoss,
  isCodingOpdracht,
  managersZonderBoss,
  primaireRepoVoor,
} from '@/domain/agents/bossRoute';
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
import { bewaarManagerChat, laadManagerChat, nieuwMsg } from '@/domain/agents/managerChatOpslag';
import { amsterdamKlok } from '@/domain/tijd';
import type { ServerAgent } from '@/domain/agents/serverStatus';

const SUBTITELS: Partial<Record<AxeAgentId, string>> = {
  axe: 'Boss · stuurt door naar de juiste manager',
  axemanager: 'Owns AXE Core HQ · branch/PR only',
  northseamgr: 'Deal desk · commodities',
  tradingos: 'Demo only · geen live orders',
  projectsmgr: 'Build & ship · repos & PRs',
  companionmgr: 'Product twin · UX stem',
  axon: 'Memory twin · long-term',
};

const LAST_READ_KEY = 'axe_managers_last_read_v1';

function leesLastRead(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, number>;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function schrijfLastRead(id: string, at: number) {
  try {
    const cur = leesLastRead();
    cur[id] = at;
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(cur));
  } catch { /* ignore */ }
}

function deskLijst(): AxeAgent[] {
  return managersZonderBoss();
}

function statusVoor(
  agent: AxeAgent,
  busy: boolean,
  srv?: ServerAgent,
): { label: string; tone: 'live' | 'busy' | 'idle' | 'wait' } {
  if (isBoss(agent.id)) {
    return { label: 'Boss', tone: 'live' };
  }
  if (wachtOpOk(srv, false) || srv?.status === 'WAITING_APPROVAL') {
    return { label: 'Needs you', tone: 'wait' };
  }
  if (busy || srv?.status === 'WORKING') return { label: 'Working', tone: 'busy' };
  if (srv?.status === 'QUEUED' || srv?.status === 'WAITING_AGENT' || srv?.status === 'WAITING_TOOL') {
    return { label: 'Queued', tone: 'busy' };
  }
  if (srv?.status === 'BLOCKED' || srv?.status === 'ERROR') {
    return { label: 'Blocked', tone: 'wait' };
  }
  if (agent.id === 'tradingos') return { label: 'Demo', tone: 'idle' };
  if (srv && srv.status !== 'SLEEPING') return { label: 'Live', tone: 'live' };
  return { label: 'Ready', tone: 'live' };
}

function ongelezen(agentId: string, srv?: ServerAgent, busy = false): number {
  const last = leesLastRead()[agentId] ?? 0;
  let n = 0;
  const approvals = srv?.pendingApprovals?.length ?? (srv?.pendingApproval ? 1 : 0);
  if (approvals > 0) n += approvals;
  if (wachtOpOk(srv, false)) n = Math.max(n, 1);
  const chat = laadManagerChat(agentId);
  for (const m of chat) {
    if (m.role === 'assistant' && m.at > last) n += 1;
  }
  if (busy && n === 0) return 0;
  return n;
}

function previewTekst(agentId: string, srv?: ServerAgent): string {
  const chat = laadManagerChat(agentId);
  const last = chat[chat.length - 1];
  if (last?.text) return last.text.slice(0, 72);
  if (srv?.task?.title) return srv.task.title;
  if (srv?.reason) return srv.reason.slice(0, 72);
  return SUBTITELS[agentId as AxeAgentId] || 'Open chat';
}

function startManagerJob(agentId: AxeAgentId, tekst: string, opts?: { device?: string | null; tab?: string }) {
  const coding = isCodingOpdracht(tekst) && isGrokManager(agentId);
  const repo = coding ? primaireRepoVoor(agentId as GrokManagerId) : null;
  const goal = coding
    ? `${tekst}\n\n[AXE manager coding] Repo: ${repo}. Produce a branch + PR only. Never merge, never deploy. Wait for Luka's approval.`
    : tekst;
  startAxeJobs([{
    text: goal,
    titel: tekst.slice(0, 60),
    device: (opts?.device as 'mac-mini' | 'imac' | 'vps' | null | undefined) ?? null,
    tab: opts?.tab,
    repo,
    bron: 'followup',
    route: {
      ...classifyAxeTier(tekst),
      tier: 3,
      kind: 'agent',
      agent: agentId,
      skill: null,
      confident: true,
      reason: coding ? 'managers:coding-task' : 'managers:chat-room',
    },
  }]);
}

export function ManagersDesk() {
  const managers = useMemo(() => deskLijst(), []);
  const boss = useMemo(() => bossAgent(), []);
  const alleIds = useMemo(() => [BOSS_ID, ...managers.map((a) => a.id)] as AxeAgentId[], [managers]);
  const [searchParams, setSearchParams] = useSearchParams();
  const openParam = searchParams.get('open') as AxeAgentId | null;
  const [gekozen, setGekozen] = useState<AxeAgentId | null>(
    () => (openParam && alleIds.includes(openParam) ? openParam : BOSS_ID),
  );
  const jobs = useAxeJobStore((s) => s.jobs);
  const server = useServerAgents();
  const navigate = useNavigate();
  const [, tick] = useState(0);

  useEffect(() => {
    if (openParam && alleIds.includes(openParam) && openParam !== gekozen) {
      setGekozen(openParam);
    }
  }, [openParam, alleIds, gekozen]);

  useEffect(() => {
    if (!gekozen) return;
    schrijfLastRead(gekozen, Date.now());
    tick((n) => n + 1);
  }, [gekozen]);

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

  const kies = (id: AxeAgentId) => {
    setGekozen(id);
    schrijfLastRead(id, Date.now());
    const next = new URLSearchParams(searchParams);
    next.set('open', id);
    setSearchParams(next, { replace: true });
  };

  const renderRij = (a: AxeAgent, bossRij = false) => {
    const srv = server.agents[a.id];
    const busy = jobs.some((j) => j.agent === a.id && (j.state === 'running' || j.state === 'queued' || j.state === 'waiting'));
    const status = statusVoor(a, busy, srv);
    const unread = gekozen === a.id ? 0 : ongelezen(a.id, srv, busy);
    const open = gekozen === a.id;
    const chat = laadManagerChat(a.id);
    const lastAt = chat[chat.length - 1]?.at;
    return (
      <li key={a.id}>
        <button
          type="button"
          className="axe-managers-room-rij"
          data-open={open ? 'ja' : undefined}
          data-tone={status.tone}
          data-axe-boss={bossRij ? 'ja' : undefined}
          aria-current={open ? 'true' : undefined}
          onClick={() => kies(a.id)}
          style={{ ['--mgr-accent' as string]: a.accent }}
        >
          <span className="axe-managers-room-av">
            <ManagerAvatar agent={a} size={40} />
            <span className="axe-managers-room-stip" data-tone={status.tone} aria-hidden />
          </span>
          <span className="axe-managers-room-meta">
            <span className="axe-managers-room-rij-top">
              <span className="axe-managers-room-naam">
                {bossRij ? 'Boss' : (a.kort || a.name)}
              </span>
              <span className="axe-managers-room-tijd">
                {lastAt ? amsterdamKlok(lastAt) : ''}
              </span>
            </span>
            <span className="axe-managers-room-rij-bot">
              <span className="axe-managers-room-preview">{previewTekst(a.id, srv)}</span>
              {unread > 0 && (
                <span className="axe-managers-room-unread" aria-label={`${unread} unread`}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
            <span className="axe-managers-room-status" data-tone={status.tone}>
              {bossRij ? 'Boss' : status.label}
              {!bossRij && srv?.current_action ? ` · ${srv.current_action.slice(0, 40)}` : ''}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="axe-managers-room" data-axe-managers-desk="chat-room">
      <div className="axe-managers-room-lijst" aria-label="Managers">
        <header className="axe-managers-room-lijst-kop">
          <div>
            <p className="axe-managers-room-eyebrow">Managers</p>
            <h2 className="axe-managers-room-titel">Chat</h2>
          </div>
          <button
            type="button"
            className="axe-managers-room-daxlink"
            onClick={() => navigate('/dax')}
            title="DAX bots overview"
          >
            DAX
          </button>
        </header>
        <ul className="axe-managers-room-ul" role="list">
          <li className="axe-managers-room-sectie" aria-label="Boss">
            <p className="axe-managers-room-sectie-label">Boss</p>
          </li>
          {renderRij(boss, true)}
          <li className="axe-managers-room-sectie" aria-label="App managers">
            <p className="axe-managers-room-sectie-label">Managers</p>
          </li>
          {managers.map((a) => renderRij(a, false))}
        </ul>
      </div>

      <section className="axe-managers-room-draad" aria-label={agent ? `Chat with ${agent.name}` : 'Conversation'}>
        {agent ? (
          <ManagerChat
            key={agent.id}
            layout="desk"
            agent={agent}
            job={job}
            jobs={agentJobs}
            server={server.agents[agent.id]}
            extraGoedkeuringen={extra}
            tierRegel={agentTierRegel(server.tiers, agent.id)}
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
                  reden: akkoord ? 'Approved in Managers chat.' : 'Declined in Managers chat.',
                }).then((ok) => {
                  if (ok && job) {
                    useAxeJobStore.getState().patch(job.id, { state: akkoord ? 'running' : 'failed' });
                  }
                  verversServerAgents();
                });
                return;
              }

              // Boss: classify → show "doorgestuurd naar <Manager>" → hand off.
              if (isBoss(agent.id)) {
                const target = classificeerBossNaarManager(tekst);
                const door = doorgestuurdTekst(target);
                const bestaand = laadManagerChat(BOSS_ID);
                bewaarManagerChat(BOSS_ID, [
                  ...bestaand,
                  nieuwMsg('user', tekst),
                  nieuwMsg('assistant', door),
                ]);
                const mgrChat = laadManagerChat(target);
                bewaarManagerChat(target, [
                  ...mgrChat,
                  nieuwMsg('user', tekst),
                  nieuwMsg('assistant', `Van Boss: ${door}. Ik pak dit op.`),
                ]);
                kies(target);
                startManagerJob(target, tekst, { device: job?.device ?? null, tab: job?.tab });
                tick((n) => n + 1);
                return;
              }

              startManagerJob(agent.id, tekst, { device: job?.device ?? null, tab: job?.tab });
            }}
            onGoedkeuring={(akkoord) => {
              void beslisAgentOk({
                akkoord,
                agent: server.agents[agent.id],
                job,
                reden: akkoord ? 'Approved in Managers chat.' : 'Declined in Managers chat.',
              }).then((ok) => {
                if (ok && job) {
                  useAxeJobStore.getState().patch(job.id, { state: akkoord ? 'running' : 'failed' });
                }
                verversServerAgents();
              });
            }}
          />
        ) : (
          <div className="axe-managers-room-leeg">
            <p>Select Boss or a manager to open the chat.</p>
          </div>
        )}
      </section>
    </div>
  );
}
