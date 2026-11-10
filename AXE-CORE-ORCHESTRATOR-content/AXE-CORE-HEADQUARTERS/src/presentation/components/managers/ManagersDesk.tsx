/**
 * Managers tab — Grok Bot–style chat room (refs: managers-ref-grokbot / axe-mock):
 * left: centered square AXE Core avatar (Grok Wingman style), Projects Manager
 *       as Boss/orchestrator, then app managers with full names (no Twin)
 * right: conversation + composer (ManagerChat) inside the in-app browser plaat
 * Chat/Activity/Memory live once in Agents top viewctl — not duplicated here
 *
 * Boss is not a manager: he classifies Luka's message and forwards it.
 * Projects Manager can dispatch to managers under it the same way.
 * Managers create durable coding tasks (branch/PR only — never auto-merge/deploy).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { agentById, type AxeAgent, type AxeAgentId } from '@/domain/agents/roster';
import { isGrokManager, type GrokManagerId } from '@/domain/agents/grokManagers';
import {
  BOSS_ID,
  MANAGER_APP_GROEPEN,
  PROJECTS_ORCH_ID,
  bossAgent,
  classificeerBossNaarManager,
  classificeerProjectsNaarManager,
  doorgestuurdTekst,
  isBoss,
  isCodingOpdracht,
  isProjectsOrch,
  magDoorgeven,
  managersOnderProjects,
  primaireRepoVoor,
  projectsOrchAgent,
} from '@/domain/agents/bossRoute';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { syncManagerDraad, managerGelezen, MANAGER_DRAAD_EVT } from '@/infrastructure/persistence/managerDraadSync';
import { GESPREK_CONTEXT } from '@/domain/tierRouter/agentDraad';
import { laatManagerAntwoorden } from '@/application/managers/managerAntwoord';
import { ManagerChat } from '@/presentation/components/axe-core/ManagerChat';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { startAxeJobs } from '@/presentation/store/installTierRouter';
import { managerChatRoute } from '@/domain/agents/managersComposerDoel';
import { useManagersDeskStore } from '@/presentation/store/managersDeskStore';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { followupIsAkkoord, followupIsAfwijzing } from '@/domain/goedkeuringFollowup';
import { wachtOpOk } from '@/domain/agents/pendingApproval';
import { pauseMission, resumeMission } from '@/infrastructure/gateways/axeCoreApiService';
import { agentTierRegel } from '@/domain/agents/agentTiers';
import {
  bewaarManagerChat,
  laadManagerChat,
  gesprekContext,
  nieuwMsg,
  nieuwRelayMsg,
} from '@/domain/agents/managerChatOpslag';
import { amsterdamKlok } from '@/domain/tijd';
import type { ServerAgent } from '@/domain/agents/serverStatus';

const SUBTITELS: Partial<Record<AxeAgentId, string>> = {
  axe: 'Boss · jouw hoofdassistent',
  axemanager: 'Owns AXE Core HQ · branch/PR only',
  northseamgr: 'Deal desk · commodities',
  tradingos: 'Demo only · geen live orders',
  projectsmgr: 'Orchestrator · alle managers',
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
    if (m.kind === 'relay' && m.at > last) n += 1;
  }
  if (busy && n === 0) return 0;
  return n;
}

function previewTekst(agentId: string, srv?: ServerAgent): string {
  const chat = laadManagerChat(agentId);
  const last = [...chat].reverse().find((m) => m.kind !== 'relay' && m.text.trim());
  if (last?.text) return last.text.slice(0, 72);
  if (srv?.task?.title) return srv.task.title;
  if (srv?.reason) return srv.reason.slice(0, 72);
  return SUBTITELS[agentId as AxeAgentId] || 'Open chat';
}

function startManagerJob(agentId: AxeAgentId, tekst: string, opts?: { device?: string | null; tab?: string }) {
  const coding = isCodingOpdracht(tekst) && isGrokManager(agentId);
  const repo = coding ? primaireRepoVoor(agentId as GrokManagerId) : null;
  const basis = coding
    ? `${tekst}\n\n[AXE manager coding] Repo: ${repo}. Produce a branch + PR only. Never merge, never deploy. Wait for Luka's approval.`
    : tekst;
  const goal = `${basis}${GESPREK_CONTEXT}${gesprekContext(agentById(agentId).name, laadManagerChat(agentId), tekst)}`;
  startAxeJobs([{
    text: goal,
    titel: tekst.slice(0, 60),
    device: (opts?.device as 'mac-mini' | 'imac' | 'vps' | null | undefined) ?? null,
    tab: opts?.tab,
    repo,
    bron: 'followup',
    route: managerChatRoute(agentId, tekst),
  }]);
}

/**
 * `weergaveKnoppen` zijn de Chat/Activity/Memory-knoppen van Agents.tsx.
 *
 * Die stonden in een eigen zwarte balk bóven dit paneel, los van alles
 * waar ze bij horen. Ze horen in deze kop, naast de zoekbalk en links van
 * DAX — één rij in plaats van een balk die nergens aan vastzit.
 *
 * Als node doorgegeven en niet nagebouwd: de staat en de toetsenbordrollen
 * blijven op één plek staan, en twee kopieën van dezelfde knoppenrij lopen
 * gegarandeerd uit elkaar.
 */
