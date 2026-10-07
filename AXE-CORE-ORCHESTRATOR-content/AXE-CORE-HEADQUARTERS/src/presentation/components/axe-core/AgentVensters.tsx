/**
 * De vijf managers links naast de sphere, in gewone taal.
 *
 * Luka, 25 sep, met een screenshot van zijn eigen Home erbij: "zo een beetje
 * dacht ik maar dan allemaal en ook floating zonder achtergrond." Vandaar:
 *
 * - LINKS, verticaal gecentreerd. De sphere houdt het midden.
 * - ALLE VIJF de tier-1 managers, altijd, in de volgorde van de roster. Wie
 *   niets doet valt terug tot zijn naam. Zo springt de kolom niet bij elke job
 *   en weet je waar Trading staat zonder te zoeken.
 * - ZWEVEND, geen vlak eronder. Geen kaart, geen pil, geen omhullende bak —
 *   kleur zit in letters, niet in vlakken (AGENTS.md).
 *
 * Klik een regel en zijn chatvenster komt ernaast staan. Dát is wel een kaart,
 * want dat is iets om te lezen.
 *
 * Hiervoor stonden hier vier zwevende kaartjes op vaste hoeken. Vier plekken
 * voor vijf managers werkte niet, en de kaartjes dekten de sphere af.
 *
 * Alleen stijl en indeling; de data komt uit useAxeJobStore, die de tier-router
 * al bijhoudt.
 */
