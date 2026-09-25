/**
 * Kleine zwevende vensters rond de core: per hoofdagent die AXE aan het werk
 * zet, het gesprek tussen AXE en die agent in gewone taal. Klaar = vinkje, en
 * na een halve minuut schuift het weg. Klik = uitklappen.
 *
 * Zelfde materiaal als de rest (Kaart, matzwart, dunne rand). Alleen stijl en
 * indeling; de data komt uit useAxeJobStore, die de tier-router al bijhoudt.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Kaart } from '@/presentation/components/layout/tabMaatstaf';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { agentById } from '@/domain/agents/roster';
import { zichtbareVensters } from '@/domain/tierRouter/agentVenster';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

/** Vier plekken tegen de bol aan, links en rechts ervan. De bol staat in het
 *  midden op 40% van de hoogte (AxeCoreSphere: cy = h * 0.40) met een straal
 *  van ongeveer een derde van het vak; de vensters hangen net daarbuiten. */
const NAAST_BOL = 'calc(50% + min(34vh, 22vw))';
const PLEKKEN: Array<React.CSSProperties> = [
  { right: NAAST_BOL, top: '14%' },
  { left: NAAST_BOL, top: '14%' },
  { right: NAAST_BOL, top: '44%' },
  { left: NAAST_BOL, top: '44%' },
];

const STAND: Record<AxeJob['state'], { label: string; kleur: string }> = {
  queued: { label: 'starting', kleur: 'var(--text-muted)' },
  running: { label: 'working', kleur: 'var(--accent-cyan)' },
  waiting: { label: 'needs your OK', kleur: 'var(--warn)' },
  done: { label: 'done', kleur: 'var(--ok)' },
  failed: { label: 'failed', kleur: 'var(--err)' },
};

function Venster({ job }: { job: AxeJob }) {
  const [open, setOpen] = useState(false);
  const naam = agentById(job.agent).name;
  const stand = STAND[job.state];
  const stappen = job.stappen ?? [];
  const zichtbaar = open ? stappen : stappen.slice(-2);
  const klaar = job.state === 'done' || job.state === 'failed';

  return (
    <Kaart
      compact
      className="cursor-pointer"
      style={{ width: open ? 320 : 260, maxWidth: '40vw' }}
      titel={
        <span className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
          <span
            className="rounded-full flex-shrink-0"
            style={{ width: 6, height: 6, background: stand.kleur }}
          />
          {naam}
        </span>
      }
      actie={<span className="text-[10px] whitespace-nowrap flex-shrink-0" style={{ color: stand.kleur }}>{stand.label}</span>}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left space-y-1 text-[11px] leading-snug"
      >
        <p style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--accent-cyan)' }}>AXE</span> · {job.title}
        </p>
        {zichtbaar.map((regel, i) => (
          <p key={`${i}-${regel}`} style={{ color: 'var(--text-secondary)' }}>
            {regel}
          </p>
        ))}
        {klaar && job.summary && (
          <p
            style={{ color: 'var(--text-primary)' }}
            className={open ? undefined : 'line-clamp-3'}
          >
            {job.state === 'done' ? '✓ ' : ''}{job.summary}
          </p>
        )}
      </button>
    </Kaart>
  );
}

export function AgentVensters() {
  const jobs = useAxeJobStore((s) => s.jobs);
  // Eén tik per seconde zodat een klaar venster na de nagloei echt weggaat,
  // ook als er verder niets in de store verandert.
  const [nu, setNu] = useState(() => Date.now());
  const heeftKlare = jobs.some((j) => j.finishedAt != null);
  useEffect(() => {
    if (!heeftKlare) return;
    const t = setInterval(() => setNu(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [heeftKlare]);

  const vensters = zichtbareVensters(jobs, nu);

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-axe-agent-vensters>
      <AnimatePresence>
        {vensters.map((job, i) => (
          <motion.div
            key={job.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto absolute"
            style={PLEKKEN[i % PLEKKEN.length]}
          >
            <Venster job={job} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
