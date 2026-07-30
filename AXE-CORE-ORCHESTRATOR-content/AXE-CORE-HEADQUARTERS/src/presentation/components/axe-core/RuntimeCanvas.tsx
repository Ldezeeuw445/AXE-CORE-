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
import { useNavigate } from 'react-router';
import {
  User, Brain, Sparkles, Network, Activity, LayoutGrid, Server, Cpu,
  Code2, Search, Wrench, Plug, HeartPulse, Database, RefreshCw, ZoomIn, ZoomOut, Move, ExternalLink,
} from 'lucide-react';
import {
  loadAxeOrganization,
  type OrganizationNode,
  type OrganizationNodeKind,
} from '@/application/system/systemRegistryService';
import { loadNodePositions, saveNodePositions, type NodePosition } from '@/infrastructure/persistence/runtimeLayoutService';
import { findRouteForRuntimeNodeId } from '@/domain/navRegistry';
import { RuntimeInspector } from '@/presentation/components/axe-core/RuntimeInspector';
import { RuntimeStatusBar } from '@/presentation/components/axe-core/RuntimeStatusBar';
import { HUD_BASE_BG, HUD_DOT_GRID_STYLE, HUD_CHIP_STYLE } from '@/presentation/styles/hudBackground';

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

/* ── A single draggable node card (mouse + touch/pen via Pointer Events) ── */
function RuntimeNode({
  entry, scale, isSelected, onSelect, onOpenTab, onDrag, onDragEnd,
}: {
  entry: LayoutEntry;
  scale: number;
  isSelected: boolean;
  onSelect: () => void;
  onOpenTab: (route: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const { node } = entry;
  const style = KIND_STYLE[node.kind] ?? KIND_STYLE.core;
  const Icon = style.icon;
  const tabRoute = findRouteForRuntimeNodeId(node.id);
  const hasTabRoute = Boolean(tabRoute);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: entry.x, nodeY: entry.y };
    e.stopPropagation();
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: PointerEvent) => {
      const dx = (e.clientX - dragStart.current.x) / scale;
      const dy = (e.clientY - dragStart.current.y) / scale;
      onDrag(node.id, dragStart.current.nodeX + dx, dragStart.current.nodeY + dy);
    };
    const handleUp = () => { setDragging(false); onDragEnd(); };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, node.id, onDrag, onDragEnd, scale]);

  const isElevated = node.kind === 'executive' || node.kind === 'core';
  const sc = statusColor(node.status);
  const live = isLive(node.status);

  return (
    <motion.div
      layout={false}
      data-card="true"
      className="absolute cursor-grab active:cursor-grabbing select-none"
      style={{ left: entry.x, top: entry.y, width: NODE_W, zIndex: isSelected ? 30 : dragging ? 25 : isElevated ? 12 : 10, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onClick={onSelect}
      onDoubleClick={() => { if (tabRoute) onOpenTab(tabRoute); }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      {live && !isSelected && (
        <motion.div
          className="absolute rounded-2xl pointer-events-none"
          style={{ inset: -3, background: sc, filter: 'blur(11px)', zIndex: -1 }}
          animate={{ opacity: [0.12, 0.28, 0.12] }}
          transition={{ duration: node.kind === 'core' ? 2.2 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        className="rounded-xl overflow-hidden px-2.5 py-2 relative"
        style={{
          background: isSelected ? `${style.color}18` : node.kind === 'executive' ? 'linear-gradient(135deg, rgba(251,191,36,0.10), rgba(15,15,25,0.9))' : 'rgba(15,15,25,0.92)',
          border: `1px solid ${isSelected ? style.color : node.kind === 'executive' ? `${style.color}80` : `${sc}33`}`,
          boxShadow: isSelected ? `0 0 22px ${style.color}44` : node.kind === 'executive' ? `0 0 14px ${style.color}22` : live ? `0 0 12px ${sc}22, 0 4px 14px rgba(0,0,0,0.35)` : '0 4px 14px rgba(0,0,0,0.3)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20, background: `${style.color}20`, border: `1px solid ${style.color}40` }}>
            <Icon size={11} style={{ color: style.color }} />
          </div>
          <span className="text-[10px] font-semibold truncate flex-1" style={{ color: style.color }}>{node.label}</span>
          {hasTabRoute && (
            <button
              type="button"
              title="Jump to tab"
              onClick={e => { e.stopPropagation(); onOpenTab(tabRoute!); }}
              onPointerDown={e => e.stopPropagation()}
              className="flex-shrink-0 inline-flex items-center rounded-sm"
              style={{ padding: 1 }}
            >
              <ExternalLink size={9} style={{ color: 'var(--accent-cyan)' }} />
            </button>
          )}
          <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: sc, boxShadow: live ? `0 0 6px ${sc}, 0 0 2px ${sc}` : 'none' }} />
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

function isLive(status: OrganizationNode['status']) {
  return status === 'healthy' || status === 'online' || status === 'configured';
}

function RuntimeEdges({ entries }: { entries: LayoutEntry[] }) {
  const byId = useMemo(() => new Map(entries.map(e => [e.node.id, e])), [entries]);
  const width = Math.max(...entries.map(e => e.x), 0) + NODE_W + CANVAS_PAD;
  const height = Math.max(...entries.map(e => e.y), 0) + 100 + CANVAS_PAD;
  return (
    <svg className="absolute top-0 left-0 pointer-events-none" width={width} height={height} style={{ zIndex: 0 }}>
      <defs>
        <filter id="rc-edge-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {entries.filter(e => e.parentId).map((e, i) => {
        const parent = byId.get(e.parentId!);
        if (!parent) return null;
        const x1 = parent.x + NODE_W / 2;
        const y1 = parent.y + 56;
        const x2 = e.x + NODE_W / 2;
        const y2 = e.y;
        const midY = (y1 + y2) / 2;
        const color = KIND_STYLE[e.node.kind]?.color ?? '#22D3EE';
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        const live = isLive(e.node.status);
        const offline = e.node.status === 'offline';
        return (
          <g key={e.node.id}>
            <path d={d} fill="none" stroke={offline ? '#6B7280' : color} strokeOpacity={0.16} strokeWidth={1.2} />
            {!offline && (
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity={live ? 0.9 : 0.4}
                strokeWidth={live ? 1.9 : 1.3}
                strokeLinecap="round"
                strokeDasharray="7 27"
                filter="url(#rc-edge-glow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="34" to="0"
                  dur={live ? '1.15s' : '2.6s'}
                  begin={`${(i % 6) * -0.18}s`}
                  repeatCount="indefinite"
                />
              </path>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RuntimeWorkspace() {
  const [root, setRoot] = useState<OrganizationNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.75);
  const [panning, setPanning] = useState(false);
  const [pinching, setPinching] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const panRef = useRef(pan);
  panRef.current = pan;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const canvasRootRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; scale: number; pan: { x: number; y: number }; center: { x: number; y: number } } | null>(null);

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

  const handlePointerDownCanvas = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      setPinching(false);
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    } else if (pointersRef.current.size === 2) {
      setPanning(false);
      setPinching(true);
      const pts = Array.from(pointersRef.current.values());
      const rect = canvasRootRef.current?.getBoundingClientRect();
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartRef.current = {
        dist: dist || 1,
        scale: scaleRef.current,
        pan: { ...panRef.current },
        center: { x: (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0), y: (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0) },
      };
    }
  };

  useEffect(() => {
    if (!panning && !pinching) return;

    const handleMove = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinching && pointersRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const rect = canvasRootRef.current?.getBoundingClientRect();
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const center = { x: (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0), y: (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0) };
        const start = pinchStartRef.current;
        const newScale = Math.min(Math.max(start.scale * (dist / start.dist), 0.25), 2.5);
        const contentX = (start.center.x - start.pan.x) / start.scale;
        const contentY = (start.center.y - start.pan.y) / start.scale;
        setScale(newScale);
        setPan({ x: center.x - contentX * newScale, y: center.y - contentY * newScale });
      } else if (panning) {
        setPan({ x: panStart.current.panX + (e.clientX - panStart.current.x), y: panStart.current.panY + (e.clientY - panStart.current.y) });
      }
    };

    const handleUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size === 0) {
        setPanning(false);
        setPinching(false);
        pinchStartRef.current = null;
      } else if (pointersRef.current.size === 1) {
        setPinching(false);
        pinchStartRef.current = null;
        const [[, remaining]] = Array.from(pointersRef.current.entries());
        panStart.current = { x: remaining.x, y: remaining.y, panX: panRef.current.x, panY: panRef.current.y };
        setPanning(true);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [panning, pinching]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setScale(s => Math.min(Math.max(s + (e.deltaY > 0 ? -0.08 : 0.08), 0.25), 2.5));
    }
  };

  const selectedEntry = layout.find(e => e.node.id === selectedId) ?? null;

  return (
    <div
      ref={canvasRootRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        background: HUD_BASE_BG,
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDownCanvas}
      onWheel={handleWheel}
    >
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        <span className="text-[9px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>RUNTIME</span>
        <span className="text-[8px] hidden sm:inline" style={{ color: 'rgba(255,255,255,0.22)' }}>drag canvas · pinch zoom · drag nodes · click inspect</span>
      </div>
      <div className="absolute top-3 right-4 z-10">
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-medium"
          style={{ ...HUD_CHIP_STYLE, color: 'var(--accent-cyan)' }}
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !root ? (
        <div className="h-full grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
              <motion.div
                className="absolute rounded-full"
                style={{
                  inset: 0,
                  border: '1px solid rgba(34,211,238,0.35)',
                  boxShadow: '0 0 28px rgba(34,211,238,0.22)',
                }}
                animate={{ scale: [1, 1.12, 1], opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute rounded-full"
                style={{
                  inset: 12,
                  background: 'rgba(34,211,238,0.12)',
                  border: '1px solid rgba(34,211,238,0.4)',
                }}
                animate={{ scale: [1, 0.92, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
              <Brain size={18} style={{ color: 'var(--accent-cyan)', position: 'relative', zIndex: 1 }} />
            </div>
            <div className="text-[11px] font-mono tracking-wide" style={{ color: 'rgba(34,211,238,0.65)' }}>
              Assembling runtime graph
            </div>
            <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              Organization tree · node positions
            </div>
          </div>
        </div>
      ) : (
        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: panning || pinching ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <div
            className="absolute"
            style={{ width: 6000, height: 4000, left: -1000, top: -400, ...HUD_DOT_GRID_STYLE }}
          />
          <RuntimeEdges entries={layout} />
          {layout.map(entry => (
            <RuntimeNode
              key={entry.node.id}
              entry={entry}
              scale={scale}
              isSelected={selectedId === entry.node.id}
              onSelect={() => setSelectedId(entry.node.id)}
              onOpenTab={route => navigate(route)}
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
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={HUD_CHIP_STYLE}>
          <button onClick={() => setScale(s => Math.min(s + 0.15, 2.5))} className="p-1 rounded" style={{ color: 'var(--accent-cyan)' }}><ZoomIn size={12} /></button>
          <span className="text-[9px] font-mono-data w-8 text-center" style={{ color: 'rgba(255,255,255,0.45)' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.max(s - 0.15, 0.25))} className="p-1 rounded" style={{ color: 'var(--accent-cyan)' }}><ZoomOut size={12} /></button>
        </div>
        <button onClick={() => { setPan({ x: 0, y: 0 }); setScale(0.75); }} className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[8px]" style={{ ...HUD_CHIP_STYLE, color: 'rgba(255,255,255,0.45)' }}>
          <Move size={10} /> Reset
        </button>
      </div>

      <div className="absolute bottom-14 left-3 z-20 flex flex-col gap-1 px-2 py-1.5 rounded-lg" style={HUD_CHIP_STYLE}>
        {[
          { c: '#10B981', l: 'Online' },
          { c: '#22D3EE', l: 'Configured' },
          { c: '#F59E0B', l: 'Degraded' },
          { c: '#EF4444', l: 'Offline' },
        ].map(s => (
          <div key={s.l} className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: 6, height: 6, background: s.c, boxShadow: `0 0 5px ${s.c}` }} />
            <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.l}</span>
          </div>
        ))}
      </div>

      <RuntimeStatusBar root={root} />
    </div>
  );
}
