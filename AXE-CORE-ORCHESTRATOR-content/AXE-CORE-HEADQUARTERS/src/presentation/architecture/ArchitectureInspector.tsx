import { X } from 'lucide-react';
import type { ArchitectureNode } from '@/domain/architecture/architectureGraph';
import { KIND_LABELS } from './architectureGraphMapper';

function display(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  if (value === null || value === undefined || value === '') return 'not set';
  return String(value);
}

export function ArchitectureInspector({
  node,
  onClose,
}: {
  node: ArchitectureNode;
  onClose: () => void;
}) {
  const rows = [
    ['Kind', KIND_LABELS[node.kind]],
    ['Id', node.id],
    ['Runs with', node.appId || 'shared / unassigned'],
    ...Object.entries(node.details).map(([key, value]) => [key, display(value)] as const),
    ['Sources', node.sources.join(' · ')],
  ] as const;

  return (
    <aside
      className="absolute top-12 right-3 bottom-10 z-30 w-[300px] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-[18px] p-3"
      style={{
        background: 'var(--axe-kaart-vlak)',
        border: '1px solid var(--axe-kaart-lijn)',
        boxShadow: 'var(--axe-kaart-schaduw)',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[8px] uppercase tracking-[0.16em]" style={{ color: 'rgba(245,240,230,0.45)' }}>{KIND_LABELS[node.kind]}</div>
          <h2 className="text-[14px] font-medium leading-tight" style={{ color: '#F5F0E6' }}>{node.label}</h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-md" style={{ color: 'rgba(245,240,230,0.55)' }} aria-label="Close details">
          <X size={14} />
        </button>
      </div>
      {node.description ? (
        <p className="text-[11px] mb-3 leading-snug" style={{ color: 'rgba(245,240,230,0.62)' }}>{node.description}</p>
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
