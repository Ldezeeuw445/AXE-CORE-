/**
 * De getallen op het statuswidget van de telefoon. Geen eigen bronnen: de
 * open taken komen uit dezelfde tabel en dezelfde vraag als de "open"-pil in
 * de chatkop (MissionControlStrip), de agents uit core_agents zoals de
 * agents-tab ze leest, en beide worden net als daar elke 30 s gepolld --
 * core_tasks zit niet in de realtime-publicatie.
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isOpenTask } from '@/domain/tasks/taskStatus';

export interface Tellers {
  openTaken: number | null;
  actieveAgents: number | null;
}

export function useTellers(): Tellers {
  const [t, setT] = useState<Tellers>({ openTaken: null, actieveAgents: null });
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let leeft = true;
    const haal = async () => {
      const [taken, agents] = await Promise.all([
        sb.from('core_tasks').select('id,status').limit(200),
        sb.from('core_agents').select('id,status').limit(200),
      ]);
      if (!leeft) return;
      const rijen = (taken.data ?? []) as Array<{ status?: unknown }>;
      const ag = (agents.data ?? []) as Array<{ status?: unknown }>;
      setT({
        openTaken: taken.error ? null : rijen.filter((r) => isOpenTask(r.status)).length,
        actieveAgents: agents.error ? null : ag.filter((a) => String(a.status ?? '') === 'active').length,
      });
    };
    void haal().catch(() => {});
    const i = window.setInterval(() => { void haal().catch(() => {}); }, 30_000);
    return () => { leeft = false; window.clearInterval(i); };
  }, []);
  return t;
}
