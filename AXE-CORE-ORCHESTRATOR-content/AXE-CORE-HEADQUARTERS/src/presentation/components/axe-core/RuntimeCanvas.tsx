/**
 * RuntimeCanvas — premium constellation of the live AXE organization.
 * Skilltree-style: click hub with children to zoom in; labels ABOVE nodes.
 */
import { useState, useRef, useCallback, useEffect, useMemo, type ComponentType, type CSSProperties } from 'react';
import { PlaatPanel, PlaatDock } from '@/presentation/components/layout/PlaatSlots';
import { AnimatePresence } from 'framer-motion';
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
import { subscribeAxeEvent } from '@/infrastructure/events/eventBus';

const KIND_STYLE: Record<OrganizationNodeKind, { color: string; icon: ComponentType<{ size: number; style?: CSSProperties }>; glyph: string }> = {
  user: { color: '#E5E7EB', icon: User, glyph: 'U' },
  core: { color: 'var(--accent-cyan)', icon: Brain, glyph: 'A' },
  executive: { color: 'var(--warning)', icon: Sparkles, glyph: 'E' },
  orchestrator: { color: 'var(--warning)', icon: Network, glyph: 'O' },
  specialist: { color: '#60A5FA', icon: Activity, glyph: 'S' },
  application: { color: '#A78BFA', icon: LayoutGrid, glyph: 'P' },
  provider: { color: 'var(--success)', icon: Server, glyph: 'V' },
  model: { color: '#6EE7B7', icon: Cpu, glyph: 'M' },
  coding_system: { color: '#A3E635', icon: Code2, glyph: 'C' },
  research_system: { color: '#38BDF8', icon: Search, glyph: 'R' },
  tool: { color: '#F472B6', icon: Wrench, glyph: 'T' },
  mcp: { color: '#FB7185', icon: Plug, glyph: 'X' },
  service: { color: '#FB923C', icon: Server, glyph: 'V' },
  memory: { color: '#E879F9', icon: Database, glyph: 'N' },
  infrastructure: { color: 'var(--error)', icon: Server, glyph: 'I' },
  health: { color: 'var(--accent-cyan)', icon: HeartPulse, glyph: 'H' },
};

const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
/* Stays a literal on purpose. Canvas 2D (ctx.fillStyle) and three.js
 * parse colour strings themselves and do not resolve CSS variables —
 * they ignore var(--x) silently, with no error, so a token here breaks
 * the render in a way nothing catches. Tokens are for CSS only. */
const BG = '#000000';
const CYAN = 'var(--accent-cyan)';

function statusColor(status: OrganizationNode['status']) {
  switch (status) {
    case 'online':
    case 'healthy': return 'var(--success)';
    case 'configured': return CYAN;
    case 'degraded': return 'var(--warning)';
    case 'offline': return 'var(--error)';
    default: return '#6B7280';
  }
}

function findNode(root: OrganizationNode, id: string): OrganizationNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function findParent(root: OrganizationNode, id: string, parent: OrganizationNode | null = null): OrganizationNode | null {
  if (root.id === id) return parent;
  for (const c of root.children ?? []) {
    const f = findParent(c, id, root);
    if (f) return f;
  }
  return null;
}

function constellationRoot(root: OrganizationNode): OrganizationNode {
  // Prefer AXE CORE hub if present
  const axe = findNode(root, 'axe-core') ?? findNode(root, 'axe-root') ?? root;
  return axe.children?.length ? axe : root;
}

type DrawNode = {
  id: string; x: number; y: number; r: number; color: string; label: string;
  detail?: string; kind: OrganizationNodeKind; status?: OrganizationNode['status'];
  childCount: number; node: OrganizationNode; isCenter?: boolean;
};

