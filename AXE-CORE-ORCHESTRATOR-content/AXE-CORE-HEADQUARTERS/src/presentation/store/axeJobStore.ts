/**
 * De jobs van de tier-router. Los van voiceStatus: een lopende job mag de chat
 * niet op slot zetten.
 *
 * Sinds deze ronde overleven ze een herstart. Daarvoor was dit een kale store
 * en stonden de pollers in een module-lokale Set: herlaadde je tijdens een
 * lopende job, dan was de store leeg, startte er geen monitor, en draaide de
 * taak op de VPS door zonder enige weg terug naar de chat.
 *
 * Wat er bewaard wordt staat in `domain/tierRouter/jobHerstel.ts`. Monitors
 * start deze store met opzet NIET -- dat zou een kring met installTierRouter
 * maken; die roept `hervatJobMonitors()` aan zodra hij geïnstalleerd is.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jobLoopt, type AxeJob } from '@/domain/tierRouter/axeJobRegels';
import { bewaarbareJobs } from '@/domain/tierRouter/jobHerstel';
import { managerVan } from '@/domain/tierRouter/agentVenster';
import { meldActiviteit } from '@/shared/axeActiviteit';

interface AxeJobStateShape {
  jobs: AxeJob[];
  zet: (jobs: AxeJob[]) => void;
  voeg: (jobs: AxeJob[]) => void;
  patch: (id: string, over: Partial<AxeJob>) => void;
  leeg: () => void;
}

export const useAxeJobStore = create<AxeJobStateShape>()(
  persist(
    (set) => ({
      jobs: [],
      zet: (jobs) => set({ jobs }),
      voeg: (jobs) => {
        set((s) => ({ jobs: [...s.jobs, ...jobs] }));
        // Wat AXE een agent opdraagt, als vlucht naar die agent op Home (10 okt).
        for (const j of jobs.slice(0, 3)) {
          meldActiviteit({ doelen: [`agent:${j.agent}`, `agent:${managerVan(j.agent)}`, '/agents'], label: `→ ${j.agent}: ${j.title}`, kleur: 'rgba(165,243,252,0.7)' });
        }
      },
      patch: (id, over) => set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...over } : j)),
      })),
      leeg: () => set({ jobs: [] }),
    }),
    {
      name: 'axe_jobs_v1',
      version: 1,
      // Niet alles: `stappen` is een log dat per poll aangroeit en na een
      // herstart niets waard is -- de monitor haalt verse stappen meteen weer
      // op. Dat scheelt ruimte die het gesprek harder nodig heeft.
      partialize: (s) => ({ jobs: bewaarbareJobs(s.jobs, Date.now()) }),
    },
  ),
);

/** Eén definitie van "loopt nog" (axeJobRegels.jobLoopt) — niet een eigen
 *  conditie die uit de pas kan lopen met de gesproken samenvatting. */
export function lopendeJobs(jobs: AxeJob[]): AxeJob[] {
  return jobs.filter((j) => jobLoopt(j.state));
}

