/**
 * Het kleine chatvenster van één manager. Luka, 25 sep: "een klein chatvenster
 * waardoor ik in normale taal zie wie en wat axe aanstuurt."
 *
 * Eén zin bovenaan die zegt wie waarvoor is aangestuurd, daaronder de opdracht
 * van AXE — die staat vast, want juist die mag niet wegscrollen — en daaronder
 * wat de manager terugzei.
 *
 * Dit is wél een kaart, anders dan de zwevende regels in de kolom: een venster
 * dat je moet kunnen lezen heeft een rug nodig.
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Kaart } from '@/presentation/components/layout/tabMaatstaf';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { stappenUit } from '@/domain/tierRouter/agentVenster';
import type { AxeAgent } from '@/domain/agents/roster';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import { STAND } from '@/presentation/components/axe-core/managerStand';

/** Eén zin: wie heeft AXE waarvoor aangestuurd, en hoe staat het ervoor. */
function wieEnWat(agent: AxeAgent, job: AxeJob | null): string {
  if (!job) return `AXE has nothing running with ${agent.name} right now.`;
  switch (job.state) {
    case 'queued': return `AXE just handed this to ${agent.name}. It is spinning up.`;
    case 'running': return `AXE handed this to ${agent.name}. It is working on it now.`;
    case 'waiting': return `${agent.name} is waiting on you before it goes any further.`;
    case 'failed': return `${agent.name} ran into something and stopped.`;
    default: return `${agent.name} is finished.`;
  }
}

export function ManagerChat({
  agent,
  job,
  onSluit,
}: {
  agent: AxeAgent;
  job: AxeJob | null;
  onSluit: () => void;
}) {
  const sluitRef = useRef<HTMLButtonElement>(null);
  const draadRef = useRef<HTMLDivElement>(null);

  useEffect(() => { sluitRef.current?.focus(); }, [agent.id]);

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit(); };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, [onSluit]);

  // Nieuwe regels komen onderaan binnen; daar wil je ook kijken.
  const antwoorden = job ? stappenUit(job.stappen ?? [], 8) : [];
  useEffect(() => {
    const el = draadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [antwoorden.length, job?.summary]);

  const stand = job ? STAND[job.state] : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-auto"
      role="dialog"
      aria-modal="false"
      aria-label={`Gesprek met ${agent.name}`}
    >
      <Kaart
        compact
        style={{ width: 330, maxWidth: '86vw', display: 'flex', flexDirection: 'column' }}
        titel={
          <span className="flex items-center gap-2 min-w-0">
            <ManagerAvatar agent={agent} size={22} />
            <span className="truncate">{agent.name}</span>
          </span>
        }
        actie={
          <span className="flex items-center gap-2 flex-shrink-0">
            {stand && (
              <span className="text-[10px] whitespace-nowrap" style={{ color: stand.kleur }}>
                {stand.label}
              </span>
            )}
            <button
              ref={sluitRef}
              type="button"
              onClick={onSluit}
              aria-label="Sluiten"
              className="w-5 h-5 grid place-items-center rounded text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              ×
            </button>
          </span>
        }
      >
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
          {wieEnWat(agent, job)}
        </p>

        {job && (
          <p
            className="text-[11.5px] leading-snug pb-2 mb-2"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--axe-kaart-lijn)' }}
          >
            <span className="text-[9px] tracking-widest uppercase block mb-0.5" style={{ color: 'var(--accent-cyan)' }}>
              AXE asked
            </span>
            {job.title}
          </p>
        )}

        <div
          ref={draadRef}
          className="flex flex-col gap-1.5 text-[11.5px] leading-snug overflow-y-auto"
          style={{ maxHeight: 190 }}
        >
          {antwoorden.map((regel, i) => (
            <p key={`${i}-${regel}`} style={{ color: 'var(--text-secondary)' }}>
              {regel}
            </p>
          ))}
          {job?.summary && (
            <p style={{ color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--ok)' }}>✓ </span>{job.summary}
            </p>
          )}
          {!job && (
            <p style={{ color: 'var(--text-muted)' }}>
              Ask AXE something in this manager&apos;s corner and it will hand it over.
            </p>
          )}
          {job && antwoorden.length === 0 && !job.summary && (
            <p style={{ color: 'var(--text-muted)' }}>Picking it up…</p>
          )}
        </div>
      </Kaart>
    </motion.div>
  );
}
