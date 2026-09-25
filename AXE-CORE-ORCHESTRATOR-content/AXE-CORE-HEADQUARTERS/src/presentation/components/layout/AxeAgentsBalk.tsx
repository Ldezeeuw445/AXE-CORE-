/**
 * Compacte balk boven de composer: hoeveel agents lopen, klik om uit te klappen.
 * Mat zwart, dunne lichte rand, niet uitgerekt — zelfde materiaal als de plaat.
 */
import { useState } from 'react';
import { useAxeJobStore, lopendeJobs } from '@/presentation/store/axeJobStore';
import { agentById } from '@/domain/agents/roster';
import { balkLabel } from '@/domain/tierRouter/axeJobRegels';

const STAND: Record<string, string> = {
  queued: 'queued',
  running: 'running',
  waiting: 'needs your OK',
  done: 'done',
  failed: 'failed',
};

export function AxeAgentsBalk() {
  const jobs = useAxeJobStore((s) => s.jobs);
  const [open, setOpen] = useState(false);
  const lopend = lopendeJobs(jobs);
  if (jobs.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-2 pb-1">
      <div
        className="w-fit max-w-full"
        style={{
          background: 'var(--surface-bg, #0a0c0c)',
          border: '1px solid var(--tint-line)',
          borderRadius: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1 text-left"
          title="Background agents"
          aria-expanded={open}
          data-axe-agents-balk
        >
          <span
            className="rounded-full flex-shrink-0"
            style={{
              width: 6,
              height: 6,
              background: lopend.length ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}
          />
          <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
            {balkLabel(lopend.length)}
          </span>
        </button>
        {open && (
          <ul className="px-2.5 pb-1.5 space-y-0.5" style={{ borderTop: '1px solid var(--tint-line)' }}>
            {jobs.slice(-8).map((j) => (
              <li key={j.id} className="flex items-baseline gap-2 text-[10px] leading-tight py-0.5">
                <span style={{ color: 'var(--text-primary)' }}>{j.title}</span>
                <span style={{ color: 'var(--accent-cyan)' }}>{agentById(j.agent).name}</span>
                <span style={{ color: 'var(--text-muted)' }}>{STAND[j.state] ?? j.state}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
