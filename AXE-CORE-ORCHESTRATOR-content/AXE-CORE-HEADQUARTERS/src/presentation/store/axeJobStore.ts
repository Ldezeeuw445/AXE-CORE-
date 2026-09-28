/**
 * Sessie-jobs van de tier-router. Los van voiceStatus: een lopende job
 * mag de chat niet op slot zetten.
 */
import { create } from 'zustand';
import { jobLoopt, type AxeJob } from '@/domain/tierRouter/axeJobRegels';

interface AxeJobStateShape {
  jobs: AxeJob[];
  zet: (jobs: AxeJob[]) => void;
  voeg: (jobs: AxeJob[]) => void;
  patch: (id: string, over: Partial<AxeJob>) => void;
  leeg: () => void;
}

export const useAxeJobStore = create<AxeJobStateShape>((set) => ({
  jobs: [],
  zet: (jobs) => set({ jobs }),
  voeg: (jobs) => set((s) => ({ jobs: [...s.jobs, ...jobs] })),
  patch: (id, over) => set((s) => ({
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...over } : j)),
  })),
  leeg: () => set({ jobs: [] }),
}));

/** Eén definitie van "loopt nog" (axeJobRegels.jobLoopt) — niet een eigen
 *  conditie die uit de pas kan lopen met de gesproken samenvatting. */
export function lopendeJobs(jobs: AxeJob[]): AxeJob[] {
  return jobs.filter((j) => jobLoopt(j.state));
}

