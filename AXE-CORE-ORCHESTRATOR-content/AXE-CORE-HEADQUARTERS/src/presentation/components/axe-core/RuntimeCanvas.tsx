/**
 * RuntimeCanvas — premium constellation of the live AXE organization.
 *
 * Overview: AXE CORE in the center, every real subsystem as an orbital hub
 * (EVE, Orchestrator, Applications, Providers, …). Click a hub to enter that
 * branch. Wheel = zoom, drag = pan. Truthful to loadAxeOrganization().
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
import { findRouteForRuntimeNodeId } from '@/domain/navRegistry';
import { RuntimeInspector } from '@/presentation/components/axe-core/RuntimeInspector';
import { RuntimeStatusBar } from '@/presentation/components/axe-core/RuntimeStatusBar';
import { HUD_CHIP_STYLE } from '@/presentation/styles/hudBackground';

const KIND_STYLE: Record<OrganizationNodeKind, { color: string; icon: ComponentType<{ size: number; style?: CSSProperties }>; glyph: string }> = {
  user: { color: '#E5E7EB', icon: User, glyph: '◉' },
  core: { color: '#22D3EE', icon: Brain, glyph: '◈' },
  executive: { color: '#FBBF24', icon: Sparkles, glyph: '✦' },
  orchestrator: { color: '#F59E0B', icon: Network, glyph: '⬡' },
  specialist: { color: '#60A5FA', icon: Activity, glyph: '◇' },
  application: { color: '#A78BFA', icon: LayoutGrid, glyph: '▣' },
  provider: { color: '#34D399', icon: Server, glyph: '◎' },
  model: { color: '#6EE7B7', icon: Cpu, glyph: '·' },
  coding_system: { color: '#A3E635', icon: Code2, glyph: '⌘' },
  research_system: { color: '#38BDF8', icon: Search, glyph: '◎' },
  tool: { color: '#F472B6', icon: Wrench, glyph: '⚙' },
  mcp: { color: '#FB7185', icon: Plug, glyph: '⧉' },
  service: { color: '#FB923C', icon: Server, glyph: '◉' },
  memory: { color: '#E879F9', icon: Database, glyph: '◐' },
  infrastructure: { color: '#F87171', icon: Server, glyph: '▣' },
  health: { color: '#22D3EE', icon: HeartPulse, glyph: '♥' },
};

const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
const BG = '#080B10';
const CYAN = '#22D3EE';

function statusColor(status: OrganizationNode['status']) {
  switch (status) {
    case 'healthy':
    case 'online': return '#10B981';
    case 'configured': return CYAN;
    case 'degraded': return '#F59E0B';
    case 'offline': return '#EF4444';
    default: return '#6B7280';
  }
}

function findNode(node: OrganizationNode, id: string): OrganizationNode | null {
  if (node.id === id) return node;
  for (const c of node.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function findParent(node: OrganizationNode, targetId: string, parent: OrganizationNode | null = null): OrganizationNode | null {
  if (node.id === targetId) return parent;
  for (const c of node.children) {
    const f = findParent(c, targetId, node);
    if (f) return f;
  }
  return null;
}

function countDescendants(n: OrganizationNode): number {
  return n.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}

/** Prefer AXE CORE as constellation center — YOU is identity, not the map. */
function constellationRoot(root: OrganizationNode): OrganizationNode {
  const axe = root.children.find(c => c.id === 'axe-core') ?? root.children[0] ?? root;
  return axe;
}

interface DrawNode {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  label: string;
  detail?: string;
  kind: OrganizationNodeKind;
  status: OrganizationNode['status'];
  childCount: number;
  node: OrganizationNode;
  isCenter?: boolean;
}

