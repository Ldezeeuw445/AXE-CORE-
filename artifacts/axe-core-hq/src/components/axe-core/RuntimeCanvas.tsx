/**
 * RuntimeCanvas.tsx
 * ------------------------------------------------------------------
 * The single, authoritative "Runtime" architecture workspace — a
 * dark, pannable/zoomable node canvas built directly from the live
 * OrganizationNode tree (systemRegistryService). Every node can be
 * dragged, clicked to open the RuntimeInspector, and edited where the
 * data model supports it. Node positions persist to Supabase via
 * runtimeLayoutService. This replaces every previous
 * architecture/organization visualization in the app.
 */
import { useState, useRef, useCallback, useEffect, useMemo, type ComponentType, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Brain, Sparkles, Network, Activity, LayoutGrid, Server, Cpu,
  Code2, Search, Wrench, Plug, HeartPulse, Database, RefreshCw, ZoomIn, ZoomOut, Move,
} from 'lucide-react';
import {
  loadAxeOrganization,
  type OrganizationNode,
  type OrganizationNodeKind,
} from '@/services/systemRegistryService';
import { loadNodePositions, saveNodePositions, type NodePosition } from '@/services/runtimeLayoutService';
import { RuntimeInspector } from '@/components/axe-core/RuntimeInspector';
import { RuntimeStatusBar } from '@/components/axe-core/RuntimeStatusBar';

/* ── Visual language per node kind ──────────────────────────────────────── */
const KIND_STYLE: Record<OrganizationNodeKind, { color: string; icon: ComponentType<{ size: number; style?: CSSProperties }> }> = {
  user: { color: '#E5E7EB', icon: User },
  core: { color: '#22D3EE', icon: Brain },
  executive: { color: '#FBBF24', icon: Sparkles },
  orchestrator: { color: '#F59E0B', icon: Network },
  specialist: { color: '#3B82F6', icon: Activity },
  application: { color: '#A78BFA', icon: LayoutGrid },
  provider: { color: '#10B981', icon: Server },
  model: { color: '#6EE7B7', icon: Cpu },
  coding_system: { color: '#84CC16', icon: Code2 },
  research_system: { color: '#38BDF8', icon: Search },
  tool: { color: '#EC4899', icon: Wrench },
  mcp: { color: '#F472B6', icon: Plug },
  service: { color: '#FB923C', icon: Server },
  memory: { color: '#E879F9', icon: Database },
  infrastructure: { color: '#EF4444', icon: Server },
  health: { color: '#22D3EE', icon: HeartPulse },
};

const NODE_W = 176;
const NODE_GAP = 22;
const LEVEL_H = 128;
const CANVAS_PAD = 140;

interface LayoutEntry { node: OrganizationNode; x: number; y: number; depth: number; parentId?: string }

/** Simple depth-first tidy-tree layout: leaves are placed left-to-right in
 *  visitation order, internal nodes centered above their children. */
function layoutTree(root: OrganizationNode): LayoutEntry[] {
  const entries: LayoutEntry[] = [];
  let leafSlot = 0;

  function visit(node: OrganizationNode, depth: number, parentId?: string): number {
    if (node.children.length === 0) {
      const x = leafSlot * (NODE_W + NODE_GAP);
      leafSlot += 1;
      entries.push({ node, x, y: depth * LEVEL_H, depth, parentId });
      return x;
    }
    const childXs = node.children.map(child => visit(child, depth + 1, node.id));
    const x = childXs.reduce((a, b) => a + b, 0) / childXs.length;
    entries.push({ node, x, y: depth * LEVEL_H, depth, parentId });
    return x;
  }
  visit(root, 0);
  return entries.map(e => ({ ...e, x: e.x + CANVAS_PAD, y: e.y + CANVAS_PAD }));
}

function statusColor(status: OrganizationNode['status']) {
  switch (status) {
    case 'healthy':
    case 'online': return '#10B981';
    case 'configured': return '#22D3EE';
    case 'degraded': return '#F59E0B';
    case 'offline': return '#EF4444';
    default: return '#6B7280';
  }
}

