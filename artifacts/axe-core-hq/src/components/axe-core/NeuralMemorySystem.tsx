import { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceStore } from '@/store/voiceStore';

/* ══════════════════════════════════════════════════════════════════════════
   Neural Memory System — AXE CORE
   Canvas-rendered living brain map of all global memories.
   Central AXE node → 6 category hubs → individual memory leaves.
   Traveling signal pulses, glow halos, hover tooltips.
   ══════════════════════════════════════════════════════════════════════════ */

const CAT_META = {
  agent_performance:    { color: '#22D3EE', label: 'Agents',        icon: '🤖' },
  provider_performance: { color: '#8B5CF6', label: 'Providers',     icon: '⚡' },
  specialist_match:     { color: '#10B981', label: 'Specialists',   icon: '🎯' },
  conversation_context: { color: '#F97316', label: 'Conversations', icon: '💬' },
  user_preference:      { color: '#EC4899', label: 'Preferences',   icon: '⚙️' },
  system_event:         { color: '#EAB308', label: 'Events',        icon: '📡' },
} as const;
const CAT_ORDER = Object.keys(CAT_META) as (keyof typeof CAT_META)[];

interface NNode {
  id: string;
  x: number; y: number;
  r: number;
  color: string;
  label: string;
  detail?: string;
  kind: 'core' | 'hub' | 'leaf' | 'route';
  phase: number;
  opacity: number;
}
interface NEdge {
  from: string; to: string;
  color: string;
  sig: number;   // 0-1 traveling position
  speed: number;
}
interface MemEntry {
  id?: string;
  category: string;
  key: string;
  value: string;
}
interface RouteEntry {
  capability?: string;
  winner?: string;
}

