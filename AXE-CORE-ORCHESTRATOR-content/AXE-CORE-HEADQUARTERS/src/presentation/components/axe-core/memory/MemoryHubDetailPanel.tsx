import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { MEMORY_HUBS } from '@/domain/memory/memoryHubs';
import {
  filterHubMemories,
  recordsForHub,
  sampleHubRecords,
  uniqueHubRecords,
  type HubMemoryRecord,
  type MemoryAgentEvent,
} from '@/domain/memory/hubMemoryRecord';
import './MemoryHubDetailPanel.css';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MemoryHubDetailPanel({
  hubId,
  hubLabel,
  hubColor,
  memoryCount,
  records,
  onClose,
  onOpen,
}: {
  hubId: string;
  hubLabel: string;
  hubColor: string;
  memoryCount: number;
  records: HubMemoryRecord[];
  onClose: () => void;
  onOpen: (record: HubMemoryRecord) => void;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const members = useMemo(() => recordsForHub(records, hubId), [records, hubId]);
  const unique = useMemo(() => uniqueHubRecords(members), [members]);
  const sampled = useMemo(() => sampleHubRecords(members), [members]);
  const types = useMemo(
    () => ['all', ...Array.from(new Set(sampled.map((m) => m.type))).sort()],
    [sampled],
  );
  const visible = useMemo(() => filterHubMemories(sampled, query, type), [sampled, query, type]);
  const selected = visible.find((m) => m.id === openId) ?? null;

  return (
    <section
      className="axe-hubdetail"
      data-scene-reserve="hub-detail"
      data-testid="memory-hub-detail"
      style={{ ['--hub-accent' as string]: hubColor }}
    >
      <header className="axe-hubdetail-head">
        <div>
          <div className="axe-hubdetail-crumb">AXE Core / {hubLabel}</div>
          <h3 style={{ color: hubColor }}>{hubLabel}</h3>
          <div className="axe-hubdetail-count">
            {memoryCount.toLocaleString()} memories · {unique.length.toLocaleString()} unique · {visible.length} shown
          </div>
        </div>
        <button type="button" className="axe-hubdetail-close" onClick={onClose} aria-label="Close hub">
          <X size={14} />
        </button>
      </header>
      <div className="axe-hubdetail-tools">
        <input
          data-testid="memory-hub-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search in ${hubLabel}…`}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter type">
          {types.map((t) => (
            <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>
          ))}
        </select>
      </div>
      <div className="axe-hubdetail-list" role="list">
        {visible.length === 0 && (
          <div className="axe-hubdetail-empty">
            {members.length === 0
              ? 'No sampled memories in this hub yet.'
              : 'Nothing matches that search.'}
          </div>
        )}
        {visible.map((row) => (
          <button
            type="button"
            key={row.id}
            className={`axe-hubdetail-row${openId === row.id ? ' is-on' : ''}`}
            role="listitem"
            title={row.title}
            onClick={() => setOpenId(row.id === openId ? null : row.id)}
          >
            <span className="axe-hubdetail-title">{row.title}</span>
            <span className="axe-hubdetail-meta">{row.type}</span>
            <span className="axe-hubdetail-meta">{fmtDate(row.date)}</span>
            <span className="axe-hubdetail-meta">{row.source}</span>
            <span className="axe-hubdetail-meta">{row.importance ?? '—'}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="axe-hubdetail-peek">
          <p>{selected.detail || 'No detail stored for this memory.'}</p>
          <button type="button" className="axe-hubdetail-open" onClick={() => onOpen(selected)}>
            Open full view
          </button>
        </div>
      )}
    </section>
  );
}

export function MemoryTypeLegend({
  counts,
}: {
  counts: Partial<Record<string, number>>;
}) {
  const rows = MEMORY_HUBS
    .map((h) => ({ ...h, n: counts[h.id] ?? 0 }))
    .filter((h) => h.n > 0)
    .sort((a, b) => b.n - a.n);
  if (rows.length === 0) return null;
  return (
    <aside className="axe-memory-legend" data-scene-reserve="legend" data-testid="memory-type-legend">
      <h4>Memory types</h4>
      {rows.map((h) => (
        <div className="axe-memory-legend-row" key={h.id}>
          <span className="axe-memory-legend-swatch" style={{ background: h.css, color: h.css }} />
          <span>{h.name}</span>
          <span className="axe-memory-legend-n">{h.n.toLocaleString()}</span>
        </div>
      ))}
    </aside>
  );
}

export function MemoryAgentActivity({
  events,
}: {
  events: MemoryAgentEvent[];
}) {
  if (events.length === 0) return null;
  return (
    <aside className="axe-memory-agents" data-scene-reserve="agents" data-testid="memory-agent-activity">
      <h4>Agent activity</h4>
      {events.slice(0, 8).map((ev) => (
        <div className="axe-memory-agents-row" key={ev.id}>
          <span className="axe-memory-agents-name">{ev.agentName}</span>
          <span className="axe-memory-agents-title" title={ev.title}>{ev.title}</span>
          <span className="axe-memory-agents-act">{ev.action}</span>
        </div>
      ))}
    </aside>
  );
}
