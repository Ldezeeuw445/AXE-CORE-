/**
 * Eén leesbare rij voor Terrain- en Neural-hubdetail.
 *
 * De 3D-views toonden afgekapte labels (`AUDJPY — strategy scorec…`) of
 * verzonnen boomtakken. Het paneel heeft titel, type, datum, bron en
 * belang nodig — en die velden komen uit dezelfde stores die de pieken
 * al vullen, niet uit een tweede verhaal.
 */
import { MEMORY_HUBS, type HubId } from './memoryHubs';
import { hubForGlobalRow, hubForNotePath } from './hubClassifier';

export type MemorySourceKind = 'global' | 'rag' | 'obsidian' | 'core';

export interface HubMemoryRecord {
  id: string;
  hubId: HubId | 'core';
  title: string;
  type: string;
  date: string | null;
  source: string;
  sourceKind: MemorySourceKind;
  importance: number | null;
  detail: string;
  href: string;
  agentId?: string;
  agentAction?: 'wrote' | 'read';
}

export interface MemoryAgentEvent {
  id: string;
  agentId: string;
  agentName: string;
  action: 'wrote' | 'read';
  title: string;
  at: string | null;
  hubId?: HubId | 'core';
}

export interface GlobalRowInput {
  id?: string;
  category?: string | null;
  key?: string | null;
  value?: string | null;
  metadata?: { agentId?: string; [k: string]: unknown } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RagRowInput {
  id?: string;
  category?: string | null;
  content?: string | null;
  importance?: number | null;
  metadata?: { agentId?: string; [k: string]: unknown } | null;
  created_at?: string | null;
}

export interface NoteRowInput {
  path: string;
  title?: string | null;
  content?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CoreRowInput {
  id?: string;
  content?: string | null;
  source?: string | null;
  importance?: number | null;
  created_at?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  user_preference: 'Preference',
  conversation_context: 'Conversation',
  system_event: 'Event',
  agent_performance: 'Insight',
  provider_performance: 'Resource',
  specialist_match: 'Specialist',
  trading_memory: 'Trading',
  user: 'Knowledge',
  system: 'Knowledge',
  conversation: 'Conversation',
  tool: 'Resource',
  agent: 'Agent',
};

export function typeLabelFor(raw: string | null | undefined): string {
  if (!raw) return 'Memory';
  return TYPE_LABEL[raw] ?? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function agentDisplayName(agentId: string): string {
  if (!agentId) return 'Unknown agent';
  return agentId
    .replace(/^axe[_-]/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function valuePreview(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return clip(JSON.stringify(JSON.parse(value)), 220);
  } catch {
    return clip(String(value), 220);
  }
}

function recordsFromGlobal(rows: GlobalRowInput[]): HubMemoryRecord[] {
  return rows.map((row, i) => {
    const agentId = row.metadata?.agentId;
    const title = (row.key || '').trim() || typeLabelFor(row.category);
    return {
      id: `g-${row.id ?? `${row.category}-${i}`}`,
      hubId: hubForGlobalRow(row),
      title,
      type: typeLabelFor(row.category),
      date: row.updated_at || row.created_at || null,
      source: 'Global memory',
      sourceKind: 'global',
      importance: null,
      detail: valuePreview(row.value),
      href: '/memory/explore',
      agentId: agentId || undefined,
      agentAction: agentId ? 'wrote' : undefined,
    };
  });
}

function recordsFromRag(rows: RagRowInput[]): HubMemoryRecord[] {
  return rows.map((row, i) => {
    const agentId = row.metadata?.agentId;
    const content = (row.content || '').trim();
    return {
      id: `rag-${row.id ?? i}`,
      hubId: 'knowledge',
      title: clip(content, 72) || 'Knowledge',
      type: typeLabelFor(row.category),
      date: row.created_at || null,
      source: 'RAG',
      sourceKind: 'rag',
      importance: typeof row.importance === 'number' ? row.importance : null,
      detail: clip(content, 220),
      href: '/memory/explore',
      agentId: agentId || undefined,
      agentAction: agentId ? 'wrote' : undefined,
    };
  });
}

function recordsFromNotes(rows: NoteRowInput[]): HubMemoryRecord[] {
  return rows.map((note) => ({
    id: `note-${note.path}`,
    hubId: hubForNotePath(note.path),
    title: (note.title || note.path.split('/').pop() || 'Note').trim(),
    type: 'Note',
    date: note.updated_at || note.created_at || null,
    source: 'Obsidian',
    sourceKind: 'obsidian',
    importance: null,
    detail: clip((note.content || '').replace(/\s+/g, ' '), 220),
    href: `/obsidian?note=${encodeURIComponent(note.path)}`,
  }));
}

function recordsFromCore(rows: CoreRowInput[]): HubMemoryRecord[] {
  return rows.map((row, i) => ({
    id: `core-${row.id ?? i}`,
    hubId: 'core',
    title: clip(row.content || '', 72) || 'Core memory',
    type: 'Core',
    date: row.created_at || null,
    source: row.source || 'Core',
    sourceKind: 'core',
    importance: typeof row.importance === 'number' ? row.importance : null,
    detail: clip(row.content || '', 220),
    href: '/memory',
  }));
}

export function collectHubRecords(input: {
  global?: GlobalRowInput[];
  rag?: RagRowInput[];
  notes?: NoteRowInput[];
  core?: CoreRowInput[];
}): HubMemoryRecord[] {
  return [
    ...recordsFromGlobal(input.global ?? []),
    ...recordsFromRag(input.rag ?? []),
    ...recordsFromNotes(input.notes ?? []),
    ...recordsFromCore(input.core ?? []),
  ];
}

export function recordsForHub(records: HubMemoryRecord[], hubId: string | null | undefined): HubMemoryRecord[] {
  if (!hubId) return [];
  const bare = hubId.startsWith('hub-') ? hubId.slice(4) : hubId;
  return records.filter((r) => r.hubId === bare);
}

export function filterHubMemories(
  records: HubMemoryRecord[],
  query: string,
  typeFilter = 'all',
): HubMemoryRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter((r) => {
    if (typeFilter !== 'all' && r.type.toLowerCase() !== typeFilter.toLowerCase()) return false;
    if (!q) return true;
    return [r.title, r.detail, r.type, r.source, r.agentId ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

export function agentEventsFromRecords(records: HubMemoryRecord[], limit = 12): MemoryAgentEvent[] {
  return records
    .filter((r) => r.agentId)
    .map((r) => ({
      id: `act-${r.id}`,
      agentId: r.agentId as string,
      agentName: agentDisplayName(r.agentId as string),
      action: r.agentAction ?? 'wrote',
      title: r.title,
      at: r.date,
      hubId: r.hubId,
    }))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, limit);
}

export function episodeEvents(rows: Array<{
  id?: string;
  agent?: string | null;
  subject?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
}>): MemoryAgentEvent[] {
  return rows.map((row, i) => ({
    id: `ep-${row.id ?? i}`,
    agentId: row.agent || 'agent',
    agentName: agentDisplayName(row.agent || 'agent'),
    action: 'read' as const,
    title: (row.subject || '').trim() || 'Recalled memory',
    at: row.closed_at || row.opened_at || null,
  }));
}

export function mergeAgentEvents(...lists: MemoryAgentEvent[][]): MemoryAgentEvent[] {
  const seen = new Set<string>();
  const out: MemoryAgentEvent[] = [];
  for (const list of lists) {
    for (const ev of list) {
      const key = `${ev.agentId}:${ev.action}:${ev.title}:${ev.at ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
  }
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export function hubColor(hubId: string | null | undefined): string {
  const bare = (hubId ?? '').replace(/^hub-/, '') as HubId;
  return MEMORY_HUBS.find((h) => h.id === bare)?.css ?? '#67e8f9';
}
