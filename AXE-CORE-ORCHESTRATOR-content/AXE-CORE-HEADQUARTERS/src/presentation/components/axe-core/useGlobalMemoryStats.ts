/**
 * useGlobalMemoryStats — real numbers for the Neural view's side panels.
 *
 * `NeuralMemorySystem` already has a hook over these same sources, but it is
 * welded to that component's 3D layout (it returns hubs pre-positioned by
 * `placeHubsOnBrain`). NeuralBrain places its own hubs, so rather than refactor
 * a working component to share it, this covers only what the panels need:
 * per-hub totals, headline stats, and the live activity feed.
 *
 * The hub ids match NeuralBrain's eight fixed hubs. Each one is mapped to an
 * actual store — nothing here is synthesised. Where a store is empty the hub
 * reports zero rather than a placeholder, because a fabricated count in a panel
 * labelled "Total Memories" is worse than an honest nought.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadGlobalMemories, type GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { axeBus, subscribeAxeEvent } from '@/infrastructure/events/eventBus';

export type HubId =
  | 'knowledge' | 'conversations' | 'tasksgoals' | 'projects'
  | 'insights' | 'resources' | 'preferences' | 'events';

export interface StreamEntry {
  id: string;
  ts: number;
  color: number;
  title: string;
  subtitle: string;
}

export interface GlobalMemoryStats {
  hubCounts: Record<HubId, number>;
  total: number;
  connections: number;
  lastUpdatedAt: string | null;
  /** null when nothing loaded — the stores cannot tell empty from unreachable. */
  integrityPct: number | null;
  stream: StreamEntry[];
  loading: boolean;
}

const EMPTY_COUNTS: Record<HubId, number> = {
  knowledge: 0, conversations: 0, tasksgoals: 0, projects: 0,
  insights: 0, resources: 0, preferences: 0, events: 0,
};

/** Which Obsidian folder feeds which hub; anything else counts as a resource. */
function folderHub(path: string): HubId {
  const top = path.split('/')[0]?.toLowerCase() ?? '';
  if (top === 'projects') return 'projects';
  if (top === 'tasks' || top === 'goals') return 'tasksgoals';
  return 'resources';
}