import { Fragment, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { agentRegel, goedkeuringVanJob } from '@/domain/agentBewustzijn';
import { managerRijen, werkerRijen } from '@/domain/tierRouter/agentVenster';
import type { ManagerRij } from '@/domain/tierRouter/agentVenster';
import type { AxeAgentId } from '@/domain/agents/roster';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { ManagerChat } from '@/presentation/components/axe-core/ManagerChat';
import { STAND } from '@/presentation/components/axe-core/managerStand';
import { startAxeJobs } from '@/presentation/store/installTierRouter';
import { classifyAxeTier } from '@/domain/tierRouter/axeRoute';
import { decideDurableTaskApproval, pauseMission, resumeMission } from '@/infrastructure/gateways/axeCoreApiService';
import { serverStand as bepaalServerStand, type ServerAgent } from '@/domain/agents/serverStatus';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';

/** Hoe vaak de kolom zichzelf opnieuw beoordeelt, zodat nagloei echt afloopt. */
const TIK_MS = 1_000;

/**
 * Een lichte schaduw, geen vlak. Luka, 25 sep, met zijn eigen scherm erbij:
 * "het mag echt floaten op de tauri shell" en "niet een achtergrond zoals die
 * zwarte vlek". Er stond hier een verloop achter de kolom om de tekst op een
 * licht bureaublad leesbaar te houden; dat is eruit. Wat blijft is een schaduw
 * op de letters zelf, zoals ondertiteling — dat is geen grond om op te staan,
 * maar het scheelt genoeg om de tekst van de schil los te trekken.
 */
const LEESBAAR = '0 1px 3px rgba(0,0,0,.7)';

/* ── De tegel en het balkje ───────────────────────────────────────────────
 * Luka, 25 sep, met een beeld erbij: "kan je het gewoon precies zo maken,
 * zonder dat die blokken dempen maar er gewoon altijd zo zijn."
 *
 * Dus: links een tegel per manager -- afgerond vlakje, driehoekje erin, korte
 * naam eronder -- en daar rechts naast het balkje met wat hij nu zegt. Wie
 * niets doet houdt zijn tegel precies zoals hij is en krijgt alleen "IDLE"
 * naast zich. Niets dimt, ooit.
 *
 * De tegel en het balkje dragen hetzelfde materiaal als de rest van de schil
 * (--axe-kaart-*), dus ook in de glasstand blijft de tekst leesbaar. Dat is
 * wat er misging toen de kolom helemaal kaal zweefde.
 */

const TEGEL: React.CSSProperties = {
  width: 74,
  padding: '10px 6px 8px',
  borderRadius: 16,
  background: 'var(--axe-kaart-vlak)',
  border: '1px solid var(--axe-kaart-lijn)',
  borderTopColor: 'var(--axe-kaart-lijn-boven)',
  // Het donkere randje onder de tegel uit Luka's beeld: hij staat er net boven.
  boxShadow: '0 3px 0 rgba(0,0,0,.45), 0 8px 18px rgba(0,0,0,.28)',
};

const BALK: React.CSSProperties = {
  borderRadius: 12,
  background: 'var(--axe-kaart-vlak)',
  border: '1px solid var(--axe-kaart-lijn)',
  borderTopColor: 'var(--axe-kaart-lijn-boven)',
  padding: '9px 13px',
};

function Tegel({ rij, open, onKies }: { rij: ManagerRij; open: boolean; onKies: () => void }) {
  const { agent } = rij;
  return (
    <button
      type="button"
      onClick={onKies}
      aria-expanded={open}
      aria-label={`Gesprek met ${agent.name}`}
      className="flex flex-col items-center gap-1.5 cursor-pointer"
      style={{ ...TEGEL, textShadow: LEESBAAR }}
    >
      <ManagerAvatar agent={agent} size={36} />
      {/* De korte naam: "NORTHSEA DESK MANAGER" past hier niet op één regel. */}
      <span
        className="text-[8.5px] tracking-[0.12em] uppercase leading-none whitespace-nowrap"
        style={{ color: 'var(--text-muted)' }}
      >
        {agent.kort ?? agent.name}
      </span>
    </button>
  );
}

type Kant = 'links' | 'rechts';

function Balkje({ rij, onKies, kant = 'links', server }:
  { rij: ManagerRij; onKies: () => void; kant?: Kant; server?: ServerAgent }) {
  const { agent, job } = rij;
  const spiegel = kant === 'rechts';
  const vraag = job?.state === 'waiting' ? goedkeuringVanJob(job) : null;
  const regel = job ? agentRegel(job) : rij.regel;

  /* Geen job in déze app, maar de server ziet wél werk (een missie die op de
     VPS doorloopt terwijl de app dicht was): dat tonen, met de echte status.
     WORKING staat hier alleen bij een levende lease -- zie agent_activiteit.py. */
  const serverStand = !job && server ? bepaalServerStand(server) : null;
  if (serverStand && !serverStand.stil) {
    return (
      <button
        type="button"
        onClick={onKies}
        aria-label={`Gesprek met ${agent.name}`}
        className="flex items-center gap-3 w-full cursor-pointer min-w-0"
        style={{ ...BALK, flexDirection: spiegel ? 'row-reverse' : 'row',
                 textAlign: spiegel ? 'right' : 'left' }}
        data-axe-server-status={server?.status}
      >
        <span className="flex-1 min-w-0 text-[12.5px] leading-snug line-clamp-2">
          <span style={{ color: agent.accent, fontWeight: 500 }}>{agent.kort ?? agent.name}</span>
          {' '}
          <span style={{ color: 'var(--text-secondary)' }}>{serverStand.regel}</span>
        </span>
        <span
          className="text-[9.5px] tracking-[0.08em] uppercase whitespace-nowrap flex-shrink-0"
          style={{ color: serverStand.kleur }}
        >
          {serverStand.label}
        </span>
      </button>
    );
  }

  /* Stilstaand: geen balkje, alleen het woord. Zo blijft de rij op zijn plek
     en zie je in één blik wie er niets doet, zonder iets te dempen. "sleeping"
     als de server dat bevestigt; "idle" alleen als de server niet antwoordt. */
  if (!job) {
    return (
      <span
        className="text-[10px] tracking-[0.16em] uppercase"
        style={{
          color: 'var(--text-secondary)',
          textShadow: LEESBAAR,
          textAlign: spiegel ? 'right' : 'left',
        }}
      >
        {serverStand ? serverStand.label : 'idle'}
      </span>
    );
  }

  // De opdracht in Luka's woorden: de eerste regel, zonder de vaste skill-instructie ervoor.
  const opdracht = (/Luka said:\s*([\s\S]+)$/.exec(job.sourceText)?.[1] ?? job.sourceText ?? '')
    .split('\n').map((r) => r.trim()).find(Boolean)?.slice(0, 140) ?? '';
  const stand = vraag ? STAND.waiting : STAND[job.state === 'waiting' ? 'running' : job.state];
  return (
    <button
      type="button"
      onClick={onKies}
      aria-label={`Gesprek met ${agent.name}`}
      className="flex items-center gap-3 w-full cursor-pointer min-w-0"
      style={{ ...BALK, flexDirection: spiegel ? 'row-reverse' : 'row',
               textAlign: spiegel ? 'right' : 'left' }}
    >
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[12.5px] leading-snug line-clamp-2">
          <span style={{ color: agent.accent, fontWeight: 500 }}>{agent.kort ?? agent.name}</span>
          {' '}
          <span style={{ color: 'var(--text-secondary)' }}>{regel}</span>
        </span>
        {/* Wat AXE hem opdroeg (Luka, 7 okt: "waar ik kan zien wat axe tegen
            de agents zegt als hij hem aanstuurt"). Eén regel; het hele
            gesprek staat in het venster dat opent als je klikt. */}
        {opdracht && (
          <span className="text-[10.5px] leading-snug line-clamp-1" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: '#22d3ee' }}>AXE</span> → {opdracht}
          </span>
        )}
      </span>
      <span
        className="text-[9.5px] tracking-[0.08em] uppercase whitespace-nowrap flex-shrink-0"
        style={{ color: stand.kleur }}
      >
        {stand.label}
      </span>
    </button>
  );
}