export function RuntimeWorkspace() {
  const [root, setRoot] = useState<OrganizationNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const WRef = useRef(900);
  const HRef = useRef(600);
  const panRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const hoveredRef = useRef<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const rootRef = useRef<OrganizationNode | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number; panX: number; panY: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; detail?: string; hint?: string } | null>(null);

  focusRef.current = focusId;
  rootRef.current = root;
  panRef.current = pan;
  scaleRef.current = scale;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await loadAxeOrganization();
      setRoot(snapshot.root);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const focusNode = useMemo(() => {
    if (!root) return null;
    if (focusId) return findNode(root, focusId);
    return constellationRoot(root);
  }, [root, focusId]);

  const selectedNode = useMemo(() => {
    if (!root || !selectedId) return null;
    return findNode(root, selectedId);
  }, [root, selectedId]);

  // ── Canvas draw loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let tick = 0;
    let hits: DrawNode[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      WRef.current = rect.width;
      HRef.current = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const worldToScreen = (x: number, y: number) => {
      const s = scaleRef.current;
      const p = panRef.current;
      return { x: x * s + p.x + WRef.current / 2, y: y * s + p.y + HRef.current / 2 };
    };

    const draw = () => {
      const W = WRef.current;
      const H = HRef.current;
      tick++;
      const t = tick * 0.016;
      const liveRoot = rootRef.current;
      const focus = focusRef.current;
      hits = [];

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Dot field (screen space)
      const gs = 22;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let x = gs / 2; x < W; x += gs) {
        for (let y = gs / 2; y < H; y += gs) {
          ctx.beginPath();
          ctx.arc(x, y, 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!liveRoot) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const centerNode = focus
        ? (findNode(liveRoot, focus) ?? constellationRoot(liveRoot))
        : constellationRoot(liveRoot);

      const hubs = centerNode.children;
      const hubRing = Math.min(W, H) * 0.32 / scaleRef.current;

      // Orbital rings (world → screen)
      const origin = worldToScreen(0, 0);
      for (let i = 1; i <= 4; i++) {
        const rr = (hubRing * i) / 3.2 * scaleRef.current;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.03 + i * 0.008})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Center glow
      const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, hubRing * scaleRef.current * 0.9);
      glow.addColorStop(0, 'rgba(34,211,238,0.07)');
      glow.addColorStop(0.45, 'rgba(232,197,71,0.03)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Dust near center
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2 + t * 0.06;
        const pr = (14 + (i % 8) * 3.5 + Math.sin(t + i) * 2) * scaleRef.current;
        ctx.globalAlpha = 0.2 + Math.sin(t * 2 + i) * 0.08;
        ctx.beginPath();
        ctx.arc(origin.x + Math.cos(a) * pr, origin.y + Math.sin(a) * pr, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 ? GOLD : CREAM;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const centerStyle = KIND_STYLE[centerNode.kind] ?? KIND_STYLE.core;
      const coreR = 20 * Math.min(scaleRef.current, 1.4);

      // Spokes + hubs
      hubs.forEach((hub, i) => {
        const angle = (i / Math.max(hubs.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const wx = Math.cos(angle) * hubRing;
        const wy = Math.sin(angle) * hubRing;
        const screen = worldToScreen(wx, wy);
        const style = KIND_STYLE[hub.kind] ?? KIND_STYLE.core;
        const hr = (12 + Math.min(hub.children.length * 0.4, 6)) * Math.min(scaleRef.current, 1.3);
        const hovered = hoveredRef.current === hub.id;
        const sc = statusColor(hub.status);
        const desc = countDescendants(hub);

        // Spoke
        ctx.beginPath();
        ctx.moveTo(
          origin.x + Math.cos(angle) * (coreR + 6),
          origin.y + Math.sin(angle) * (coreR + 6),
        );
        ctx.lineTo(
          screen.x - Math.cos(angle) * hr,
          screen.y - Math.sin(angle) * hr,
        );
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Gold particle on spoke
        const sig = ((t * 0.12 + i * 0.17) % 1);
        const px = origin.x + (screen.x - origin.x) * (0.15 + sig * 0.7);
        const py = origin.y + (screen.y - origin.y) * (0.15 + sig * 0.7);
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = GOLD;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Tiny leaf stubs
        const stubN = Math.min(hub.children.length, 6);
        for (let s = 0; s < stubN; s++) {
          const sa = angle + ((s / Math.max(stubN - 1, 1)) - 0.5) * 1.0;
          const sr = (18 + (s % 3) * 7) * scaleRef.current;
          ctx.beginPath();
          ctx.moveTo(screen.x, screen.y);
          ctx.lineTo(screen.x + Math.cos(sa) * sr, screen.y + Math.sin(sa) * sr);
          ctx.strokeStyle = `${style.color}35`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(screen.x + Math.cos(sa) * sr, screen.y + Math.sin(sa) * sr, 2, 0, Math.PI * 2);
          ctx.fillStyle = CREAM;
          ctx.globalAlpha = 0.65;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Hub disc
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hr + (hovered ? 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(12,14,20,0.95)';
        ctx.fill();
        ctx.strokeStyle = hovered ? GOLD : style.color;
        ctx.lineWidth = hovered ? 1.8 : 1.2;
        ctx.shadowColor = hovered ? GOLD : style.color;
        ctx.shadowBlur = hovered ? 14 : 6;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Status dot
        ctx.beginPath();
        ctx.arc(screen.x + hr * 0.55, screen.y - hr * 0.55, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = sc;
        ctx.fill();

        ctx.fillStyle = hovered ? GOLD : style.color;
        ctx.font = `${Math.round(11 * Math.min(scaleRef.current, 1.2))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.glyph, screen.x, screen.y);

        // Outer label
        const labelDist = hr + 16 * scaleRef.current;
        const lx = screen.x + Math.cos(angle) * labelDist;
        const ly = screen.y + Math.sin(angle) * labelDist;
        ctx.font = `600 ${Math.round(9 * Math.min(scaleRef.current, 1.15))}px system-ui, sans-serif`;
        ctx.fillStyle = hovered ? CREAM : 'rgba(255,255,255,0.5)';
        ctx.fillText(hub.label.toUpperCase(), lx, ly);
        ctx.font = `${Math.round(8 * Math.min(scaleRef.current, 1.1))}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillText(desc > 0 ? `${desc} nodes` : hub.detail?.slice(0, 24) ?? '', lx, ly + 11);

        hits.push({
          id: hub.id, x: screen.x, y: screen.y, r: hr + 12,
          color: style.color, label: hub.label, detail: hub.detail,
          kind: hub.kind, status: hub.status, childCount: hub.children.length,
          node: hub,
        });
      });

      // Center node
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, coreR + 7, 0, Math.PI * 2);
      ctx.strokeStyle = `${GOLD}55`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, coreR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,12,18,0.96)';
      ctx.fill();
      ctx.strokeStyle = centerNode.kind === 'core' ? CYAN : GOLD;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = centerNode.kind === 'core' ? CYAN : GOLD;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = centerNode.kind === 'core' ? CYAN : GOLD;
      ctx.font = `bold ${Math.round(14 * Math.min(scaleRef.current, 1.2))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(centerStyle.glyph, origin.x, origin.y);

      ctx.font = `600 ${Math.round(10 * Math.min(scaleRef.current, 1.15))}px system-ui, sans-serif`;
      ctx.fillStyle = CREAM;
      ctx.fillText(centerNode.label.toUpperCase(), origin.x, origin.y + coreR + 16);
      if (centerNode.detail) {
        ctx.font = `${Math.round(8 * Math.min(scaleRef.current, 1.1))}px system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillText(centerNode.detail.slice(0, 40), origin.x, origin.y + coreR + 28);
      }

      hits.push({
        id: centerNode.id, x: origin.x, y: origin.y, r: coreR + 12,
        color: centerStyle.color, label: centerNode.label, detail: centerNode.detail,
        kind: centerNode.kind, status: centerNode.status,
        childCount: centerNode.children.length, node: centerNode, isCenter: true,
      });

      (canvas as unknown as { __hits?: DrawNode[] }).__hits = hits;
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    const hitTest = (mx: number, my: number) => {
      const list = (canvas as unknown as { __hits?: DrawNode[] }).__hits ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        const dx = mx - n.x, dy = my - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < n.r) return n;
      }
      return null;
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current?.active) {
        const d = dragRef.current;
        setPan({
          x: d.panX + (e.clientX - d.x),
          y: d.panY + (e.clientY - d.y),
        });
        canvas.style.cursor = 'grabbing';
        return;
      }

      const hov = hitTest(mx, my);
      hoveredRef.current = hov?.id ?? null;
      setTooltip(hov ? {
        x: mx, y: my,
        title: hov.label,
        detail: [hov.detail, hov.childCount ? `${hov.childCount} direct · ${statusColor(hov.status)}` : null].filter(Boolean).join(' · '),
        hint: hov.childCount > 0 && !hov.isCenter ? 'click to enter cluster' : hov.isCenter ? 'center of this view' : 'click to inspect',
      } : null);
      canvas.style.cursor = hov ? 'pointer' : 'grab';
    };

    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hov = hitTest(mx, my);
      if (!hov) {
        dragRef.current = {
          active: true,
          x: e.clientX,
          y: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      }
    };

    const onUp = (e: MouseEvent) => {
      const wasDrag = dragRef.current;
      const moved = wasDrag && (Math.abs(e.clientX - wasDrag.x) > 4 || Math.abs(e.clientY - wasDrag.y) > 4);
      dragRef.current = null;
      if (moved) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hov = hitTest(mx, my);
      if (!hov) return;

      if (hov.childCount > 0 && !hov.isCenter) {
        setFocusId(hov.id);
        setSelectedId(null);
        setPan({ x: 0, y: 0 });
        setScale(1);
        return;
      }
      setSelectedId(hov.id);
    };

    const onLeave = () => {
      hoveredRef.current = null;
      setTooltip(null);
      dragRef.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setScale(s => Math.min(Math.max(s + delta, 0.35), 2.8));
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const drillBack = () => {
    if (!root || !focusId) {
      setFocusId(null);
      return;
    }
    const parent = findParent(root, focusId);
    // Don't go above AXE CORE into YOU — constellation lives under core
    if (!parent || parent.id === 'you') {
      setFocusId(null);
    } else if (parent.id === 'axe-core') {
      setFocusId(null);
    } else {
      setFocusId(parent.id);
    }
    setSelectedId(null);
    setPan({ x: 0, y: 0 });
    setScale(1);
  };

  const tabRoute = selectedNode ? findRouteForRuntimeNodeId(selectedNode.id) : null;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: BG }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />

      {/* Chrome */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        {focusId ? (
          <button
            type="button"
            onClick={drillBack}
            className="text-[10px] tracking-[0.14em] font-medium uppercase"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            ← Back
          </button>
        ) : (
          <span className="text-[9px] tracking-[0.14em] font-medium" style={{ color: CYAN }}>RUNTIME</span>
        )}
        {focusNode && focusId && (
          <span className="text-[11px] font-medium" style={{ color: CREAM }}>{focusNode.label}</span>
        )}
        <span className="text-[8px] hidden sm:inline" style={{ color: 'rgba(255,255,255,0.22)' }}>
          scroll zoom · drag pan · click cluster
        </span>
      </div>

      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        {focusId && (
          <button
            type="button"
            onClick={() => { setFocusId(null); setPan({ x: 0, y: 0 }); setScale(1); }}
            className="rounded-full px-2.5 py-1 text-[9px] font-medium"
            style={{ ...HUD_CHIP_STYLE, color: `${GOLD}cc` }}
          >
            All systems
          </button>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-medium"
          style={{ ...HUD_CHIP_STYLE, color: CYAN }}
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !root && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <motion.div
              className="rounded-full"
              style={{ width: 48, height: 48, border: `1px solid ${CYAN}55`, boxShadow: `0 0 24px ${CYAN}33` }}
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <div className="text-[11px] tracking-wide" style={{ color: `${CYAN}aa` }}>Assembling constellation</div>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-14 right-3 z-20 flex flex-col gap-1">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={HUD_CHIP_STYLE}>
          <button type="button" onClick={() => setScale(s => Math.min(s + 0.15, 2.8))} className="p-1" style={{ color: CYAN }}><ZoomIn size={12} /></button>
          <span className="text-[9px] font-mono w-8 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale(s => Math.max(s - 0.15, 0.35))} className="p-1" style={{ color: CYAN }}><ZoomOut size={12} /></button>
        </div>
        <button
          type="button"
          onClick={() => { setPan({ x: 0, y: 0 }); setScale(1); }}
          className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[8px]"
          style={{ ...HUD_CHIP_STYLE, color: 'rgba(255,255,255,0.4)' }}
        >
          <Move size={10} /> Reset
        </button>
      </div>

      <div className="absolute bottom-14 left-3 z-20 flex flex-col gap-1 px-2 py-1.5 rounded-lg" style={HUD_CHIP_STYLE}>
        {[
          { c: '#10B981', l: 'Online' },
          { c: CYAN, l: 'Configured' },
          { c: '#F59E0B', l: 'Degraded' },
          { c: '#EF4444', l: 'Offline' },
        ].map(s => (
          <div key={s.l} className="flex items-center gap-1.5">
            <span className="rounded-full" style={{ width: 6, height: 6, background: s.c, boxShadow: `0 0 5px ${s.c}` }} />
            <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.l}</span>
          </div>
        ))}
      </div>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-30 px-3 py-2 rounded-lg"
          style={{
            left: Math.min(tooltip.x + 14, WRef.current - 240),
            top: Math.max(8, tooltip.y - 8),
            transform: 'translateY(-100%)',
            background: 'rgba(10,12,18,0.96)',
            border: `1px solid ${GOLD}30`,
            maxWidth: 260,
          }}
        >
          <div className="text-[11px] font-semibold" style={{ color: CREAM }}>{tooltip.title}</div>
          {tooltip.detail && (
            <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.42)' }}>{tooltip.detail}</div>
          )}
          {tooltip.hint && (
            <div className="text-[8px] mt-1 tracking-wide" style={{ color: `${GOLD}99` }}>{tooltip.hint}</div>
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedNode && (
          <RuntimeInspector
            node={selectedNode}
            accentColor={KIND_STYLE[selectedNode.kind]?.color ?? CYAN}
            onClose={() => setSelectedId(null)}
            onSaved={() => void load()}
          />
        )}
      </AnimatePresence>

      {tabRoute && selectedNode && (
        <button
          type="button"
          onClick={() => navigate(tabRoute)}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium"
          style={{ background: `${CYAN}18`, border: `1px solid ${CYAN}44`, color: CYAN }}
        >
          <ExternalLink size={11} /> Open {selectedNode.label} tab
        </button>
      )}

      <RuntimeStatusBar root={root} />
    </div>
  );
}