type Props = { weergaveKnoppen?: ReactNode };

export function ManagersDesk({ weergaveKnoppen }: Props = {}) {
  const boss = useMemo(() => bossAgent(), []);
  const projects = useMemo(() => projectsOrchAgent(), []);
  const onderProjects = useMemo(() => managersOnderProjects(), []);
  const alleIds = useMemo(
    () => [BOSS_ID, PROJECTS_ORCH_ID, ...onderProjects.map((a) => a.id)] as AxeAgentId[],
    [onderProjects],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const openParam = searchParams.get('open') as AxeAgentId | null;
  const [gekozen, setGekozen] = useState<AxeAgentId | null>(
    () => (openParam && alleIds.includes(openParam) ? openParam : BOSS_ID),
  );
  const [zoek, setZoek] = useState('');
  const jobs = useAxeJobStore((s) => s.jobs);
  const server = useServerAgents();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  const zetDesk = useManagersDeskStore((s) => s.zet);
  const stuurRef = useRef<(tekst: string) => void>(() => {});

  useEffect(() => {
    if (openParam && alleIds.includes(openParam) && openParam !== gekozen) {
      setGekozen(openParam);
    }
  }, [openParam, alleIds, gekozen]);

  useEffect(() => {
    if (!gekozen) return;
    schrijfLastRead(gekozen, Date.now());
    managerGelezen(gekozen);
    tick((n) => n + 1);
  }, [gekozen]);

  // Grok Bot-gesprek: de draad staat op de VPS, zodat elk apparaat hetzelfde
  // ziet en de managers je zelf in gewone taal kunnen schrijven.
  useEffect(() => {
    let alive = true;
    const ronde = () => { void syncManagerDraad(alleIds).then((n) => { if (alive && n) tick((x) => x + 1); }); };
    ronde();
    const timer = window.setInterval(ronde, 20_000);
    const opNieuw = () => tick((x) => x + 1);
    window.addEventListener(MANAGER_DRAAD_EVT, opNieuw);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener(MANAGER_DRAAD_EVT, opNieuw); };
  }, [alleIds]);

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

  const handoff = (fromId: AxeAgentId, target: GrokManagerId, tekst: string) => {
    const door = doorgestuurdTekst(target);
    const fromChat = laadManagerChat(fromId);
    bewaarManagerChat(fromId, [
      ...fromChat,
      nieuwMsg('user', tekst),
      nieuwRelayMsg(fromId),
      nieuwMsg('assistant', door),
    ]);
    const mgrChat = laadManagerChat(target);
    bewaarManagerChat(target, [
      ...mgrChat,
      nieuwRelayMsg(fromId),
      nieuwMsg('user', tekst),
      nieuwMsg('assistant', `Van ${agentById(fromId).name}: ${door}. Ik pak dit op.`),
    ]);
    kies(target);
    startManagerJob(target, tekst, { device: job?.device ?? null, tab: job?.tab });
    tick((n) => n + 1);
  };

  const stuurNaarGekozen = (tekst: string) => {
    if (!agent) return;
    // Wat je typt staat binnen een paar seconden ook op je andere apparaten.
    window.setTimeout(() => { void syncManagerDraad(alleIds); }, 1500);
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

    // Boss / Projects Manager: classify → relay line → hand off.
    if (magDoorgeven(agent.id)) {
      const target = isBoss(agent.id)
        ? classificeerBossNaarManager(tekst)
        : classificeerProjectsNaarManager(tekst);
      // If Projects classifies to itself somehow, just run locally.
      if (isProjectsOrch(agent.id) && target === PROJECTS_ORCH_ID) {
        startManagerJob(agent.id, tekst, { device: job?.device ?? null, tab: job?.tab });
        return;
      }
      handoff(agent.id, target, tekst);
      return;
    }

    // Een coding-opdracht blijft een taak (branch + PR, nooit mergen). Al het
    // andere: de manager antwoordt zelf, als collega, op het abonnement.
    if (isCodingOpdracht(tekst)) {
      startManagerJob(agent.id, tekst, { device: job?.device ?? null, tab: job?.tab });
      return;
    }
    const opties = { device: job?.device ?? null, tab: job?.tab };
    void laatManagerAntwoorden(agent.id, tekst, (actie) => startManagerJob(agent.id, actie, opties)).then((zelf) => {
      if (!zelf) startManagerJob(agent.id, tekst, opties);
      tick((n) => n + 1);
    });
  };

  useEffect(() => {
    stuurRef.current = stuurNaarGekozen;
  });

  useEffect(() => {
    zetDesk({
      deskActief: true,
      gekozenId: gekozen,
      stuur: (tekst) => stuurRef.current(tekst),
    });
    return () => zetDesk({ deskActief: false, gekozenId: null, stuur: null });
  }, [gekozen, zetDesk]);

  const matchZoek = (a: AxeAgent) => {
    const q = zoek.trim().toLowerCase();
    if (!q) return true;
    return `${a.name} ${a.kort} ${a.role}`.toLowerCase().includes(q);
  };

  const renderRij = (a: AxeAgent, opts?: { pin?: boolean; orch?: boolean }) => {
    const srv = server.agents[a.id];
    const busy = jobs.some((j) => j.agent === a.id && (j.state === 'running' || j.state === 'queued' || j.state === 'waiting'));
    const status = statusVoor(a, busy, srv);
    const unread = gekozen === a.id ? 0 : ongelezen(a.id, srv, busy);
    const open = gekozen === a.id;
    const chat = laadManagerChat(a.id);
    const lastAt = [...chat].reverse().find((m) => m.at)?.at;
    return (
      <li key={a.id}>
        <button
          type="button"
          className="axe-managers-room-rij"
          data-open={open ? 'ja' : undefined}
          data-tone={status.tone}
          data-axe-boss={isBoss(a.id) ? 'ja' : undefined}
          data-axe-orch={opts?.orch ? 'ja' : undefined}
          data-axe-pin={opts?.pin ? 'ja' : undefined}
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
                {a.name}
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
              {opts?.orch ? 'Boss · Orchestrator' : status.label}
              {!isBoss(a.id) && srv?.current_action ? ` · ${srv.current_action.slice(0, 40)}` : ''}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const bossUnread = gekozen === BOSS_ID ? 0 : ongelezen(BOSS_ID, server.agents[BOSS_ID]);
  const bossBusy = jobs.some((j) => j.agent === BOSS_ID && (j.state === 'running' || j.state === 'queued' || j.state === 'waiting'));
  const bossStatus = statusVoor(boss, bossBusy, server.agents[BOSS_ID]);
  const bossOpen = gekozen === BOSS_ID;

  return (
    <div className="axe-managers-room axe-browser-vak" data-axe-managers-desk="grokbot">
      <div className="axe-managers-room-lijst" aria-label="Managers">
        <header className="axe-managers-room-lijst-kop">
          <div className="axe-managers-room-zoekrij axe-managers-room-zoekrij--kop">
            <label className="axe-managers-room-zoek">
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Zoek manager…"
                aria-label="Zoek manager"
              />
            </label>
          </div>
          {weergaveKnoppen && (
            <div className="axe-managers-room-weergave" role="tablist" aria-label="Agents view">
              {weergaveKnoppen}
            </div>
          )}
          <button
            type="button"
            className="axe-managers-room-daxlink"
            onClick={() => navigate('/dax')}
            title="DAX bots overview"
          >
            DAX
          </button>
        </header>

        <>

            {/* Large AXE Core tile — Grok "Luka's Wingman" equivalent */}
            <button
              type="button"
              className="axe-managers-room-boss-tile"
              data-open={bossOpen ? 'ja' : undefined}
              data-axe-boss-tile="ja"
              aria-current={bossOpen ? 'true' : undefined}
              onClick={() => kies(BOSS_ID)}
              style={{ ['--mgr-accent' as string]: boss.accent }}
            >
              <span className="axe-managers-room-boss-av">
                <ManagerAvatar agent={boss} size={72} />
                <span className="axe-managers-room-stip" data-tone={bossStatus.tone} aria-hidden />
              </span>
              <span className="axe-managers-room-boss-naam">AXE Core</span>
              <span className="axe-managers-room-boss-sub">
                {previewTekst(BOSS_ID, server.agents[BOSS_ID])}
              </span>
              {bossUnread > 0 && (
                <span className="axe-managers-room-unread" aria-label={`${bossUnread} unread`}>
                  {bossUnread > 9 ? '9+' : bossUnread}
                </span>
              )}
            </button>

            <ul className="axe-managers-room-ul" role="list">
              {matchZoek(projects) && (
                <>
                  <li className="axe-managers-room-sectie" aria-label="Projects orchestrator">
                    <p className="axe-managers-room-sectie-label">Boss</p>
                  </li>
                  {renderRij(projects, { pin: true, orch: true })}
                </>
              )}

              {MANAGER_APP_GROEPEN.map((groep) => {
                const agents = groep.ids
                  .map((id) => agentById(id))
                  .filter(matchZoek);
                if (!agents.length) return null;
                return (
                  <li key={groep.label} className="axe-managers-room-groep" aria-label={groep.label}>
                    <p className="axe-managers-room-sectie-label">{groep.label}</p>
                    <ul className="axe-managers-room-groep-ul" role="list">
                      {agents.map((a) => renderRij(a))}
                    </ul>
                  </li>
                );
              })}
            </ul>
        </>
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
            onOpvolging={stuurNaarGekozen}
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
            <p>Select AXE Core or a manager to open the chat.</p>
          </div>
        )}
      </section>
    </div>
  );
}