export function AgentVensters() {
  const jobs = useAxeJobStore((s) => s.jobs);
  const server = useServerAgents();
  const [gekozen, setGekozen] = useState<AxeAgentId | null>(null);

  // Eén tik per seconde, zodat een net-klare job na de nagloei echt terugvalt
  // naar stil, ook als er verder niets in de store verandert.
  const [nu, setNu] = useState(() => Date.now());
  const heeftKlare = jobs.some((j) => j.finishedAt != null);
  useEffect(() => {
    if (!heeftKlare) return;
    const t = setInterval(() => setNu(Date.now()), TIK_MS);
    return () => clearInterval(t);
  }, [heeftKlare]);

  /* Rechts: de werkers die op dit moment iets doen, hoogstens vijf. Links:
     de vijf managers -- maar zonder het werk dat rechts al staat, anders leest
     dezelfde zin twee keer over het scherm. */
  const rechts = werkerRijen(jobs, nu);
  const links = managerRijen(jobs, nu, new Set(rechts.map((r) => r.agent.id)));
  const rijen = [...links, ...rechts];
  const open = gekozen ? rijen.find((r) => r.agent.id === gekozen) ?? null : null;
  const openRechts = !!open && rechts.some((r) => r.agent.id === open.agent.id);

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-axe-agent-vensters>
      {/* Op dezelfde hoogte als de sphere, en die staat NIET op de helft:
          AxeCoreSphere tekent hem op cy = h * 0.40, omdat een gecentreerd
          midden in dit vak te laag oogt. Met top:50% hing de kolom er dus
          onder. Nu volgt hij de sphere. */}
      <div
        className="pointer-events-auto absolute grid items-center"
        style={{
          left: 'clamp(24px, 3.5vw, 64px)',
          top: '40%',
          transform: 'translateY(-50%)',
          // Tegelkolom plus balkkolom. Smal genoeg om van de sphere af te
          // blijven: de stofwolk daarvan begint rond 31% van de breedte, dus
          // alles bij elkaar mag niet veel verder komen dan dat.
          width: 'min(30%, 430px)',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          columnGap: 16,
          rowGap: 18,
        }}
      >
        {links.map((rij) => {
          const kies = () => setGekozen((v) => (v === rij.agent.id ? null : rij.agent.id));
          return (
            <Fragment key={rij.agent.id}>
              <Tegel rij={rij} open={gekozen === rij.agent.id} onKies={kies} />
              <Balkje rij={rij} onKies={kies} server={server.agents[rij.agent.id]} />
            </Fragment>
          );
        })}
      </div>

      {/* Rechts hetzelfde, gespiegeld: balkje eerst, tegel tegen de rand.
          Geen vaste lijst -- staat er niemand, dan staat hier niets. */}
      {rechts.length > 0 && (
        <div
          className="pointer-events-auto absolute grid items-center"
          style={{
            right: 'clamp(24px, 3.5vw, 64px)',
            top: '40%',
            transform: 'translateY(-50%)',
            width: 'min(30%, 430px)',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            columnGap: 16,
            rowGap: 18,
          }}
        >
          {rechts.map((rij) => {
            const kies = () => setGekozen((v) => (v === rij.agent.id ? null : rij.agent.id));
            return (
              <Fragment key={rij.agent.id}>
                <Balkje rij={rij} onKies={kies} kant="rechts" server={server.agents[rij.agent.id]} />
                <Tegel rij={rij} open={gekozen === rij.agent.id} onKies={kies} />
              </Fragment>
            );
          })}
        </div>
      )}

      {/* Het venster komt rechts van de kolom te staan, niet eroverheen. */}
      <AnimatePresence>
        {open && (
          <div
            key={open.agent.id}
            className="pointer-events-none absolute"
            style={{
              // Naast de kolom waar hij bij hoort, aan de kant van de sphere --
              // dus naar binnen toe, nooit het beeld uit.
              ...(openRechts
                ? { right: 'calc(clamp(24px, 3.5vw, 64px) + 74px + 16px)' }
                : { left: 'calc(clamp(24px, 3.5vw, 64px) + 74px + 16px)' }),
              top: '40%',
              transform: 'translateY(-50%)',
            }}
          >
            <ManagerChat
              agent={open.agent}
              job={open.job}
              jobs={jobs.filter((j) => j.agent === open.agent.id)}
              server={server.agents[open.agent.id]}
              onMissie={(id, actie) => {
                void (actie === 'pause' ? pauseMission(id) : resumeMission(id)).then(verversServerAgents);
              }}
              onSluit={() => setGekozen(null)}
              onOpvolging={(tekst) => {
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
                const j = open.job;
                if (!j?.taskId || !j.approvalId) return;
                void decideDurableTaskApproval(j.taskId, j.approvalId, akkoord, akkoord ? 'Approved in Home window.' : 'Rejected in Home window.')
                  .then(() => useAxeJobStore.getState().patch(j.id, { state: akkoord ? 'running' : 'failed' }));
              }}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
