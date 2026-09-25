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
import { managerRijen } from '@/domain/tierRouter/agentVenster';
import type { ManagerRij } from '@/domain/tierRouter/agentVenster';
import type { AxeAgentId } from '@/domain/agents/roster';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { ManagerChat } from '@/presentation/components/axe-core/ManagerChat';
import { STAND } from '@/presentation/components/axe-core/managerStand';

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

function Balkje({ rij, onKies }: { rij: ManagerRij; onKies: () => void }) {
  const { agent, job, regel } = rij;

  /* Stilstaand: geen balkje, alleen het woord. Zo blijft de rij op zijn plek
     en zie je in één blik wie er niets doet, zonder iets te dempen. */
  if (!job) {
    return (
      <span
        className="text-[9.5px] tracking-[0.1em] uppercase"
        style={{ color: 'var(--text-muted)', textShadow: LEESBAAR }}
      >
        idle
      </span>
    );
  }

  const stand = STAND[job.state];
  return (
    <button
      type="button"
      onClick={onKies}
      aria-label={`Gesprek met ${agent.name}`}
      className="flex items-center gap-3 w-full text-left cursor-pointer min-w-0"
      style={BALK}
    >
      <span className="flex-1 min-w-0 text-[12.5px] leading-snug line-clamp-2">
        <span style={{ color: agent.accent, fontWeight: 500 }}>{agent.kort ?? agent.name}</span>
        {' '}
        <span style={{ color: 'var(--text-secondary)' }}>{regel}</span>
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

  const rijen = managerRijen(jobs, nu);
  const open = gekozen ? rijen.find((r) => r.agent.id === gekozen) ?? null : null;

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
        {rijen.map((rij) => {
          const kies = () => setGekozen((v) => (v === rij.agent.id ? null : rij.agent.id));
          return (
            <Fragment key={rij.agent.id}>
              <Tegel rij={rij} open={gekozen === rij.agent.id} onKies={kies} />
              <Balkje rij={rij} onKies={kies} />
            </Fragment>
          );
        })}
      </div>

      {/* Het venster komt rechts van de kolom te staan, niet eroverheen. */}
      <AnimatePresence>
        {open && (
          <div
            key={open.agent.id}
            className="pointer-events-none absolute"
            style={{
              // Net rechts van de kolom (links + breedte + lucht), en op
              // dezelfde hoogte als de kolom en de sphere.
              left: 'calc(clamp(24px, 3.5vw, 64px) + 74px + 16px)',
              top: '40%',
              transform: 'translateY(-50%)',
            }}
          >
            <ManagerChat agent={open.agent} job={open.job} onSluit={() => setGekozen(null)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
