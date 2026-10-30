/**
 * Alle hoofdagents naast de sphere, in gewone taal, met live status.
 *
 * Luka, 17 okt: niet alleen de vijf managers — élke roster-agent behalve de
 * core zelf (die is de bol), verdeeld over een linker- en een gespiegelde
 * rechterkolom. Statusregel: wat hij nu doet, volgende cyclus, of waarom hij
 * vastzit. Needs-your-OK krijgt Approve/Decline op de rij.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { agentRegel, goedkeuringVanJob } from '@/domain/agentBewustzijn';
import { railKolommen, railRijen } from '@/domain/tierRouter/agentVenster';
import type { ManagerRij } from '@/domain/tierRouter/agentVenster';
import type { AxeAgentId } from '@/domain/agents/roster';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { ManagerChat } from '@/presentation/components/axe-core/ManagerChat';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { STAND } from '@/presentation/components/axe-core/managerStand';
import { startAxeJobs } from '@/presentation/store/installTierRouter';
import { classifyAxeTier } from '@/domain/tierRouter/axeRoute';
import { pauseMission, resumeMission } from '@/infrastructure/gateways/axeCoreApiService';
import { agentLiveRegel, daxRegel, serverStand as bepaalServerStand, type ServerAgent } from '@/domain/agents/serverStatus';
import './homeLive.css';
import { rijenVoorAgent, wachtOpOk } from '@/domain/agents/pendingApproval';
import { followupIsAkkoord, followupIsAfwijzing } from '@/domain/goedkeuringFollowup';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import type { GoedkeuringsRij } from '@/domain/agents/pendingApproval';
import { agentTierRegel } from '@/domain/agents/agentTiers';

const TIK_MS = 1_000;
const LEESBAAR = '0 1px 3px rgba(0,0,0,.7)';

const TEGEL: React.CSSProperties = {
  borderRadius: 14,
  background: 'var(--axe-kaart-vlak)',
  border: '1px solid var(--axe-kaart-lijn)',
  borderTopColor: 'var(--axe-kaart-lijn-boven)',
  boxShadow: '0 3px 0 rgba(0,0,0,.45), 0 8px 18px rgba(0,0,0,.28)',
};

const BALK: React.CSSProperties = {
  borderRadius: 12,
  background: 'var(--axe-kaart-vlak)',
  border: '1px solid var(--axe-kaart-lijn)',
  borderTopColor: 'var(--axe-kaart-lijn-boven)',
};

function DaxStip({ server }: { server?: ServerAgent }) {
  const regel = server ? daxRegel(server) : null;
  if (!server?.dax_computer || !regel) return null;
  const wakker = regel.wakker;
  return (
    <span
      title={regel.blokkade ? `${regel.tekst} · can't: ${regel.blokkade}` : regel.tekst}
      aria-label={`DAX ${wakker ? 'awake' : 'asleep'}`}
      className="inline-block size-1.5 rounded-full"
      style={{ background: wakker ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.25)', boxShadow: wakker ? '0 0 6px var(--accent-cyan)' : 'none' }}
    />
  );
}

const TEGEL_KORT: Partial<Record<AxeAgentId, string>> = {
  wingman: 'Wing',
  northsea: 'North',
  trading: 'Trade',
  developer: 'Dev',
  thinktank: 'Think',
  browser: 'Web',
  memory: 'Mem',
  finance: 'Fin',
  companion: 'Comp',
};

function tegelNaam(id: AxeAgentId, fallback: string): string {
  return TEGEL_KORT[id] ?? fallback;
}

function Tegel({ rij, open, onKies }: { rij: ManagerRij; open: boolean; onKies: () => void }) {
  const { agent } = rij;
  return (
    <button
      type="button"
      onClick={onKies}
      aria-expanded={open}
      aria-label={`Gesprek met ${agent.name}`}
      data-axe-doel={`agent:${agent.id}`}
      className="axe-home-rail-tegel flex flex-col items-center gap-px cursor-pointer"
      style={{ ...TEGEL, textShadow: LEESBAAR }}
    >
      <ManagerAvatar agent={agent} size={20} />
      <span className="axe-home-rail-tegel-naam" style={{ color: 'var(--text-muted)' }}>
        {tegelNaam(agent.id, agent.kort ?? agent.name)}
      </span>
    </button>
  );
}

function liveRegel(server?: ServerAgent): string {
  return server ? agentLiveRegel(server) : '';
}

function Balkje({
  rij, onKies, server, extra, onBeslis, tierRegel,
}: {
  rij: ManagerRij;
  onKies: () => void;
  server?: ServerAgent;
  extra: Array<{ id: string; task_id?: string; wat?: string | null; waarom?: string | null; title?: string; detail?: string }>;
  onBeslis: (rij: GoedkeuringsRij, akkoord: boolean) => void;
  tierRegel?: string;
}) {
  const { agent, job } = rij;
  const vraag = job?.state === 'waiting' ? goedkeuringVanJob(job) : null;
  const regel = job ? agentRegel(job) : rij.regel;
  const okRijen = rijenVoorAgent(server, extra);
  if (job?.taskId && job.approvalId && !okRijen.some((r) => r.id === job.approvalId)) {
    okRijen.unshift({
      id: job.approvalId,
      taskId: job.taskId,
      wat: vraag?.wat || job.approvalVraag || job.title || 'This needs your OK.',
      waarom: vraag?.waarom || '',
    });
  }
  const wacht = wachtOpOk(server, job?.state === 'waiting');
  const serverStand = !job && server ? bepaalServerStand(server) : null;
  const extraRegel = !job ? liveRegel(server) : '';

  const standTekst = job ? regel : (extraRegel || serverStand?.regel || '');

  if (wacht || (serverStand && !serverStand.stil) || job || extraRegel) {
    const stand = vraag || wacht
      ? STAND.waiting
      : job
        ? STAND[job.state === 'waiting' ? 'running' : job.state]
        : { label: serverStand?.label ?? '', kleur: serverStand?.kleur ?? 'var(--text-secondary)' };
    return (
      <div
        className="w-full min-w-0 axe-home-rail-balk"
        style={BALK}
        data-axe-server-status={server?.status}
      >
        <button
          type="button"
          onClick={onKies}
          aria-label={`Gesprek met ${agent.name}`}
          className="axe-home-rail-balk-knop"
        >
          <span className="axe-home-rail-kop">
            <span className="axe-home-rail-naam-rij">
              <span className="axe-home-rail-naam" style={{ color: agent.accent }}>
                {agent.kort ?? agent.name}
              </span>
              {tierRegel ? <span className="axe-home-rail-tier">{tierRegel}</span> : null}
              <span className="axe-home-rail-label flex items-center gap-1.5" style={{ color: stand.kleur }}>
                {wacht ? STAND.waiting.label : stand.label}
                <DaxStip server={server} />
              </span>
            </span>
            {standTekst ? <span className="axe-home-rail-regel">{standTekst}</span> : null}
          </span>
        </button>
        {wacht && (
          <GoedkeuringActie rijen={okRijen.length ? okRijen : [{
            id: server?.pendingApproval?.id || job?.approvalId || `${agent.id}-ok`,
            taskId: server?.task?.id || job?.taskId || '',
            wat: vraag?.wat || server?.pendingApproval?.wat || server?.pendingApproval?.title || server?.reason || 'A step is waiting for Luka\'s approval.',
            waarom: vraag?.waarom || server?.pendingApproval?.waarom || server?.pendingApproval?.detail || '',
          }]} chip onBeslis={onBeslis} />
        )}
      </div>
    );
  }

  return (
    <div className="axe-home-rail-balk" style={{ ...BALK, textShadow: LEESBAAR }}>
      <span className="axe-home-rail-kop">
        <span className="axe-home-rail-naam-rij">
          <span className="axe-home-rail-naam" style={{ color: agent.accent }}>{agent.kort ?? agent.name}</span>
          {tierRegel ? <span className="axe-home-rail-tier">{tierRegel}</span> : null}
          <span className="axe-home-rail-label flex items-center gap-1.5">
            {serverStand ? serverStand.label : 'idle'}
            <DaxStip server={server} />
          </span>
        </span>
      </span>
    </div>
  );
}

export function AgentVensters() {
  const jobs = useAxeJobStore((s) => s.jobs);
  const server = useServerAgents();
  const isMobile = useIsMobile();
  const [gekozen, setGekozen] = useState<AxeAgentId | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  const heeftKlare = jobs.some((j) => j.finishedAt != null);
  useEffect(() => {
    if (!heeftKlare) return;
    const t = setInterval(() => setNu(Date.now()), TIK_MS);
    return () => clearInterval(t);
  }, [heeftKlare]);

  const alle = railRijen(jobs, nu);
  const { links, rechts } = railKolommen(alle);
  const kolommen = isMobile ? [{ id: 'links' as const, rijen: alle }] : [
    { id: 'links' as const, rijen: links },
    { id: 'rechts' as const, rijen: rechts },
  ];
  const open = gekozen ? alle.find((r) => r.agent.id === gekozen) ?? null : null;
  const extra = server.approvals.map((a) => ({
    id: a.id,
    task_id: a.task_id,
    wat: a.wat,
    waarom: a.waarom,
    title: a.title,
    detail: a.detail,
  }));

  const beslissen = (agentId: AxeAgentId, rij: GoedkeuringsRij, akkoord: boolean) => {
    const job = jobs.find((j) => j.agent === agentId && j.state === 'waiting') ?? null;
    void beslisAgentOk({
      akkoord,
      agent: server.agents[agentId],
      job,
      rij: rij.taskId ? rij : null,
      reden: akkoord ? 'Approved in Home window.' : 'Declined in Home window.',
    }).then((ok) => {
      if (ok && job) useAxeJobStore.getState().patch(job.id, { state: akkoord ? 'running' : 'failed' });
      verversServerAgents();
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-axe-agent-vensters>
      {kolommen.map((kolom) => (
        <div
          key={kolom.id}
          className={`axe-home-rail ${isMobile ? 'axe-home-rail--mobiel' : kolom.id === 'rechts' ? 'axe-home-rail--rechts' : 'axe-home-rail--links'}`}
          data-axe-home-rail={kolom.id}
        >
          <div className="axe-home-rail-stapel">
            {kolom.rijen.map((rij) => {
              const kies = () => setGekozen((v) => (v === rij.agent.id ? null : rij.agent.id));
              return (
                <div key={rij.agent.id} className="axe-home-rail-rij" data-axe-agent={rij.agent.id}>
                  <Tegel rij={rij} open={gekozen === rij.agent.id} onKies={kies} />
                  <Balkje
                    rij={rij}
                    onKies={kies}
                    server={server.agents[rij.agent.id]}
                    extra={extra}
                    onBeslis={(g, akkoord) => beslissen(rij.agent.id, g, akkoord)}
                    tierRegel={agentTierRegel(server.tiers, rij.agent.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Luka okt 2026: klik manager → core morfht tot chat (zelfde plek/taal als
          sphere-projecties), rails L/R blijven; Escape/✕ klapt terug naar core. */}
      <AnimatePresence>
        {open && (
          <div
            key={open.agent.id}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
            data-axe-core-morph="manager-chat"
            aria-live="polite"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(0,0,0,.45), transparent 55%)' }}
              aria-hidden="true"
            />
            <ManagerChat
              agent={open.agent}
              job={open.job}
              jobs={jobs.filter((j) => j.agent === open.agent.id)}
              server={server.agents[open.agent.id]}
              extraGoedkeuringen={extra}
              tierRegel={agentTierRegel(server.tiers, open.agent.id)}
              onMissie={(id, actie) => {
                void (actie === 'pause' ? pauseMission(id) : resumeMission(id)).then(verversServerAgents);
              }}
              onSluit={() => setGekozen(null)}
              onOpvolging={(tekst) => {
                const srv = server.agents[open.agent.id];
                const akkoord = followupIsAkkoord(tekst);
                const afwijs = followupIsAfwijzing(tekst);
                if ((akkoord || afwijs) && wachtOpOk(srv, open.job?.state === 'waiting')) {
                  void beslisAgentOk({
                    akkoord,
                    agent: srv,
                    job: open.job,
                    reden: akkoord ? 'Approved in follow-up.' : 'Declined in follow-up.',
                  }).then((ok) => {
                    if (ok && open.job) {
                      useAxeJobStore.getState().patch(open.job.id, { state: akkoord ? 'running' : 'failed' });
                    }
                    verversServerAgents();
                  });
                  return;
                }
                startAxeJobs([{
                  text: tekst,
                  titel: tekst.slice(0, 60),
                  device: open.job?.device ?? null,
                  tab: open.job?.tab,
                  bron: 'followup',
                  route: {
                    ...classifyAxeTier(tekst),
                    tier: 3,
                    kind: 'agent',
                    agent: open.agent.id,
                    skill: null,
                    confident: true,
                    reason: 'home:followup',
                  },
                }]);
              }}
              onGoedkeuring={(akkoord) => {
                void beslisAgentOk({
                  akkoord,
                  agent: server.agents[open.agent.id],
                  job: open.job,
                  reden: akkoord ? 'Approved in Home window.' : 'Declined in Home window.',
                }).then((ok) => {
                  if (ok && open.job) {
                    useAxeJobStore.getState().patch(open.job.id, { state: akkoord ? 'running' : 'failed' });
                  }
                  verversServerAgents();
                });
              }}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