export function timeAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function useGlobalMemoryStats(): GlobalMemoryStats {
  const [hubCounts, setHubCounts] = useState<Record<HubId, number>>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [connections, setConnections] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [integrityPct, setIntegrityPct] = useState<number | null>(null);
  const [stream, setStream] = useState<StreamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());

  const pushStream = useCallback((item: StreamEntry) => {
    if (seen.current.has(item.id)) return;
    seen.current.add(item.id);
    setStream(prev => [item, ...prev].sort((a, b) => b.ts - a.ts).slice(0, 24));
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const [remoteGlobals, notes, rag, growth] = await Promise.all([
        loadGlobalMemories(AXE_USER_ID, undefined, 500).catch(() => [] as GlobalMemoryEntry[]),
        listRecentObsidianNotes(200).catch(() => [] as ObsidianNote[]),
        loadRagMemories(undefined, 1, 300).catch(() => [] as RagMemory[]),
        loadMemoryGrowthStats().catch(() => null),
      ]);
      if (!alive) return;

      // global_memory now writes and reads through server-side (axe_api
      // /memory/upsert + GET /memory) — an empty result here is a real empty
      // store, not a sign the write path failed, so no localStorage fallback
      // for a successful-but-empty response (loadGlobalMemories still falls
      // back to its cache on genuine fetch *error*).
      const globals = remoteGlobals;

      const counts: Record<HubId, number> = { ...EMPTY_COUNTS };
      counts.knowledge = rag.length;
      for (const g of globals) {
        if (g.category === 'conversation_context') counts.conversations++;
        else if (g.category === 'user_preference') counts.preferences++;
        else if (g.category === 'system_event') counts.events++;
        else counts.insights++; // agent/provider performance + specialist match
      }
      for (const n of notes) counts[folderHub(n.path)]++;

      setHubCounts(counts);
      setTotal(globals.length + rag.length + notes.length);
      // Wikilinks are the only genuine edges we hold; counting anything else
      // would just be a number that moves.
      setConnections(notes.reduce((n, note) => n + (note.wikilinks?.length ?? 0), 0));
      // The persistence services swallow their own errors and return an empty
      // array, so a failed fetch is indistinguishable from an empty store —
      // the earlier attempt at flags reported a confident 100% while every
      // call was 401ing. Report the share of stores that actually returned
      // something, and nothing at all when none did, rather than inventing
      // reassurance.
      const reached = (globals.length ? 1 : 0) + (notes.length ? 1 : 0) + (rag.length ? 1 : 0);
      setIntegrityPct(reached === 0 ? null : Math.round((reached / 3) * 100));

      if (growth?.lastManagerAt) {
        setLastUpdatedAt(growth.lastManagerAt);
      } else {
        setLastUpdatedAt(notes.reduce<string | null>((acc, n) => {
          const at = n.updated_at || n.created_at;
          if (!at) return acc;
          return !acc || at > acc ? at : acc;
        }, null));
      }

      if (growth?.lastManagerMessage) {
        pushStream({
          id: `manager-${growth.lastManagerAt || 'run'}`,
          ts: growth.lastManagerAt ? new Date(growth.lastManagerAt).getTime() : Date.now(),
          color: 0xc9a23a,
          title: 'Memory manager ran',
          subtitle: growth.lastManagerMessage,
        });
      }
      setLoading(false);
    };

    void load();
    const t = window.setInterval(() => void load(), 45_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [pushStream]);

  // The stream is the app's own event bus, seeded with history so the panel is
  // populated on first paint rather than empty until something happens.
  useEffect(() => {
    const labelFor = (name: string, payload: unknown): Omit<StreamEntry, 'id' | 'ts'> | null => {
      switch (name) {
        case 'axe:chat-message': {
          const p = payload as { role: string; preview: string };
          return { color: 0xa855f7, title: p.role === 'user' ? 'New message' : 'AXE replied', subtitle: p.preview };
        }
        case 'axe:memory-changed': {
          const p = payload as { kind?: string };
          return { color: 0x2fb8b0, title: 'Memory updated', subtitle: p.kind ? `${p.kind} store changed` : 'Store changed' };
        }
        case 'axe:files-attached': {
          const p = payload as { names: string[]; count: number };
          return { color: 0x5c8fc2, title: 'Files attached', subtitle: p.names.slice(0, 2).join(', ') || `${p.count} file(s)` };
        }
        case 'axe:crew-status': {
          const p = payload as { status: string; task?: string };
          return { color: 0x4caf7d, title: `Crew ${p.status}`, subtitle: p.task || 'background task' };
        }
        case 'axe:health-ping': {
          const p = payload as { service: string; ok: boolean };
          return { color: 0xec4899, title: p.ok ? `${p.service} healthy` : `${p.service} issue`, subtitle: p.ok ? 'health check passed' : 'health check failed' };
        }
        default:
          return null;
      }
    };

    for (const evt of axeBus.getHistory()) {
      const info = labelFor(evt.name, evt.payload);
      if (info) pushStream({ id: `${evt.name}-${evt.ts}`, ts: evt.ts, ...info });
    }

    const names: Array<keyof import('@/domain/events/axeEvents').AxeEventMap> = [
      'axe:chat-message', 'axe:memory-changed', 'axe:files-attached', 'axe:crew-status', 'axe:health-ping',
    ];
    const unsubs = names.map(name => subscribeAxeEvent(name, (payload) => {
      const info = labelFor(name, payload);
      if (!info) return;
      pushStream({ id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...info });
    }));
    return () => unsubs.forEach(u => u());
  }, [pushStream]);

  return { hubCounts, total, connections, lastUpdatedAt, integrityPct, stream, loading };
}