/* ── A single draggable node card ───────────────────────────────────────── */
function RuntimeNode({
  entry, isSelected, onSelect, onDrag, onDragEnd,
}: {
  entry: LayoutEntry;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (id: string, x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const { node } = entry;
  const style = KIND_STYLE[node.kind] ?? KIND_STYLE.core;
  const Icon = style.icon;
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: entry.x, nodeY: entry.y };
    e.stopPropagation();
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onDrag(node.id, dragStart.current.nodeX + dx, dragStart.current.nodeY + dy);
    };
    const handleUp = () => { setDragging(false); onDragEnd(); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, node.id, onDrag, onDragEnd]);

  const isElevated = node.kind === 'executive' || node.kind === 'core';

  return (
    <motion.div
      layout={false}
      data-card="true"
      className="absolute cursor-grab active:cursor-grabbing select-none"
      style={{ left: entry.x, top: entry.y, width: NODE_W, zIndex: isSelected ? 30 : dragging ? 25 : isElevated ? 12 : 10 }}
      onMouseDown={handleMouseDown}
      onClick={onSelect}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="rounded-xl overflow-hidden px-2.5 py-2"
        style={{
          background: isSelected ? `${style.color}18` : node.kind === 'executive' ? 'linear-gradient(135deg, rgba(251,191,36,0.10), rgba(15,15,25,0.9))' : 'rgba(15,15,25,0.9)',
          border: `1px solid ${isSelected ? style.color : node.kind === 'executive' ? `${style.color}80` : 'rgba(255,255,255,0.08)'}`,
          boxShadow: isSelected ? `0 0 18px ${style.color}33` : node.kind === 'executive' ? `0 0 14px ${style.color}22` : '0 4px 14px rgba(0,0,0,0.3)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20, background: `${style.color}20`, border: `1px solid ${style.color}40` }}>
            <Icon size={11} style={{ color: style.color }} />
          </div>
          <span className="text-[10px] font-semibold truncate flex-1" style={{ color: style.color }}>{node.label}</span>
          <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: statusColor(node.status) }} />
        </div>
        {node.detail && <div className="mt-1 text-[8px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{node.detail}</div>}
        {node.kind === 'executive' && (
          <div className="mt-1 text-[7px] uppercase tracking-widest" style={{ color: style.color }}>Executive Intelligence</div>
        )}
        {node.children.length > 0 && (
          <div className="mt-1 text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{node.children.length} node{node.children.length > 1 ? 's' : ''}</div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Connecting lines between parent/child pairs (drawn inside the pan/zoom plane) ── */
function RuntimeEdges({ entries }: { entries: LayoutEntry[] }) {
  const byId = useMemo(() => new Map(entries.map(e => [e.node.id, e])), [entries]);
  const width = Math.max(...entries.map(e => e.x), 0) + NODE_W + CANVAS_PAD;
  const height = Math.max(...entries.map(e => e.y), 0) + 100 + CANVAS_PAD;
  return (
    <svg className="absolute top-0 left-0 pointer-events-none" width={width} height={height} style={{ zIndex: 0 }}>
      {entries.filter(e => e.parentId).map(e => {
        const parent = byId.get(e.parentId!);
        if (!parent) return null;
        const x1 = parent.x + NODE_W / 2;
        const y1 = parent.y + 56;
        const x2 = e.x + NODE_W / 2;
        const y2 = e.y;
        const midY = (y1 + y2) / 2;
        const color = KIND_STYLE[e.node.kind]?.color ?? '#22D3EE';
        return (
          <path
            key={e.node.id}
            d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeOpacity={0.35}
            strokeWidth={1.2}
          />
        );
      })}
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RUNTIME WORKSPACE — main export
   ══════════════════════════════════════════════════════════════════════════ */
export function RuntimeWorkspace() {
  const [root, setRoot] = useState<OrganizationNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.75);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const load = useCallback(async () => {
    setLoading(true);
    const [snapshot, savedPositions] = await Promise.all([loadAxeOrganization(), loadNodePositions()]);
    setRoot(snapshot.root);
    setPositions(savedPositions);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const baseLayout = useMemo(() => (root ? layoutTree(root) : []), [root]);
  const layout: LayoutEntry[] = useMemo(
    () => baseLayout.map(e => {
      const saved = positions[e.node.id];
      return saved ? { ...e, x: saved.x, y: saved.y } : e;
    }),
    [baseLayout, positions],
  );

  const handleDrag = useCallback((id: string, x: number, y: number) => {
    setPositions(prev => ({ ...prev, [id]: { x: Math.max(0, x), y: Math.max(0, y) } }));
  }, []);

  const handleDragEnd = useCallback(() => {
    void saveNodePositions(positionsRef.current);
  }, []);

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  useEffect(() => {
    if (!panning) return;
    const handleMove = (e: MouseEvent) => {
      setPan({ x: panStart.current.panX + (e.clientX - panStart.current.x), y: panStart.current.panY + (e.clientY - panStart.current.y) });
    };
    const handleUp = () => setPanning(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [panning]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setScale(s => Math.min(Math.max(s + (e.deltaY > 0 ? -0.08 : 0.08), 0.25), 2.5));
    }
  };

  const selectedEntry = layout.find(e => e.node.id === selectedId) ?? null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#050510' }} onMouseDown={handleMouseDownCanvas} onWheel={handleWheel}>
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        <span className="text-[9px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>RUNTIME</span>
        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>drag canvas to pan · drag nodes to arrange · click to inspect</span>
      </div>
      <div className="absolute top-3 right-4 z-10">
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-medium"
          style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !root ? (
        <div className="h-full grid place-items-center text-xs" style={{ color: 'var(--text-muted)' }}>Assembling runtime graph…</div>
      ) : (
        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: panning ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <div
            className="absolute"
            style={{
              width: 6000, height: 4000, left: -1000, top: -400,
              backgroundImage: 'linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <RuntimeEdges entries={layout} />
          {layout.map(entry => (
            <RuntimeNode
              key={entry.node.id}
              entry={entry}
              isSelected={selectedId === entry.node.id}
              onSelect={() => setSelectedId(entry.node.id)}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedEntry && (
          <RuntimeInspector
            node={selectedEntry.node}
            accentColor={KIND_STYLE[selectedEntry.node.kind]?.color ?? '#22D3EE'}
            onClose={() => setSelectedId(null)}
            onSaved={() => void load()}
          />
        )}
      </AnimatePresence>

      <div className="absolute bottom-14 right-3 z-20 flex flex-col gap-1">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => setScale(s => Math.min(s + 0.15, 2.5))} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}><ZoomIn size={12} /></button>
          <span className="text-[9px] font-mono-data w-8 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.max(s - 0.15, 0.25))} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}><ZoomOut size={12} /></button>
        </div>
        <button onClick={() => { setPan({ x: 0, y: 0 }); setScale(0.75); }} className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[8px]" style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>
          <Move size={10} /> Reset
        </button>
      </div>

      <RuntimeStatusBar root={root} />
    </div>
  );
}