export function NeuralMemorySystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voice = useVoiceStore();
  const rafRef   = useRef<number>(0);
  const nodesRef = useRef<NNode[]>([]);
  const edgesRef = useRef<NEdge[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const WRef = useRef(800);
  const HRef = useRef(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: NNode } | null>(null);
  const [memCount, setMemCount] = useState(0);

  const buildGraph = useCallback(() => {
    const W = WRef.current;
    const H = HRef.current;
    const cx = W / 2;
    const cy = H / 2;

    let mems: MemEntry[] = [];
    try { mems = JSON.parse(localStorage.getItem('axe_global_memory_cache') || '[]'); } catch { /* ignore */ }
    setMemCount(mems.length);

    const routeLog: RouteEntry[] = voice.routingLog ?? [];
    const nodes: NNode[] = [];
    const edges: NEdge[] = [];

    // ── Central AXE Core ───────────────────────────────────────────────────
    nodes.push({
      id: 'core', x: cx, y: cy, r: 26,
      color: '#22D3EE',
      label: 'AXE',
      detail: `${mems.length} memories · ${routeLog.length} routes · ${voice.conversation.length} messages`,
      kind: 'core', phase: 0, opacity: 1,
    });

    // ── Category hubs in a ring ────────────────────────────────────────────
    const hubRing = Math.min(W, H) * 0.30;
    const leafRing = Math.min(W, H) * 0.13;

    CAT_ORDER.forEach((cat, i) => {
      const meta = CAT_META[cat];
      const catMems = mems.filter(m => m.category === cat);
      const angle = (i / CAT_ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const hx = cx + Math.cos(angle) * hubRing;
      const hy = cy + Math.sin(angle) * hubRing;
      const hubId = `hub-${cat}`;

      nodes.push({
        id: hubId, x: hx, y: hy,
        r: 12 + Math.min(catMems.length * 0.8, 8),
        color: meta.color,
        label: meta.label,
        detail: `${catMems.length} entries`,
        kind: 'hub',
        phase: (i / CAT_ORDER.length) * Math.PI * 2,
        opacity: catMems.length > 0 ? 1 : 0.3,
      });

      edges.push({
        from: 'core', to: hubId,
        color: meta.color,
        sig: i / CAT_ORDER.length,
        speed: 0.0035 + i * 0.0004,
      });

      // Leaf memory nodes
      const visible = catMems.slice(0, 7);
      visible.forEach((mem, j) => {
        const spread = Math.PI * 0.6;
        const leafAngle = angle + (visible.length === 1 ? 0 : ((j / (visible.length - 1)) - 0.5) * spread);
        const leafId = `leaf-${mem.id ?? `${cat}-${j}`}`;
        let detail = '';
        try { detail = JSON.stringify(JSON.parse(mem.value)).slice(0, 100); } catch { detail = String(mem.value ?? '').slice(0, 100); }
        nodes.push({
          id: leafId,
          x: hx + Math.cos(leafAngle) * leafRing,
          y: hy + Math.sin(leafAngle) * leafRing,
          r: 5,
          color: meta.color,
          label: mem.key.length > 20 ? `${mem.key.slice(0, 20)}…` : mem.key,
          detail,
          kind: 'leaf',
          phase: Math.random() * Math.PI * 2,
          opacity: 0.8,
        });
        edges.push({ from: hubId, to: leafId, color: meta.color, sig: Math.random(), speed: 0.006 + Math.random() * 0.006 });
      });
    });

    // ── Recent routing log — tight orbit around core ────────────────────────
    const recentRoutes = routeLog.slice(-8);
    recentRoutes.forEach((route, i) => {
      const angle = (i / recentRoutes.length) * Math.PI * 2;
      const orbitR = 54;
      const routeId = `route-${i}`;
      nodes.push({
        id: routeId,
        x: cx + Math.cos(angle) * orbitR,
        y: cy + Math.sin(angle) * orbitR,
        r: 4,
        color: '#34D399',
        label: route.winner ?? 'route',
        detail: `${route.capability ?? '?'} → ${route.winner ?? '?'}`,
        kind: 'route',
        phase: Math.random() * Math.PI * 2,
        opacity: 0.65,
      });
      edges.push({ from: 'core', to: routeId, color: '#34D399', sig: Math.random(), speed: 0.014 });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [voice.routingLog, voice.conversation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let tick = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      WRef.current = rect.width;
      HRef.current = rect.height;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      buildGraph();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const W = WRef.current;
      const H = HRef.current;
      tick++;
      const t = tick * 0.016;

      ctx.clearRect(0, 0, W, H);

      // ── Background ─────────────────────────────────────────────────────
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(34,211,238,0.022)';
      ctx.lineWidth = 0.5;
      const gs = 42;
      for (let x = 0; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Advance pulses
      for (const e of edgesRef.current) e.sig = (e.sig + e.speed) % 1;

      const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

      // ── Edges ───────────────────────────────────────────────────────────
      for (const e of edgesRef.current) {
        const A = nodeMap.get(e.from);
        const B = nodeMap.get(e.to);
        if (!A || !B) continue;

        // Dim base line
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = `${e.color}18`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Traveling signal dot
        const px = A.x + (B.x - A.x) * e.sig;
        const py = A.y + (B.y - A.y) * e.sig;
        const fade = Math.sin(e.sig * Math.PI); // soften at endpoints
        ctx.globalAlpha = fade * 0.85;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 9;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // ── Nodes — back-to-front ────────────────────────────────────────────
      const ORDER: NNode['kind'][] = ['leaf', 'route', 'hub', 'core'];
      const sorted = [...nodesRef.current].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

      for (const node of sorted) {
        const hovered = hoveredRef.current === node.id;
        const pulse = 1 + Math.sin(t * (node.kind === 'core' ? 2.4 : 1.7) + node.phase) * 0.06;
        const r = node.r * (hovered ? 1.45 : pulse);

        ctx.globalAlpha = node.opacity;

        // Glow halo
        const glowR = r + (node.kind === 'core' ? 50 : node.kind === 'hub' ? 22 : 11);
        const grd = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
        grd.addColorStop(0,   `${node.color}55`);
        grd.addColorStop(0.5, `${node.color}14`);
        grd.addColorStop(1,   'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = node.kind === 'core' ? '#010f14' : `${node.color}1a`;
        ctx.fill();
        ctx.strokeStyle = node.color;
        ctx.lineWidth = node.kind === 'leaf' ? 1 : 1.5;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = hovered ? 20 : (node.kind === 'core' ? 18 : 8);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // ── Core special: concentric rings + ⚡ ──────────────────────────
        if (node.kind === 'core') {
          [1.65, 2.15, 2.75].forEach((mult, ri) => {
            const ringR = r * (mult + Math.sin(t * 1.6 + ri * 1.1) * 0.04);
            ctx.beginPath();
            ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `${node.color}${['28', '15', '0a'][ri]}`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          });
          // spinning dashes ring
          const dashR = r * 1.95;
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(t * 0.4);
          ctx.setLineDash([6, 14]);
          ctx.beginPath();
          ctx.arc(0, 0, dashR, 0, Math.PI * 2);
          ctx.strokeStyle = `${node.color}22`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          ctx.font = `bold ${Math.round(r * 0.72)}px monospace`;
          ctx.fillStyle = node.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 14;
          ctx.fillText('⚡', node.x, node.y);
          ctx.shadowBlur = 0;

          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = `${node.color}cc`;
          ctx.textBaseline = 'top';
          ctx.fillText('AXE CORE', node.x, node.y + r + 10);
        }

        // ── Hub: emoji icon + label ───────────────────────────────────────
        if (node.kind === 'hub') {
          const cat = node.id.replace('hub-', '') as keyof typeof CAT_META;
          const icon = CAT_META[cat]?.icon ?? '●';
          ctx.font = `${Math.round(r * 0.72)}px monospace`;
          ctx.fillStyle = node.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icon, node.x, node.y);

          ctx.font = '8.5px monospace';
          ctx.fillStyle = `${node.color}cc`;
          ctx.textBaseline = 'top';
          ctx.fillText(node.label, node.x, node.y + r + 4);
        }
      }

      // ── Hover crosshair ─────────────────────────────────────────────────
      if (hoveredRef.current) {
        const hn = nodeMap.get(hoveredRef.current);
        if (hn) {
          ctx.strokeStyle = `${hn.color}18`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(hn.x, 0); ctx.lineTo(hn.x, H); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, hn.y); ctx.lineTo(W, hn.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    // Mouse interaction
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let hov: string | null = null;
      let hovNode: NNode | null = null;
      for (const n of nodesRef.current) {
        const dx = mx - n.x, dy = my - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < n.r + 10) { hov = n.id; hovNode = n; break; }
      }
      hoveredRef.current = hov;
      setTooltip(hovNode ? { x: mx, y: my, node: hovNode } : null);
    };
    const onLeave = () => { hoveredRef.current = null; setTooltip(null); };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [buildGraph]);

  return (
    <div className="absolute inset-0" style={{ background: '#000' }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />

      {/* Category legend */}
      <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        {CAT_ORDER.map(cat => {
          const meta = CAT_META[cat];
          return (
            <span key={cat} className="flex items-center gap-1 text-[8px] font-mono" style={{ color: `${meta.color}99` }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, display: 'inline-block', boxShadow: `0 0 4px ${meta.color}` }} />
              {meta.label}
            </span>
          );
        })}
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(52,211,153,0.6)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', display: 'inline-block', boxShadow: '0 0 4px #34D399' }} />
          Live Routes
        </span>
      </div>

      {/* Node count */}
      <div className="absolute bottom-3 right-4 text-[8px] font-mono" style={{ color: 'rgba(34,211,238,0.35)' }}>
        NEURAL MEMORY SYS · {memCount} NODES ACTIVE
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 px-2.5 py-2 rounded-lg"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y,
            transform: 'translateY(-100%)',
            background: 'rgba(0,5,12,0.97)',
            border: `1px solid ${tooltip.node.color}44`,
            boxShadow: `0 0 20px ${tooltip.node.color}18`,
            maxWidth: 240,
          }}
        >
          <div className="text-[10px] font-bold mb-0.5" style={{ color: tooltip.node.color }}>
            {tooltip.node.label}
          </div>
          {tooltip.node.detail && (
            <div className="text-[9px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {tooltip.node.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
