import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useStoreApi,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './architectureCanvas.css';
import { RefreshCw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { PlaatDock, PlaatRail } from '@/presentation/components/layout/PlaatSlots';
import type { ArchitectureSnapshot } from '@/domain/architecture/architectureGraph';
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
  selectedArchitectureNodeFromFlow,
  type ArchitectureFlowData,
  type ArchitectureGraphFilters,
} from './architectureGraphMapper';

const NODE_TYPES = {
  architecture: ArchitectureNodeCard,
  architectureGroup: ArchitectureGroupCard,
} as unknown as NodeTypes;

function ArchitectureInspectorHost() {
  const store = useStoreApi();
  const selected = useStore(state => selectedArchitectureNodeFromFlow(
    state.nodes as unknown as Array<{ selected?: boolean; type?: string; data: ArchitectureFlowData }>,
  ));
  if (!selected) return null;
  return (
    <div
      className="axe-architecture-inspector-panel"
      data-testid="architecture-inspector-host"
      style={{
        position: 'absolute',
        top: 72,
        right: 12,
        zIndex: 9999,
        width: 308,
        maxHeight: 'calc(100% - 96px)',
        overflow: 'auto',
        pointerEvents: 'auto',
      }}
    >
      <ArchitectureInspector
        node={selected}
        onClose={() => store.getState().resetSelectedElements()}
      />
    </div>
  );
}

function ArchitectureCanvas() {
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();
  const [snapshot, setSnapshot] = useState<ArchitectureSnapshot>({
    manifest: staticArchitectureManifest(),
    live: { state: 'unconfigured', issues: [] },
  });
  const [filters, setFilters] = useState<ArchitectureGraphFilters>({ group: OVERVIEW, kind: 'all', query: '' });
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="axe-scene-vlak axe-architecture absolute inset-0 overflow-hidden" style={{ isolation: 'isolate' }}>
      <ReactFlow
        nodes={mapped.nodes}
        edges={mapped.edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => {
          const picked = architectureNodeFromClick(node.data, node.id, snapshot.manifest.nodes);
          if (picked?.type === 'group') {
            setFilters(current => ({ ...current, group: picked.groupId, query: '' }));
          }
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

      <ArchitectureInspectorHost />
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
