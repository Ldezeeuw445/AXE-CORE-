import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './architectureCanvas.css';
import { RefreshCw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { PlaatDock, PlaatRail } from '@/presentation/components/layout/PlaatSlots';
import type { ArchitectureNode, ArchitectureSnapshot } from '@/domain/architecture/architectureGraph';
import { loadArchitectureSnapshot, staticArchitectureManifest } from '@/application/system/architectureSnapshotService';
import { ArchitectureGroupCard, ArchitectureNodeCard } from './ArchitectureNodeCard';
import { ArchitectureInspector } from './ArchitectureInspector';
import {
  ALL_GROUPS,
  ARCHITECTURE_KINDS,
  KIND_LABELS,
  OVERVIEW,
  architectureNodeFromClick,
  mapArchitectureGraph,
  type ArchitectureGraphFilters,
} from './architectureGraphMapper';

const NODE_TYPES = {
  architecture: ArchitectureNodeCard,
  architectureGroup: ArchitectureGroupCard,
} as unknown as NodeTypes;

function ArchitectureCanvas() {
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();
  const [snapshot, setSnapshot] = useState<ArchitectureSnapshot>({
    manifest: staticArchitectureManifest(),
    live: { state: 'unconfigured', issues: [] },
  });
  const [filters, setFilters] = useState<ArchitectureGraphFilters>({ group: OVERVIEW, kind: 'all', query: '' });
  const [selected, setSelected] = useState<ArchitectureNode | null>(null);
  const [loading, setLoading] = useState(true);
  const pickingNode = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await loadArchitectureSnapshot());
    } catch (error) {
      setSnapshot({
        manifest: staticArchitectureManifest(),
        live: { state: 'offline', issues: [error instanceof Error ? error.message : String(error)] },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const mapped = useMemo(
    () => mapArchitectureGraph(snapshot.manifest, filters),
    [snapshot.manifest, filters],
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (mapped.overview || mapped.visibleCount <= 20) {
        void fitView({ padding: 0.18, duration: 220 });
        return;
      }
      void setViewport({ x: 36, y: 88, zoom: 0.72 }, { duration: 220 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, setViewport, mapped.nodes.length, mapped.overview, mapped.visibleCount, filters.group, filters.kind, filters.query]);

  const openNode = useCallback((data: Parameters<typeof architectureNodeFromClick>[0], fallbackId: string) => {
    const picked = architectureNodeFromClick(data, fallbackId, snapshot.manifest.nodes);
    if (!picked) return;
    if (picked.type === 'group') {
      setFilters(current => ({ ...current, group: picked.groupId, query: '' }));
      setSelected(null);
      return;
    }
    pickingNode.current = true;
    setSelected(picked.node);
    window.setTimeout(() => { pickingNode.current = false; }, 0);
  }, [snapshot.manifest.nodes]);

  const flowNodes = useMemo(() => mapped.nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      active: selected?.id === node.id,
      onSelect: () => openNode(node.data, node.id),
    },
  })), [mapped.nodes, openNode, selected?.id]);

  return (
    <div className="axe-scene-vlak axe-architecture absolute inset-0 overflow-hidden">
      <ReactFlow
        nodes={flowNodes}
        edges={mapped.edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => openNode(node.data, node.id)}
        onPaneClick={() => {
          if (pickingNode.current) {
            pickingNode.current = false;
            return;
          }
          setSelected(null);
        }}
        minZoom={0.25}
        maxZoom={1.8}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(255,255,255,0.04)" gap={22} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
        {selected && (
          <Panel position="top-right" className="axe-architecture-inspector-panel">
            <ArchitectureInspector node={selected} onClose={() => setSelected(null)} />
          </Panel>
        )}
        <Panel position="top-left" className="flex flex-wrap items-center gap-2 !ml-3 max-w-[min(720px,70%)]" style={{ top: 58 }}>
          {filters.group !== OVERVIEW ? (
            <button
              type="button"
              className="text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-full"
              style={{ color: '#F5F0E6', border: '1px solid var(--axe-kaart-lijn)' }}
              onClick={() => setFilters(current => ({ ...current, group: OVERVIEW, query: '' }))}
            >
              ← Overview
            </button>
          ) : (
            <span className="text-[9px] font-mono-data tracking-[0.2em]" style={{ color: 'var(--accent-cyan)' }}>ARCHITECTURE</span>
          )}
          <label className="flex items-center gap-1.5">
            <Search size={12} style={{ color: 'rgba(245,240,230,0.45)' }} />
            <input
              className="axe-architecture-zoek nodrag nopan"
              value={filters.query}
              placeholder="Search apps, agents, services, tables…"
              onChange={event => setFilters(current => ({
                ...current,
                query: event.target.value,
                group: event.target.value.trim() ? ALL_GROUPS : current.group === ALL_GROUPS ? OVERVIEW : current.group,
              }))}
            />
          </label>
          <select
            className="axe-architecture-zoek nodrag nopan"
            value={filters.kind}
            onChange={event => setFilters(current => ({ ...current, kind: event.target.value as ArchitectureGraphFilters['kind'] }))}
            aria-label="Filter by kind"
          >
            <option value="all">All kinds</option>
            {ARCHITECTURE_KINDS.map(kind => (
              <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
            ))}
          </select>
          {loading && <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>loading live registers…</span>}
        </Panel>
      </ReactFlow>

      <PlaatDock>
        <button type="button" onClick={() => void load()} className="p-1.5 rounded-lg" style={{ color: 'var(--accent-cyan)' }} title="Refresh live registers"><RefreshCw size={13} /></button>
        <button type="button" onClick={() => void zoomIn({ duration: 160 })} className="p-1.5 rounded-lg" style={{ color: 'var(--accent-cyan)' }} title="Zoom in"><ZoomIn size={13} /></button>
        <button type="button" onClick={() => void zoomOut({ duration: 160 })} className="p-1.5 rounded-lg" style={{ color: 'var(--accent-cyan)' }} title="Zoom out"><ZoomOut size={13} /></button>
      </PlaatDock>

      <PlaatRail title="Architecture">
        <div className="flex flex-col gap-2 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          <div>Live registers: {snapshot.live.state}</div>
          <div>{mapped.visibleCount} nodes in this view · {snapshot.manifest.nodes.length} total</div>
          {snapshot.live.issues.slice(0, 4).map(issue => (
            <div key={issue} style={{ color: 'var(--warning)' }}>{issue}</div>
          ))}
          <div className="mt-2 flex flex-col gap-1">
            {mapped.groups.map(group => (
              <button
                key={group.id}
                type="button"
                className="text-left"
                style={{ color: filters.group === group.id ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
                onClick={() => setFilters(current => ({ ...current, group: group.id, query: '' }))}
              >
                {group.label} · {group.count}
              </button>
            ))}
          </div>
        </div>
      </PlaatRail>

    </div>
  );
}

export function ArchitectureWorkspace() {
  return (
    <ReactFlowProvider>
      <ArchitectureCanvas />
    </ReactFlowProvider>
  );
}

export { ArchitectureWorkspace as RuntimeWorkspace };
export default ArchitectureWorkspace;
