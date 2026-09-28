/**
 * Hoe een jobstand eruitziet in de managerkolom en in zijn chatvenster.
 * Eigen bestand, want een component-bestand mag alleen componenten exporteren
 * (react-refresh), en deze tabel wordt op twee plekken gelezen.
 */
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

export const STAND: Record<AxeJob['state'], { label: string; kleur: string }> = {
  queued: { label: 'starting', kleur: 'var(--text-muted)' },
  running: { label: 'working', kleur: 'var(--accent-cyan)' },
  waiting: { label: 'needs your OK', kleur: 'var(--warn)' },
  done: { label: 'done', kleur: 'var(--ok)' },
  failed: { label: 'failed', kleur: 'var(--err)' },
};
