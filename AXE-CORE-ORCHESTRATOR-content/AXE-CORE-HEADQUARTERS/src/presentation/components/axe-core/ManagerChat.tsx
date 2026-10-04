/**
 * Het kleine chatvenster van één manager. Luka, 25 sep: "een klein chatvenster
 * waardoor ik in normale taal zie wie en wat axe aanstuurt."
 *
 * Live draad: opdracht, goedkeuring, opvolging. De Home-kolom (tegels, balkjes,
 * plek) blijft ongemoeid — dit zit in het bestaande kaartvenster.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Kaart } from '@/presentation/components/layout/tabMaatstaf';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { draadVoorAgent, type DraadBericht } from '@/domain/tierRouter/agentDraad';
import type { AxeAgent } from '@/domain/agents/roster';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';
import { STAND } from '@/presentation/components/axe-core/managerStand';

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

function kleurVan(b: DraadBericht): string {
  if (b.soort === 'approval') return 'var(--warning)';
  if (b.soort === 'result') return 'var(--text-primary)';
  if (b.rol === 'axe' || b.rol === 'luka') return 'var(--text-primary)';
  return 'var(--text-secondary)';
}

function etiket(b: DraadBericht): string {
  if (b.soort === 'instruction') return 'AXE asked';
  if (b.soort === 'followup') return 'Follow-up';
  if (b.soort === 'approval') return 'Needs you';
  if (b.soort === 'result') return 'Result';
  return 'Agent';
}

export function ManagerChat({
  agent,
  job,
  jobs = [],
  onSluit,
  onOpvolging,
  onGoedkeuring,
}: {
  agent: AxeAgent;
  job: AxeJob | null;
  jobs?: AxeJob[];
  onSluit: () => void;
  onOpvolging?: (tekst: string) => void;
  onGoedkeuring?: (akkoord: boolean) => void;
}) {
  const sluitRef = useRef<HTMLButtonElement>(null);
  const draadRef = useRef<HTMLDivElement>(null);
  const [opvolging, setOpvolging] = useState('');

  useEffect(() => { sluitRef.current?.focus(); }, [agent.id]);

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit(); };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, [onSluit]);

  const berichten = jobs.length ? draadVoorAgent(jobs, agent.id) : (job ? draadVoorAgent([job], agent.id) : []);
  useEffect(() => {
    const el = draadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [berichten.length, job?.summary, job?.approvalVraag]);

  const stand = job ? STAND[job.state] : null;
  const wacht = job?.state === 'waiting' && !!job.approvalId;

  const stuur = () => {
    const t = opvolging.trim();
    if (!t || !onOpvolging) return;
    onOpvolging(t);
    setOpvolging('');
  };

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

        <div
          ref={draadRef}
          className="flex flex-col gap-1.5 text-[11.5px] leading-snug overflow-y-auto"
          style={{ maxHeight: 190 }}
          data-axe-agent-draad
        >
          {berichten.map((b, i) => (
            <p key={`${i}-${b.soort}-${b.tekst.slice(0, 24)}`} style={{ color: kleurVan(b) }}>
              <span className="text-[9px] tracking-widest uppercase block mb-0.5" style={{ color: 'var(--accent-cyan)' }}>
                {etiket(b)}
              </span>
              {b.soort === 'result' ? <span style={{ color: 'var(--ok)' }}>✓ </span> : null}
              {b.tekst}
            </p>
          ))}
          {!job && berichten.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              Ask AXE something in this manager&apos;s corner and it will hand it over.
            </p>
          )}
          {job && berichten.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>Picking it up…</p>
          )}
        </div>

        {wacht && onGoedkeuring && (
          <div className="flex gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => onGoedkeuring(true)}
              className="text-[10px] px-2 py-1 rounded-lg"
              style={{ background: 'var(--tint)', color: 'var(--ok)' }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onGoedkeuring(false)}
              className="text-[10px] px-2 py-1 rounded-lg"
              style={{ background: 'var(--tint-line)', color: 'var(--text-secondary)' }}
            >
              Reject
            </button>
          </div>
        )}

        <div className="mt-2 flex gap-1.5">
          <input
            value={opvolging}
            onChange={(e) => setOpvolging(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') stuur(); }}
            placeholder="Follow-up…"
            aria-label="Follow-up"
            className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded-lg outline-none"
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--axe-kaart-lijn)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            onClick={stuur}
            disabled={!opvolging.trim()}
            className="text-[10px] px-2 py-1 rounded-lg"
            style={{ background: 'var(--tint)', color: 'var(--accent-cyan)' }}
          >
            Send
          </button>
        </div>
      </Kaart>
    </motion.div>
  );
}
