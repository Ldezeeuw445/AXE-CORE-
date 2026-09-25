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
 * Zwevende tekst heeft geen vlak om op te staan, en in de glasstand kijk je
 * door de plaat heen op je bureaublad. Met een lichte foto erachter viel
 * "DONE" in mintgroen en "NEEDS YOUR OK" in geel volledig weg — gemeten, niet
 * vermoed: zie de glas-screenshot van 25 sep.
 *
 * Een kader eronder zou dat oplossen, maar dat is precies wat hier niet mag.
 * Dus een schaduw op de letters zelf, zoals ondertiteling: het blijft tekst
 * zonder vlak, en hij houdt zijn contrast op elke grond.
 */
const LEESBAAR =
  '0 1px 2px rgba(0,0,0,.92), 0 0 5px rgba(0,0,0,.85), 0 0 14px rgba(0,0,0,.65)';

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
      className="flex items-start gap-2.5 text-left w-full bg-transparent border-0 p-0"
      style={{ opacity: stil ? 0.6 : 1, textShadow: LEESBAAR }}
    >
      <ManagerAvatar agent={agent} size={30} stil={stil} />
      <span className="min-w-0 flex-1 leading-snug">
        <span className="text-[11.5px] font-medium" style={{ color: agent.accent }}>
          {agent.name}
        </span>
        {stand && (
          <span
            className="text-[9px] tracking-wider uppercase ml-2 whitespace-nowrap"
            style={{ color: stand.kleur }}
          >
            {stand.label}
          </span>
        )}
        {regel && (
          <span
            className="block text-[11.5px] mt-0.5 line-clamp-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            {regel}
          </span>
        )}
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
      {/* Links, verticaal gecentreerd. Breedte in vw zodat de kolom op een
          smaller venster niet tegen de sphere aan loopt. */}
      <div
        className="pointer-events-auto absolute"
        style={{
          left: 'clamp(16px, 3vw, 44px)',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 'clamp(190px, 21vw, 290px)',
        }}
      >
        {/* Geen kaart en geen rand, maar wél donker materiaal. Dat is de regel
            van de glasstand: "alles wat erop staat houdt hetzelfde donkere
            materiaal en dezelfde lichte inkt als op zwart" (axe-look.css).
            Zonder dit viel de kolom volledig weg zodra er een lichte
            bureaubladfoto achter de plaat stond — gemeten, niet vermoed.

            Eigen laag en geen padding op de kolom, anders eet de vulling de
            breedte op en breken de namen af. Hij dooft naar alle kanten uit en
            loopt links het beeld uit, dus je ziet nergens een rand: het leest
            als schaduw, niet als vlak. */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: -96, right: -44, top: -30, bottom: -30,
            background:
              'radial-gradient(128% 76% at 18% 50%, rgba(6,7,13,.66), rgba(6,7,13,.3) 52%, transparent 76%)',
          }}
        />
        <div className="relative flex flex-col gap-3.5">
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
              left: 'clamp(216px, 25vw, 348px)',
              top: '50%',
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
