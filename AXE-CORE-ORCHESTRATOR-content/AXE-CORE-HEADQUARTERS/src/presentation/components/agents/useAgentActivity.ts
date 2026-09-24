/**
 * Houdt de Agents-tab bij: elke 15 seconden de rijen opnieuw, zolang het
 * venster zichtbaar is.
 *
 * Gepolld en niet via realtime: core_tasks staat niet in de
 * supabase_realtime-publicatie (zie MissionControlStrip.tsx — een
 * postgres_changes-abonnement daarop vuurt nooit en bleef de websocket
 * eindeloos opnieuw openen, 923 fouten per uur op 13 aug). De andere vier
 * tabellen evenmin. Een poll die we zelf zien slagen is eerlijker dan een
 * kanaal waarvan je niet weet of het leeft.
 *
 * `lastOkAt` is het moment van de laatste poll waarin minstens één bron
 * antwoordde — daar hangt de "live"-indicator aan, niet aan het feit dat de
 * interval loopt.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadAgentActivity, loadNamespaceCounts,
  type AgentActivitySnapshot, type NamespaceCount,
} from '@/infrastructure/persistence/agentActivityService';
import {
  memoryOwners, taskActivity, episodeActivity, runActivity, memoryActivity,
  type ActivityItem, type TaskRow,
} from '@/domain/agents/activity';

const POLL_MS = 15_000;
/** Tellingen per namespace veranderen traag en kosten 2 queries per namespace. */
const COUNTS_EVERY_TICKS = 8;

const NAMESPACES = [...new Set(memoryOwners().map(o => o.namespace))];

export interface AgentActivityState {
  snapshot: AgentActivitySnapshot | null;
  items: ActivityItem[];
  counts: Record<string, NamespaceCount>;
  lastOkAt: number | null;
  loading: boolean;
  /** Telt op bij elke geslaagde poll, zodat afhankelijke lezingen mee kunnen. */
  stamp: number;
}

function toItems(s: AgentActivitySnapshot): ActivityItem[] {
  // Een lopende taak kan buiten de 150 nieuwste vallen en toch nog lopen.
  const tasks = new Map<string, TaskRow>();
  for (const t of [...s.recentTasks, ...s.openTasks]) tasks.set(t.id, t);
  const out: ActivityItem[] = [];
  for (const t of tasks.values()) { const i = taskActivity(t); if (i) out.push(i); }
  for (const e of s.episodes) out.push(...episodeActivity(e));
  for (const r of s.runs) { const i = runActivity(r); if (i) out.push(i); }
  for (const m of s.memory) { const i = memoryActivity(m); if (i) out.push(i); }
  return out;
}

export function useAgentActivity(): AgentActivityState {
  const [snapshot, setSnapshot] = useState<AgentActivitySnapshot | null>(null);
  const [counts, setCounts] = useState<Record<string, NamespaceCount>>({});
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [stamp, setStamp] = useState(0);
  const busy = useRef(false);
  const ticks = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (busy.current || document.visibilityState === 'hidden') return;
      busy.current = true;
      try {
        const withCounts = ticks.current % COUNTS_EVERY_TICKS === 0;
        ticks.current += 1;
        const [snap, nsCounts] = await Promise.all([
          loadAgentActivity(NAMESPACES),
          withCounts ? loadNamespaceCounts(NAMESPACES) : Promise.resolve(null),
        ]);
        if (!alive) return;
        setSnapshot(snap);
        if (nsCounts) setCounts(nsCounts);
        if (snap.sourcesOk > 0) {
          setLastOkAt(Date.now());
          setStamp(n => n + 1);
        }
      } finally {
        busy.current = false;
        if (alive) setLoading(false);
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const items = useMemo(() => (snapshot ? toItems(snapshot) : []), [snapshot]);
  return { snapshot, items, counts, lastOkAt, loading, stamp };
}

/** Een klok voor relatieve tijden en de live-indicator; tikt los van de poll. */
export function useNow(everyMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(t);
  }, [everyMs]);
  return now;
}
