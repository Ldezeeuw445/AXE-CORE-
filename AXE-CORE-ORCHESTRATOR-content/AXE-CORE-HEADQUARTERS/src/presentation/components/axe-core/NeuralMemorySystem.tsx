import { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';

/* ══════════════════════════════════════════════════════════════════════════
   Neural Memory System — AXE SUPER BRAIN
   One living canvas for the full durable library:
     Core → Global hubs · RAG Facts · Obsidian notes · live routes
   Traveling pulses, glow, hover tooltips, optional wikilink edges.
   ══════════════════════════════════════════════════════════════════════════ */

const GLOBAL_CATS = {
  user_preference:      { color: '#EC4899', label: 'Preferences', icon: '⚙️' },
  agent_performance:    { color: '#22D3EE', label: 'Agents',      icon: '🤖' },
  conversation_context: { color: '#F97316', label: 'Conversations', icon: '💬' },
  system_event:         { color: '#EAB308', label: 'Events',       icon: '📡' },
  provider_performance: { color: '#8B5CF6', label: 'Providers',    icon: '⚡' },
  specialist_match:     { color: '#10B981', label: 'Specialists',  icon: '🎯' },
} as const;

type GlobalCat = keyof typeof GLOBAL_CATS;

const LAYER_META = {
  rag:      { color: '#A78BFA', label: 'RAG Facts',  icon: '🧠' },
  obsidian: { color: '#22D3EE', label: 'Obsidian',   icon: '📓' },
} as const;

interface NNode {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  label: string;
  detail?: string;
  kind: 'core' | 'hub' | 'leaf' | 'route';
  phase: number;
  opacity: number;
  icon?: string;
}

interface NEdge {
  from: string;
  to: string;
  color: string;
  sig: number;
  speed: number;
  link?: boolean;
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

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'AXE';
}

export function NeuralMemorySystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voice = useVoiceStore();
  const rafRef = useRef(0);
  const nodesRef = useRef<NNode[]>([]);
  const edgesRef = useRef<NEdge[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const WRef = useRef(800);
  const HRef = useRef(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: NNode } | null>(null);
  const [counts, setCounts] = useState({ global: 0, rag: 0, notes: 0, total: 0 });

  // Async durable stores (localStorage fallbacks live inside the services)
  const notesRef = useRef<ObsidianNote[]>([]);
  const ragRef = useRef<RagMemory[]>([]);

  const buildGraph = useCallback(() => {
    const W = WRef.current;
    const H = HRef.current;
    const cx = W / 2;
    const cy = H / 2;

    let mems: MemEntry[] = [];
    try {
      mems = JSON.parse(localStorage.getItem('axe_global_memory_cache') || '[]');
    } catch {
      /* ignore */
    }

    // Also surface offline RAG / notes if async not ready yet
    let rag = ragRef.current;
    let notes = notesRef.current;
    if (!rag.length) {
      try {
        rag = JSON.parse(localStorage.getItem('axe_rag_memory') || '[]');
      } catch {
        /* */
      }
    }
    if (!notes.length) {
      try {
        notes = JSON.parse(localStorage.getItem('axe_obsidian_local_cache') || '[]');
      } catch {
        /* */
      }
    }

    const routeLog: RouteEntry[] = voice.routingLog ?? [];
    const total = mems.length + rag.length + notes.length;
    setCounts({
      global: mems.length,
      rag: rag.length,
      notes: notes.length,
      total,
    });

    const nodes: NNode[] = [];
    const edges: NEdge[] = [];

    // ── Core ──────────────────────────────────────────────────────────────
    nodes.push({
      id: 'core',
      x: cx,
      y: cy,
      r: 28,
      color: '#22D3EE',
      label: 'AXE',
      detail: `Super brain · ${mems.length} global · ${rag.length} RAG · ${notes.length} notes · ${routeLog.length} routes`,
      kind: 'core',
      phase: 0,
      opacity: 1,
    });

    // Build ordered hub list: active global cats first, then RAG + Obsidian always
    type HubSpec = {
      id: string;
      color: string;
      label: string;
      icon: string;
      leaves: Array<{ id: string; label: string; detail: string }>;
    };

    const hubs: HubSpec[] = [];

    (Object.keys(GLOBAL_CATS) as GlobalCat[]).forEach((cat) => {
      const meta = GLOBAL_CATS[cat];
      const catMems = mems.filter((m) => m.category === cat);
      if (catMems.length === 0 && cat !== 'user_preference' && cat !== 'system_event') return;
      hubs.push({
        id: `hub-g-${cat}`,
        color: meta.color,
        label: meta.label,
        icon: meta.icon,
        leaves: catMems.slice(0, 6).map((mem, j) => {
          let detail = '';
          try {
            detail = JSON.stringify(JSON.parse(mem.value)).slice(0, 110);
          } catch {
            detail = String(mem.value ?? '').slice(0, 110);
          }
          return {
            id: `leaf-g-${mem.id ?? `${cat}-${j}`}`,
            label: mem.key.length > 18 ? `${mem.key.slice(0, 18)}…` : mem.key,
            detail,
          };
        }),
      });
    });

    // RAG hub
    hubs.push({
      id: 'hub-rag',
      color: LAYER_META.rag.color,
      label: LAYER_META.rag.label,
      icon: LAYER_META.rag.icon,
      leaves: rag.slice(0, 8).map((m, j) => ({
        id: `leaf-rag-${m.id ?? j}`,
        label:
          (m.content || '').slice(0, 22) +
          ((m.content || '').length > 22 ? '…' : ''),
        detail: `[${m.category} · i${m.importance}] ${(m.content || '').slice(0, 140)}`,
      })),
    });

    // Obsidian hub
    hubs.push({
      id: 'hub-obsidian',
      color: LAYER_META.obsidian.color,
      label: LAYER_META.obsidian.label,
      icon: LAYER_META.obsidian.icon,
      leaves: notes.slice(0, 10).map((n) => ({
        id: `leaf-note-${n.path}`,
        label: n.title.length > 20 ? `${n.title.slice(0, 20)}…` : n.title,
        detail: `${folderOf(n.path)} · ${(n.content || '').replace(/\s+/g, ' ').slice(0, 120)}`,
      })),
    });

    const hubRing = Math.min(W, H) * 0.32;
    const leafRing = Math.min(W, H) * 0.12;

    hubs.forEach((hub, i) => {
      const angle = (i / hubs.length) * Math.PI * 2 - Math.PI / 2;
      const hx = cx + Math.cos(angle) * hubRing;
      const hy = cy + Math.sin(angle) * hubRing;
      const leafCount = hub.leaves.length;

      nodes.push({
        id: hub.id,
        x: hx,
        y: hy,
        r: 11 + Math.min(leafCount * 0.7, 9),
        color: hub.color,
        label: hub.label,
        detail: `${leafCount} nodes · ${hub.icon}`,
        kind: 'hub',
        phase: (i / hubs.length) * Math.PI * 2,
        opacity: leafCount > 0 ? 1 : 0.35,
        icon: hub.icon,
      });

      edges.push({
        from: 'core',
        to: hub.id,
        color: hub.color,
        sig: i / Math.max(hubs.length, 1),
        speed: 0.0032 + i * 0.00035,
      });

      hub.leaves.forEach((leaf, j) => {
        const spread = Math.PI * 0.65;
        const leafAngle =
          angle +
          (hub.leaves.length === 1
            ? 0
            : ((j / (hub.leaves.length - 1)) - 0.5) * spread);
        nodes.push({
          id: leaf.id,
          x: hx + Math.cos(leafAngle) * leafRing,
          y: hy + Math.sin(leafAngle) * leafRing,
          r: 5,
          color: hub.color,
          label: leaf.label,
          detail: leaf.detail,
          kind: 'leaf',
          phase: Math.random() * Math.PI * 2,
          opacity: 0.85,
        });
        edges.push({
          from: hub.id,
          to: leaf.id,
          color: hub.color,
          sig: Math.random(),
          speed: 0.005 + Math.random() * 0.007,
        });
      });
    });

    // Wikilink edges between Obsidian leaves (title match)
    const titleToLeaf = new Map<string, string>();
    for (const n of notes) {
      const leafId = `leaf-note-${n.path}`;
      if (nodes.some((x) => x.id === leafId)) {
        titleToLeaf.set(n.title.toLowerCase(), leafId);
      }
    }
    for (const note of notes) {
      const fromId = titleToLeaf.get(note.title.toLowerCase());
      if (!fromId) continue;
      for (const link of note.wikilinks || []) {
        const clean = link.split('|')[0].trim().toLowerCase();
        const toId = titleToLeaf.get(clean);
        if (toId && toId !== fromId) {
          edges.push({
            from: fromId,
            to: toId,
            color: '#C4B5FD',
            sig: Math.random(),
            speed: 0.007,
            link: true,
          });
        }
      }
    }

    // Live routes — tight orbit
    const recentRoutes = routeLog.slice(-8);
    recentRoutes.forEach((route, i) => {
      const angle = (i / Math.max(recentRoutes.length, 1)) * Math.PI * 2;
      const orbitR = 56;
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
        opacity: 0.7,
      });
      edges.push({
        from: 'core',
        to: routeId,
        color: '#34D399',
        sig: Math.random(),
        speed: 0.014,
      });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [voice.routingLog, voice.conversation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load durable RAG + Obsidian once, then refresh periodically
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [notes, rag] = await Promise.all([
          listRecentObsidianNotes(40).catch(() => [] as ObsidianNote[]),
          loadRagMemories(undefined, 1, 60).catch(() => [] as RagMemory[]),
        ]);
        if (!alive) return;
        notesRef.current = notes;
        ragRef.current = rag;
        buildGraph();
      } catch {
        /* offline — localStorage already used in buildGraph */
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [buildGraph]);

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
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(34,211,238,0.022)';
      ctx.lineWidth = 0.5;
      const gs = 42;
      for (let x = 0; x < W; x += gs) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += gs) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      for (const e of edgesRef.current) e.sig = (e.sig + e.speed) % 1;
      const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));

      for (const e of edgesRef.current) {
        const A = nodeMap.get(e.from);
        const B = nodeMap.get(e.to);
        if (!A || !B) continue;

        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = e.link ? `${e.color}36` : `${e.color}18`;
        ctx.lineWidth = e.link ? 1.2 : 1;
        if (e.link) ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        const px = A.x + (B.x - A.x) * e.sig;
        const py = A.y + (B.y - A.y) * e.sig;
        const fade = Math.sin(e.sig * Math.PI);
        ctx.globalAlpha = fade * 0.88;
        ctx.beginPath();
        ctx.arc(px, py, e.link ? 2.2 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 9;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      const ORDER: NNode['kind'][] = ['leaf', 'route', 'hub', 'core'];
      const sorted = [...nodesRef.current].sort(
        (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind),
      );

      for (const node of sorted) {
        const hovered = hoveredRef.current === node.id;
        const pulse =
          1 +
          Math.sin(t * (node.kind === 'core' ? 2.4 : 1.7) + node.phase) * 0.06;
        const r = node.r * (hovered ? 1.45 : pulse);

        ctx.globalAlpha = node.opacity;

        const glowR =
          r +
          (node.kind === 'core' ? 52 : node.kind === 'hub' ? 22 : 11);
        const grd = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          glowR,
        );
        grd.addColorStop(0, `${node.color}55`);
        grd.addColorStop(0.5, `${node.color}14`);
        grd.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = node.kind === 'core' ? '#010f14' : `${node.color}1a`;
        ctx.fill();
        ctx.strokeStyle = node.color;
        ctx.lineWidth = node.kind === 'leaf' ? 1 : 1.5;
        ctx.shadowColor = node.color;
        ctx.shadowBlur =
          hovered ? 20 : node.kind === 'core' ? 18 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (node.kind === 'core') {
          [1.65, 2.15, 2.75].forEach((mult, ri) => {
            const ringR =
              r * (mult + Math.sin(t * 1.6 + ri * 1.1) * 0.04);
            ctx.beginPath();
            ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `${node.color}${['28', '15', '0a'][ri]}`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          });
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

          ctx.font = `bold ${Math.round(r * 0.7)}px monospace`;
          ctx.fillStyle = node.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 14;
          ctx.fillText('🧠', node.x, node.y);
          ctx.shadowBlur = 0;

          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = `${node.color}cc`;
          ctx.textBaseline = 'top';
          ctx.fillText('SUPER BRAIN', node.x, node.y + r + 10);
        }

        if (node.kind === 'hub') {
          const icon = node.icon ?? '●';
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

      if (hoveredRef.current) {
        const hn = nodeMap.get(hoveredRef.current);
        if (hn) {
          ctx.strokeStyle = `${hn.color}18`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(hn.x, 0);
          ctx.lineTo(hn.x, H);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, hn.y);
          ctx.lineTo(W, hn.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let hov: string | null = null;
      let hovNode: NNode | null = null;
      for (const n of nodesRef.current) {
        const dx = mx - n.x;
        const dy = my - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < n.r + 10) {
          hov = n.id;
          hovNode = n;
          break;
        }
      }
      hoveredRef.current = hov;
      setTooltip(hovNode ? { x: mx, y: my, node: hovNode } : null);
    };
    const onLeave = () => {
      hoveredRef.current = null;
      setTooltip(null);
    };
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

      <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-x-3 gap-y-1 pointer-events-none">
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(236,72,153,0.85)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#EC4899', display: 'inline-block', boxShadow: '0 0 4px #EC4899' }} />
          Global
        </span>
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(167,139,250,0.9)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#A78BFA', display: 'inline-block', boxShadow: '0 0 4px #A78BFA' }} />
          RAG
        </span>
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(34,211,238,0.9)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22D3EE', display: 'inline-block', boxShadow: '0 0 4px #22D3EE' }} />
          Obsidian
        </span>
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(196,181,253,0.7)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C4B5FD', display: 'inline-block' }} />
          Wikilinks
        </span>
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(52,211,153,0.7)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', display: 'inline-block', boxShadow: '0 0 4px #34D399' }} />
          Routes
        </span>
      </div>

      <div
        className="absolute bottom-3 right-4 text-[8px] font-mono pointer-events-none"
        style={{ color: 'rgba(34,211,238,0.4)' }}
      >
        SUPER BRAIN · {counts.total} NODES
        {counts.total > 0 && (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>
            {' '}· G{counts.global} R{counts.rag} N{counts.notes}
          </span>
        )}
      </div>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 px-2.5 py-2 rounded-lg"
          style={{
            left: Math.min(tooltip.x + 14, WRef.current - 220),
            top: Math.max(8, tooltip.y - 8),
            transform: 'translateY(-100%)',
            background: 'rgba(0,5,12,0.97)',
            border: `1px solid ${tooltip.node.color}44`,
            boxShadow: `0 0 20px ${tooltip.node.color}18`,
            maxWidth: 260,
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