export function RuntimeWorkspace() {
  const navigate = useNavigate();
  const [root, setRoot] = useState<OrganizationNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; detail: string; hint: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rootRef = useRef<OrganizationNode | null>(null);
  const focusRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number; panX: number; panY: number } | null>(null);
  const WRef = useRef(800);
  const HRef = useRef(500);

  scaleRef.current = scale;
  panRef.current = pan;
  rootRef.current = root;
  focusRef.current = focusId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await loadAxeOrganization();
      setRoot(snapshot.root);
    } catch (e) {
      console.warn('[RuntimeCanvas] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeAxeEvent('axe:skills-changed', () => { void load(); }), [load]);

  const focusNode = useMemo(() => {
    if (!root) return null;
    if (focusId) return findNode(root, focusId);
    return constellationRoot(root);
  }, [root, focusId]);

  const selectedNode = useMemo(() => {
    if (!root || !selectedId) return null;
    return findNode(root, selectedId);
  }, [root, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    let hits: DrawNode[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      const W = parent?.clientWidth ?? 800;
      const H = parent?.clientHeight ?? 500;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      WRef.current = W;
      HRef.current = H;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);

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
      hits = [];

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Subtle starfield
      ctx.fillStyle = 'rgba(255,255,255,0.028)';
      const gs = 26;
      for (let x = gs / 2; x < W; x += gs) {
        for (let y = gs / 2; y < H; y += gs) {
          ctx.beginPath();
          ctx.arc(x, y, 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!liveRoot) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const focus = focusRef.current;
      const centerNode = focus
        ? (findNode(liveRoot, focus) ?? constellationRoot(liveRoot))
        : constellationRoot(liveRoot);

      const hubs = centerNode.children ?? [];
      const hubRing = Math.min(W, H) * 0.33 / scaleRef.current;
      const origin = worldToScreen(0, 0);
      const coreR = 28 * scaleRef.current;

      // Orbital rings
      for (let i = 1; i <= 5; i++) {
        const rr = (hubRing * i) / 3.6 * scaleRef.current;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.025 + i * 0.006})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const breath = 0.9 + Math.sin(t * 1.4) * 0.08;
      const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, hubRing * scaleRef.current * breath);
      glow.addColorStop(0, 'rgba(34,211,238,0.09)');
      glow.addColorStop(0.4, 'rgba(34,211,238,0.03)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Floating particles
      for (let i = 0; i < 56; i++) {
        const a = (i / 56) * Math.PI * 2 + t * (0.05 + (i % 5) * 0.01);
        const pr = (12 + (i % 9) * 3.2 + Math.sin(t * 1.5 + i) * 2.5) * scaleRef.current;
        ctx.globalAlpha = 0.18 + Math.sin(t * 2.2 + i) * 0.1;
        ctx.beginPath();
        ctx.arc(origin.x + Math.cos(a) * pr, origin.y + Math.sin(a) * pr, 0.7 + (i % 3) * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = i % 4 === 0 ? GOLD : CREAM;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const n = Math.max(hubs.length, 1);
      hubs.forEach((hub, i) => {
        const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const wx = Math.cos(angle) * hubRing;
        const wy = Math.sin(angle) * hubRing;
        const screen = worldToScreen(wx, wy);
        const style = KIND_STYLE[hub.kind ?? 'application'] ?? KIND_STYLE.application;
        const hr = (14 + Math.min((hub.children?.length ?? 0), 8)) * scaleRef.current;
        const hovered = hoveredRef.current === hub.id;
        const sc = statusColor(hub.status);
        const desc = hub.children?.length ?? 0;

        // Spoke
        ctx.beginPath();
        ctx.moveTo(origin.x + Math.cos(angle) * (coreR + 6), origin.y + Math.sin(angle) * (coreR + 6));
        ctx.lineTo(screen.x - Math.cos(angle) * hr, screen.y - Math.sin(angle) * hr);
        ctx.strokeStyle = `${style.color}55`;
        ctx.lineWidth = 1.1;
        ctx.stroke();

        // Energy pulse on spoke
        const sig = ((t * 0.2 + i * 0.15) % 1);
        const px = origin.x + Math.cos(angle) * (coreR + 6 + (hubRing * scaleRef.current - coreR - hr) * sig);
        const py = origin.y + Math.sin(angle) * (coreR + 6 + (hubRing * scaleRef.current - coreR - hr) * sig);
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = GOLD;
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Child stubs
        const stubN = Math.min(desc, 6);
        for (let s = 0; s < stubN; s++) {
          const sa = angle + ((s / Math.max(stubN - 1, 1)) - 0.5) * 0.95;
          const sr = (16 + (s % 3) * 6.5) * scaleRef.current;
          ctx.beginPath();
          ctx.moveTo(screen.x, screen.y);
          ctx.lineTo(screen.x + Math.cos(sa) * sr, screen.y + Math.sin(sa) * sr);
          ctx.strokeStyle = `${style.color}40`;
          ctx.lineWidth = 0.85;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(screen.x + Math.cos(sa) * sr, screen.y + Math.sin(sa) * sr, 1.9, 0, Math.PI * 2);
          ctx.fillStyle = CREAM;
          ctx.globalAlpha = 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hr + (hovered ? 2.5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fill();
        ctx.strokeStyle = hovered ? GOLD : style.color;
        ctx.lineWidth = hovered ? 2 : 1.35;
        ctx.shadowColor = hovered ? GOLD : style.color;
        ctx.shadowBlur = hovered ? 16 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Status dot
        ctx.beginPath();
        ctx.arc(screen.x + hr * 0.58, screen.y - hr * 0.58, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = sc;
        ctx.shadowColor = sc;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Glyph
        ctx.fillStyle = hovered ? GOLD : style.color;
        ctx.font = `600 ${Math.round(11 * Math.min(scaleRef.current, 1.15))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.glyph, screen.x, screen.y);

        // Labels ALWAYS ABOVE node
        const lx = screen.x;
        const ly = screen.y - hr - 18 * Math.min(scaleRef.current, 1.3);
        const labelSize = Math.round(11 * Math.min(scaleRef.current, 1.2));
        ctx.font = `600 ${labelSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = hovered ? CREAM : 'rgba(255,255,255,0.9)';
        ctx.fillText(hub.label.toUpperCase(), lx, ly);
        ctx.font = `${Math.max(8, labelSize - 2)}px system-ui, sans-serif`;
        ctx.fillStyle = hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.42)';
        const sub = hub.detail?.slice(0, 32) || (desc > 0 ? `${desc} nodes · click to zoom` : '');
        ctx.textBaseline = 'top';
        ctx.fillText(sub, lx, ly + 2);
        ctx.shadowBlur = 0;

        hits.push({
          id: hub.id, x: screen.x, y: screen.y, r: hr + 14,
          color: style.color, label: hub.label, detail: hub.detail,
          kind: hub.kind ?? 'application', status: hub.status, childCount: desc,
          node: hub,
        });
      });

      // Center hub
      const centerStyle = KIND_STYLE[centerNode.kind ?? 'core'] ?? KIND_STYLE.core;
      const corePulse = 1 + Math.sin(t * 2) * 0.05;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, (coreR + 8) * corePulse, 0, Math.PI * 2);
      ctx.strokeStyle = `${CYAN}40`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, coreR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.95)';
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = GOLD;
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(centerStyle.glyph, origin.x, origin.y);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillStyle = CREAM;
      ctx.fillText(centerNode.label.toUpperCase(), origin.x, origin.y + coreR + 16);
      if (centerNode.detail) {
        ctx.font = '9px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(centerNode.detail.slice(0, 42), origin.x, origin.y + coreR + 28);
      }

      hits.push({
        id: centerNode.id, x: origin.x, y: origin.y, r: coreR + 12,
        color: centerStyle.color, label: centerNode.label, detail: centerNode.detail,
        kind: centerNode.kind ?? 'core', status: centerNode.status,
        childCount: centerNode.children?.length ?? 0, node: centerNode, isCenter: true,
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
        setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
        canvas.style.cursor = 'grabbing';
        return;
      }
      const hov = hitTest(mx, my);
      hoveredRef.current = hov?.id ?? null;
      setTooltip(hov ? {
        x: mx, y: my, title: hov.label,
        detail: [hov.detail, hov.childCount ? `${hov.childCount} children` : null].filter(Boolean).join(' · '),
        hint: hov.childCount > 0 && !hov.isCenter ? 'click to zoom in' : hov.isCenter ? 'cluster root' : 'click to inspect',
      } : null);
      canvas.style.cursor = hov ? 'pointer' : 'grab';
    };

    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (!hitTest(mx, my)) {
        dragRef.current = { active: true, x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
      }
    };

    const onUp = (e: MouseEvent) => {
      const wasDrag = dragRef.current;
      const moved = wasDrag && (Math.abs(e.clientX - wasDrag.x) > 4 || Math.abs(e.clientY - wasDrag.y) > 4);
      dragRef.current = null;
      if (moved) return;
      const rect = canvas.getBoundingClientRect();
      const hov = hitTest(e.clientX - rect.left, e.clientY - rect.top);
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

    const onLeave = () => { hoveredRef.current = null; setTooltip(null); dragRef.current = null; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale(s => Math.min(Math.max(s + (e.deltaY > 0 ? -0.08 : 0.08), 0.35), 2.8));
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const drillBack = () => {
    if (!root || !focusId) { setFocusId(null); return; }
    const parent = findParent(root, focusId);
    setFocusId(parent && parent.id !== constellationRoot(root).id ? parent.id : null);
    setSelectedId(null);
    setPan({ x: 0, y: 0 });
    setScale(1);
  };

  const tabRoute = selectedNode ? findRouteForRuntimeNodeId(selectedNode.id) : null;

  return (
    <div className="axe-scene-vlak absolute inset-0 overflow-hidden" style={{ background: BG }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="axe-scene-kruimel absolute top-3 left-3 z-20 flex items-center gap-2 flex-wrap max-w-[70%]">
        {focusId ? (
          <button type="button" onClick={drillBack} className="text-[10px] tracking-[0.14em] font-medium uppercase px-2 py-1 rounded-full" style={{ color: CREAM, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>← Back</button>
        ) : (
          <span className="text-[9px] font-mono-data tracking-[0.2em]" style={{ color: CYAN }}>ARCHITECTURE</span>
        )}
        {focusNode && focusId && (
          <span className="text-[11px] font-medium" style={{ color: CREAM }}>{focusNode.label}</span>
        )}
        {loading && <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>loading…</span>}
      </div>

      {/* Verversen, zoomen en resetten stonden op `top-3 right-3` -- precies
          waar nu de klok en de iconen van de schil staan. Ze horen in het dock:
          knoppen die bij WAT JE ZIET horen, boven de chatplaat, op dezelfde
          hoogte als op elke andere tab. */}
      <PlaatDock>
        <button type="button" onClick={() => void load()} className="p-1.5 rounded-lg" style={{ color: CYAN }} title="Verversen"><RefreshCw size={13} /></button>
        <button type="button" onClick={() => setScale(s => Math.min(s + 0.15, 2.8))} className="p-1.5 rounded-lg" style={{ color: CYAN }} title="Inzoomen"><ZoomIn size={13} /></button>
        <button type="button" onClick={() => setScale(s => Math.max(s - 0.15, 0.35))} className="p-1.5 rounded-lg" style={{ color: CYAN }} title="Uitzoomen"><ZoomOut size={13} /></button>
        <button type="button" onClick={() => { setPan({ x: 0, y: 0 }); setScale(1); }} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px]" style={{ color: 'var(--text-muted)' }} title="Back to center">
          <Move size={11} /> Reset
        </button>
      </PlaatDock>

      {/* De legenda stond linksonder op `bottom-14` -- daar zit nu de chatplaat,
          dus hij lag erachter. Hij hoort in het linkerslot: dan bepaalt de
          schil waar hij staat en botst hij nooit meer met het chroom. */}
      <PlaatPanel side="left" title="Legenda">
        {[{ c: 'var(--success)', l: 'Online' }, { c: CYAN, l: 'Configured' }, { c: 'var(--warning)', l: 'Degraded' }, { c: 'var(--error)', l: 'Offline' }].map(s => (
          <div key={s.l} className="flex items-center gap-2">
            <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: s.c, boxShadow: `0 0 5px ${s.c}` }} />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{s.l}</span>
          </div>
        ))}
      </PlaatPanel>

      {tooltip && (
        <div className="absolute pointer-events-none z-30 px-3 py-2 rounded-lg" style={{ left: Math.min(tooltip.x + 14, (WRef.current || 800) - 240), top: Math.max(8, tooltip.y - 8), transform: 'translateY(-100%)', background: 'rgba(0,0,0,0.94)', border: `1px solid ${GOLD}30`, maxWidth: 260 }}>
          <div className="text-[11px] font-semibold" style={{ color: CREAM }}>{tooltip.title}</div>
          {tooltip.detail && <div className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.42)' }}>{tooltip.detail}</div>}
          {tooltip.hint && <div className="text-[8px] mt-1 tracking-wide" style={{ color: `${GOLD}99` }}>{tooltip.hint}</div>}
        </div>
      )}

      <AnimatePresence>
        {selectedNode && (
          <RuntimeInspector node={selectedNode} accentColor={KIND_STYLE[selectedNode.kind ?? 'core']?.color ?? CYAN} onClose={() => setSelectedId(null)} onSaved={() => void load()} />
        )}
      </AnimatePresence>

      {tabRoute && selectedNode && (
        <button type="button" onClick={() => navigate(tabRoute)} className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium" style={{ background: `${CYAN}18`, border: `1px solid ${CYAN}44`, color: CYAN }}>
          <ExternalLink size={11} /> Open {selectedNode.label} tab
        </button>
      )}

      <RuntimeStatusBar root={root} />
    </div>
  );
}

export default RuntimeWorkspace;
