import { X } from 'lucide-react';
import type { ArchitectureNode } from '@/domain/architecture/architectureGraph';
import { KIND_LABELS } from './architectureGraphMapper';

function display(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (value === null || value === undefined || value === '') return 'not set';
  return String(value);
}

export function asInspectorNode(value: unknown): ArchitectureNode | null {
  if (!value || typeof value !== 'object') return null;
  const node = value as Partial<ArchitectureNode> & { label?: string; id?: string };
  const kind = node.kind;
  if (!kind || !(kind in KIND_LABELS)) return null;
  return {
    id: String(node.id ?? ''),
    kind,
    label: String(node.label ?? node.id ?? 'Node'),
    appId: typeof node.appId === 'string' ? node.appId : undefined,
    description: typeof node.description === 'string' ? node.description : undefined,
    details: node.details && typeof node.details === 'object' && !Array.isArray(node.details) ? node.details : {},
    sources: Array.isArray(node.sources) ? node.sources.map(String) : [],
  };
}

export function ArchitectureInspector({
  node,
  onClose,
}: {
  node: ArchitectureNode;
  onClose: () => void;
}) {
  const safe = asInspectorNode(node) ?? {
    id: 'unknown',
    kind: 'service' as const,
    label: 'Node',
    details: {},
    sources: [],
  };
  const details = safe.details;
  const where = [
    typeof details.unit === 'string' ? details.unit : null,
    typeof details.host === 'string' ? details.host : null,
    typeof details.projectRef === 'string' ? details.projectRef : null,
    typeof details.engine === 'string' ? details.engine : null,
  ].filter(Boolean);

  const rows = [
    ['Kind', KIND_LABELS[safe.kind]],
    ['Id', safe.id],
    ['Runs with', safe.appId || 'shared / unassigned'],
    ['Where', where.length ? where.join(' · ') : 'not set'],
    ['Status', display(details.liveStatus ?? details.status ?? details.heartbeat)],
    ...Object.entries(details)
      .filter(([key]) => !['liveStatus', 'status', 'heartbeat', 'unit', 'host', 'projectRef', 'engine'].includes(key))
      .map(([key, value]) => [key, display(value)] as const),
    ['Sources', safe.sources.length ? safe.sources.join(' · ') : 'not set'],
  ] as const;

  return (
    <aside
      className="nodrag nopan nowheel axe-architecture-inspector"
      data-testid="architecture-inspector"
      aria-label={`Details for ${safe.label}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[8px] uppercase tracking-[0.16em]" style={{ color: 'rgba(245,240,230,0.45)' }}>{KIND_LABELS[safe.kind]}</div>
          <h2 className="text-[14px] font-medium leading-tight" style={{ color: '#F5F0E6' }}>{safe.label}</h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-md" style={{ color: 'rgba(245,240,230,0.55)' }} aria-label="Close details">
          <X size={14} />
        </button>
      </div>
      {safe.description ? (
        <p className="text-[11px] mb-3 leading-snug" style={{ color: 'rgba(245,240,230,0.62)' }}>{safe.description}</p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg px-2.5 py-1.5" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[8px] uppercase tracking-wide" style={{ color: 'rgba(245,240,230,0.38)' }}>{label}</div>
            <div className="text-[10px] mt-0.5 break-words" style={{ color: '#F5F0E6' }}>{value}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
