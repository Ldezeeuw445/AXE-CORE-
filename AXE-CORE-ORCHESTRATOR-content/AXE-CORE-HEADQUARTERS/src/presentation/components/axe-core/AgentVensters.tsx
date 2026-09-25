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
import { useEffect, useState } from 'react';
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

/**
 * Eén manager: driehoekje, zijn naam eronder, en daar weer onder wat hij nu
 * doet. Alles onder elkaar en gecentreerd, zoals Luka het tekende.
 */
function Rij({ rij, open, onKies }: { rij: ManagerRij; open: boolean; onKies: () => void }) {
  const { agent, job, regel } = rij;
  const stand = job ? STAND[job.state] : null;
  const stil = job == null;

  return (
    <button
      type="button"
      onClick={onKies}
      aria-expanded={open}
      aria-label={`Gesprek met ${agent.name}`}
      className="flex flex-col items-center gap-1 w-full bg-transparent border-0 p-0 text-center"
      style={{ opacity: stil ? 0.55 : 1, textShadow: LEESBAAR }}
    >
      <ManagerAvatar agent={agent} size={34} stil={stil} />

      {/* De korte naam, niet de volle: "NORTHSEA DESK MANAGER" breekt in een
          smalle kolom over drie regels en dan staat de rail scheef. */}
      <span
        className="text-[9.5px] tracking-[0.13em] uppercase leading-none"
        style={{ color: agent.accent }}
      >
        {agent.kort ?? agent.name}
      </span>

      {stand && (
        <span
          className="text-[8.5px] tracking-[0.1em] uppercase leading-none"
          style={{ color: stand.kleur }}
        >
          {stand.label}
        </span>
      )}

      {regel && (
        <span
          className="w-full text-[11px] leading-snug line-clamp-2 break-words"
          style={{ color: 'var(--text-secondary)' }}
        >
          {regel}
        </span>
      )}
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
        className="pointer-events-auto absolute"
        style={{
          left: 'clamp(36px, 6vw, 96px)',
          top: '40%',
          transform: 'translateY(-50%)',
          width: 'clamp(150px, 15vw, 196px)',
        }}
      >
        <div className="flex flex-col gap-5">
          {rijen.map((rij) => (
            <Rij
              key={rij.agent.id}
              rij={rij}
              open={gekozen === rij.agent.id}
              onKies={() => setGekozen((v) => (v === rij.agent.id ? null : rij.agent.id))}
            />
          ))}
        </div>
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
              left: 'calc(clamp(36px, 6vw, 96px) + clamp(150px, 15vw, 196px) + 18px)',
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
