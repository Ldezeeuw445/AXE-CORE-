/**
 * RuntimeStatusBar.tsx
 * ------------------------------------------------------------------
 * Always-visible bottom bar for the Runtime workspace — summarizes
 * Core health and per-category counts computed live from the
 * assembled OrganizationNode tree (never hardcoded).
 */
import { Activity } from 'lucide-react';
import type { OrganizationNode } from '@/application/system/systemRegistryService';
import { flattenOrganization } from '@/application/system/systemRegistryService';

function countByKind(root: OrganizationNode, kinds: string[]): number {
  return flattenOrganization(root).filter(n => kinds.includes(n.kind)).length;
}

export function RuntimeStatusBar({ root }: { root: OrganizationNode | null }) {
  if (!root) return null;
  const health = flattenOrganization(root).find(n => n.kind === 'health');
  const percentage = typeof health?.meta?.percentage === 'number' ? health.meta.percentage : 0;
  const healthColor = percentage >= 80 ? '#10B981' : percentage >= 50 ? '#F59E0B' : '#EF4444';

  const stats = [
    { label: 'Applications', count: countByKind(root, ['application']) },
    { label: 'Agents', count: countByKind(root, ['specialist', 'orchestrator', 'core', 'executive']) },
    { label: 'Providers', count: countByKind(root, ['provider']) },
    { label: 'Models', count: countByKind(root, ['model']) },
    { label: 'Tools', count: countByKind(root, ['tool', 'coding_system', 'research_system']) },
    { label: 'MCP', count: countByKind(root, ['mcp']) },
    { label: 'Memory', count: countByKind(root, ['memory']) },
    { label: 'Event Bus', count: countByKind(root, ['service']) },
  ];

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-3 px-3 py-1.5 overflow-x-auto"
      style={{ background: 'rgba(0,0,0,0.85)', borderTop: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Activity size={11} style={{ color: healthColor }} />
        <span className="text-[9px] font-mono-data uppercase tracking-wider" style={{ color: healthColor }}>
          Core {percentage}%
        </span>
      </div>
      <span className="text-[9px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
      {stats.map(s => (
        <div key={s.label} className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</span>
          <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.75)' }}>{s.count}</span>
        </div>
      ))}
    </div>
  );
}
