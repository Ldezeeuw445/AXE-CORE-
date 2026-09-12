/**
 * Het aantal duurzame herinneringen, voor de HUD-chip van de bol en het
 * statuswidget op de telefoon. Eén bron (loadMemoryGrowthStats, dezelfde als
 * de "nodes"-badge in de kopregel), elke 30 s opnieuw.
 */
import { useEffect, useState } from 'react';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';

/* 19 038, met een spatie als scheiding: zo staat het op de maquette en zo
   leest een teller in mono het rustigst. */
export function teller(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function useGeheugenTotaal(): number | null {
  const [totaal, setTotaal] = useState<number | null>(null);
  useEffect(() => {
    let leeft = true;
    const haal = () => {
      void loadMemoryGrowthStats()
        .then((s) => { if (leeft) setTotaal(s.total); })
        .catch(() => {});
    };
    haal();
    const t = window.setInterval(haal, 30_000);
    return () => { leeft = false; window.clearInterval(t); };
  }, []);
  return totaal;
}
