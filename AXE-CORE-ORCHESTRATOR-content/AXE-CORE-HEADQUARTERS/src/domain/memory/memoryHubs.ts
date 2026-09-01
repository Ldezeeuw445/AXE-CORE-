/**
 * The memory hubs — one definition, shared by every view.
 *
 * Neural and Terrain used to disagree about what a hub even was. Neural drew
 * these eight concepts; Terrain built its peaks from `global_memory`'s
 * category column instead, so it showed a different number of hubs with
 * different names, and "Specialists" existed on one side of the app but not
 * the other. Two lenses on the same memory have to agree on what they are
 * lensing, or comparing them tells you nothing.
 *
 * The taxonomy is deliberately conceptual rather than a mirror of the storage
 * schema: `agent_performance` and `specialist_match` are storage details, but
 * "Insights" is a thing Luka can reason about. `useGlobalMemoryStats` owns the
 * mapping from stored rows to these hubs; this module owns their identity.
 */

export type HubId =
  | 'knowledge' | 'conversations' | 'tasksgoals' | 'projects'
  | 'insights' | 'resources' | 'preferences' | 'events' | 'agents'
  | 'trading';

export interface MemoryHubDef {
  id: HubId;
  /** Display name. Kept identical across views so labels never drift. */
  name: string;
  /** Hex, as a number for three.js and as a string for the DOM. */
  color: number;
  css: string;
  desc: string;
}

export const MEMORY_HUBS: readonly MemoryHubDef[] = [
  {
    id: 'knowledge', name: 'Knowledge', color: 0x3b82f6, css: '#3b82f6',
    desc: 'Alles wat AXE geleerd heeft over markten, systemen en strategie.',
  },
  {
    id: 'conversations', name: 'Conversations', color: 0xa855f7, css: '#a855f7',
    desc: 'Elk strategiegesprek, debat en dagelijkse check-in met AXE.',
  },
  {
    id: 'tasksgoals', name: 'Tasks & Goals', color: 0x14b8a6, css: '#14b8a6',
    desc: 'Waar je naartoe werkt, en wat er nu op de planning staat.',
  },
  {
    id: 'projects', name: 'Projects', color: 0x22c55e, css: '#22c55e',
    desc: 'AXE Companion, TradingOS en het ecosysteem dat ze verbindt.',
  },
  {
    id: 'insights', name: 'Insights', color: 0x38bdf8, css: '#38bdf8',
    desc: 'Patronen die AXE opmerkt in jouw gebruikers en jouw werk.',
  },
  {
    id: 'resources', name: 'Resources', color: 0xf59e0b, css: '#f59e0b',
    desc: 'Docs, assets en data feeds — alles waar AXE bij kan.',
  },
  {
    id: 'preferences', name: 'Preferences', color: 0xeab308, css: '#eab308',
    desc: 'Hoe jij wilt dat AXE werkt, praat en zich gedraagt.',
  },
  {
    id: 'events', name: 'Events', color: 0xec4899, css: '#ec4899',
    desc: 'Launches, outages, milestones — de momenten die telden.',
  },
  {
    id: 'trading', name: 'Trading', color: 0x22d3ee, css: '#22d3ee',
    // Split out of Events on 1-9-2026. Every `ta:` row -- the trading agent's
    // decisions, cycles, lessons, intel and mistakes -- is stored with
    // category `system_event`, so it all landed on the Events peak. That is
    // 95% of global_memory: the biggest mountain on the terrain was the
    // trading agent wearing a label that means "launches and outages".
    //
    // Same finding as the Trading tab in Memory, and the two now agree.
    desc: 'De trading-agent: wat het zag, koos, verloor en onthield.',
  },
  {
    id: 'agents', name: 'Agents', color: 0x64748b, css: '#64748b',
    desc: 'Wat elke agent zelf heeft gedaan en onthouden — per agent apart, niet op één hoop.',
  },
] as const;

export const HUB_BY_ID: Record<HubId, MemoryHubDef> = Object.fromEntries(
  MEMORY_HUBS.map(h => [h.id, h]),
) as Record<HubId, MemoryHubDef>;
