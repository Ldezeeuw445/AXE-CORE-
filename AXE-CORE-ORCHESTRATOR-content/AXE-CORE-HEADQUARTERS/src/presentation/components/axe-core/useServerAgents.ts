/**
 * De agentstatus zoals de server hem ziet, elke 15 s zolang het venster zichtbaar is.
 *
 * Eén gedeelde poll voor alle lezers (kolom + venster), zodat twee componenten
 * niet twee keer dezelfde vraag stellen. Lukt de vraag niet, dan blijft de
 * vorige stand staan met `ok: false` -- liever een oude echte stand dan een
 * verzonnen nieuwe, en de kolom valt dan terug op wat hij al deed.
 */
import { useEffect, useState } from 'react';
import { getAgentActivity } from '@/infrastructure/gateways/axeCoreApiService';
import type { ServerAgent } from '@/domain/agents/serverStatus';
import { meldActiviteit } from '@/shared/axeActiviteit';
import { activiteitUitServer } from '@/domain/agents/activiteitUitServer';

const POLL_MS = 15_000;

interface Stand { agents: Record<string, ServerAgent>; ok: boolean; at: number }

let stand: Stand = { agents: {}, ok: false, at: 0 };
const lezers = new Set<(s: Stand) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let bezig = false;

async function poll(): Promise<void> {
  if (bezig || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
  bezig = true;
  try {
    const uit = await getAgentActivity(10);
    const agents: Record<string, ServerAgent> = {};
    for (const a of uit.agents) agents[a.agent] = a;
    /* Wat er sinds de vorige poll echt gebeurde, als vlucht van de bol naar die
       agent (10 okt: "voorheen zag je particles met wat hij deed"). Niet bij de
       eerste poll: dan is alles "nieuw" en vliegt er een zwerm. */
    if (stand.ok) {
      for (const a of activiteitUitServer(stand.agents, agents)) meldActiviteit(a);
    }
    stand = { agents, ok: true, at: Date.now() };
  } catch {
    stand = { ...stand, ok: false };
  } finally {
    bezig = false;
    lezers.forEach((l) => l(stand));
  }
}

/** Ververs nu, bv. na pauzeren/hervatten. */
export function verversServerAgents(): void {
  void poll();
}

export function useServerAgents(): Stand {
  const [s, setS] = useState(stand);
  useEffect(() => {
    lezers.add(setS);
    if (!timer) {
      void poll();
      timer = setInterval(() => { void poll(); }, POLL_MS);
    }
    return () => {
      lezers.delete(setS);
      if (lezers.size === 0 && timer) { clearInterval(timer); timer = null; }
    };
  }, []);
  return s;
}
