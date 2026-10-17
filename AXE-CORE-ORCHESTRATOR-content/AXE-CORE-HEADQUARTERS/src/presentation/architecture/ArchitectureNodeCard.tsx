import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ArchitectureFlowData } from './architectureGraphMapper';
import { KIND_LABELS } from './architectureGraphMapper';
import { emitArchitectureSelection } from './architectureSelection';

const KIND_INK: Record<string, string> = {
  app: '#E8C547',
  agent: '#7DD3FC',
  crew: '#C4B5FD',
  service: '#FDBA74',
  'supabase-project': '#6EE7B7',
  table: '#A7F3D0',
  cloudflare: '#F9A8D4',
  mcp: '#FDA4AF',
  runtime: '#94A3B8',
  cron: '#FDE68A',
  provider: '#86EFAC',
  worker: '#93C5FD',
  dax: '#F0ABFC',
  'coding-seat': '#A3E635',
  group: '#F5F0E6',
};

function statusTone(status: unknown): string {
  const value = typeof status === 'string' ? status.toLowerCase() : '';
  if (['online', 'healthy', 'active', 'registered', 'scheduled'].includes(value)) return 'var(--success)';
  if (['stale', 'degraded', 'partial', 'disabled'].includes(value)) return 'var(--warning)';
  if (['offline', 'error', 'failed'].includes(value)) return 'var(--error)';
  return 'rgba(245, 240, 230, 0.28)';
}

export function ArchitectureNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as ArchitectureFlowData;
  const ink = KIND_INK[nodeData.kind] ?? '#F5F0E6';
  const status = nodeData.node?.details.liveStatus;
  const active = Boolean(nodeData.active || selected);
  const where = typeof nodeData.node?.details.unit === 'string'
    ? nodeData.node.details.unit
    : typeof nodeData.node?.details.host === 'string'
      ? nodeData.node.details.host
      : nodeData.node?.details.projectRef
        ? String(nodeData.node.details.projectRef)
        : nodeData.overview
          ? `${nodeData.childCount} parts`
          : nodeData.node?.description;

  return (
    <div
      className={`axe-architecture-kaart${active ? ' is-selected' : ''}`}
      data-architecture-node={nodeData.node?.id ?? ''}
      onClick={event => {
        if (nodeData.overview || !nodeData.node) return;
        event.stopPropagation();
        emitArchitectureSelection(nodeData.node);
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0.35 }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] uppercase tracking-[0.16em]" style={{ color: ink }}>
          {nodeData.kind === 'group' ? 'Group' : KIND_LABELS[nodeData.kind]}
        </span>
        {status != null && status !== '' && (
          <span className="flex items-center gap-1 text-[9px]" style={{ color: 'rgba(245,240,230,0.55)' }}>
            <span className="rounded-full" style={{ width: 6, height: 6, background: statusTone(status) }} />
            {String(status)}
          </span>
        )}
      </div>
      <div className="text-[12px] font-medium leading-tight" style={{ color: '#F5F0E6' }}>{nodeData.label}</div>
      {where ? (
        <div className="text-[10px] leading-snug line-clamp-2" style={{ color: 'rgba(245,240,230,0.48)' }}>{String(where)}</div>
      ) : null}
      {nodeData.overview && nodeData.counts ? (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px]" style={{ color: 'rgba(245,240,230,0.42)' }}>
          {Object.entries(nodeData.counts).slice(0, 6).map(([kind, count]) => (
            <span key={kind}>{count} {kind}</span>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} style={{ opacity: 0.35 }} />
    </div>
  );
}

export function ArchitectureGroupCard({ data }: NodeProps) {
  const nodeData = data as ArchitectureFlowData;
  return (
    <div className="axe-architecture-groep">
      <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: '#F5F0E6' }}>{nodeData.label}</div>
      <div className="text-[10px] mt-0.5" style={{ color: 'rgba(245,240,230,0.42)' }}>{nodeData.childCount} nodes</div>
    </div>
  );
}
