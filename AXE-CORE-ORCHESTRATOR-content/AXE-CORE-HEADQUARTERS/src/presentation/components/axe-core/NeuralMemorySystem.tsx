import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';

/* ══════════════════════════════════════════════════════════════════════════
   Neural Memory System — constellation map (Skilltree-inspired)
   Overview: core + hubs on orbital rings.
   Drill-in: one hub becomes center, its leaves radiate.
   ══════════════════════════════════════════════════════════════════════════ */

const GLOBAL_CATS = {
  user_preference:      { color: '#F0ABFC', label: 'PREFERENCES',  glyph: '◎' },
  agent_performance:    { color: '#67E8F9', label: 'AGENTS',       glyph: '◈' },
  conversation_context: { color: '#FDBA74', label: 'CONVERSATIONS', glyph: '◇' },
  system_event:         { color: '#FDE68A', label: 'EVENTS',       glyph: '◉' },
  provider_performance: { color: '#C4B5FD', label: 'PROVIDERS',    glyph: '⬡' },
  specialist_match:     { color: '#6EE7B7', label: 'SPECIALISTS',  glyph: '✦' },
} as const;

type GlobalCat = keyof typeof GLOBAL_CATS;

const LAYER_META = {
  rag:      { color: '#C4B5FD', label: 'RAG FACTS', glyph: '◈' },
  obsidian: { color: '#67E8F9', label: 'OBSIDIAN',  glyph: '◐' },
} as const;

const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
const BG = '#0B0E14';

interface HubSpec {
  id: string;
  color: string;
  label: string;
  glyph: string;
  href?: string;
  leaves: Array<{ id: string; label: string; detail: string; href?: string }>;
}

interface MemEntry {
  id?: string;
  category: string;
  key: string;
  value: string;
}

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'AXE';
}

export function NeuralMemorySystem() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voice = useVoiceStore();
  const rafRef = useRef(0);
  const hubsRef = useRef<HubSpec[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const drillRef = useRef<string | null>(null);
  const WRef = useRef(800);
  const HRef = useRef(600);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; detail?: string; hint?: string } | null>(null);
  const [counts, setCounts] = useState({ global: 0, rag: 0, notes: 0, total: 0 });
  const [drillHub, setDrillHub] = useState<string | null>(null);

  const notesRef = useRef<ObsidianNote[]>([]);
  const ragRef = useRef<RagMemory[]>([]);

  drillRef.current = drillHub;

  const rebuildHubs = useCallback(() => {
    let mems: MemEntry[] = [];
    try {
      mems = JSON.parse(localStorage.getItem('axe_global_memory_cache') || '[]');
    } catch { /* */ }

    let rag = ragRef.current;
    let notes = notesRef.current;
    if (!rag.length) {
      try { rag = JSON.parse(localStorage.getItem('axe_rag_memory') || '[]'); } catch { /* */ }
    }
    if (!notes.length) {
      try { notes = JSON.parse(localStorage.getItem('axe_obsidian_local_cache') || '[]'); } catch { /* */ }
    }

    setCounts({
      global: mems.length,
      rag: rag.length,
      notes: notes.length,
      total: mems.length + rag.length + notes.length,
    });

    const hubs: HubSpec[] = [];

    (Object.keys(GLOBAL_CATS) as GlobalCat[]).forEach((cat) => {
      const meta = GLOBAL_CATS[cat];
      const catMems = mems.filter((m) => m.category === cat);
      if (catMems.length === 0 && cat !== 'user_preference' && cat !== 'system_event') return;
      hubs.push({
        id: `hub-g-${cat}`,
        color: meta.color,
        label: meta.label,
        glyph: meta.glyph,
        href: '/memory/explore',
        leaves: catMems.slice(0, 8).map((mem, j) => {
          let detail = '';
          try { detail = JSON.stringify(JSON.parse(mem.value)).slice(0, 110); }
          catch { detail = String(mem.value ?? '').slice(0, 110); }
          return {
            id: `leaf-g-${mem.id ?? `${cat}-${j}`}`,
            label: mem.key.length > 20 ? `${mem.key.slice(0, 20)}…` : mem.key,
            detail,
            href: '/memory/explore',
          };
        }),
      });
    });

    hubs.push({
      id: 'hub-rag',
      color: LAYER_META.rag.color,
      label: LAYER_META.rag.label,
      glyph: LAYER_META.rag.glyph,
      href: '/memory/explore',
      leaves: rag.slice(0, 10).map((m, j) => ({
        id: `leaf-rag-${m.id ?? j}`,
        label: (m.content || '').slice(0, 22) + ((m.content || '').length > 22 ? '…' : ''),
        detail: `[${m.category} · i${m.importance}] ${(m.content || '').slice(0, 140)}`,
        href: '/memory/explore',
      })),
    });

    hubs.push({
      id: 'hub-obsidian',
      color: LAYER_META.obsidian.color,
      label: LAYER_META.obsidian.label,
      glyph: LAYER_META.obsidian.glyph,
      href: '/obsidian',
      leaves: notes.slice(0, 12).map((n) => ({
        id: `leaf-note-${n.path}`,
        label: n.title.length > 22 ? `${n.title.slice(0, 22)}…` : n.title,
        detail: `${folderOf(n.path)} · ${(n.content || '').replace(/\s+/g, ' ').slice(0, 120)}`,
        href: `/obsidian?note=${encodeURIComponent(n.path)}`,
      })),
    });

    hubsRef.current = hubs;
  }, [voice.routingLog, voice.conversation]);

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
        rebuildHubs();
      } catch { /* offline */ }
    };
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [rebuildHubs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let tick = 0;

    type DrawNode = {
      id: string;
      x: number;
      y: number;
      r: number;
      color: string;
      label: string;
      detail?: string;
      kind: 'core' | 'hub' | 'leaf';
      glyph?: string;
      href?: string;
      count?: number;
    };

    const hitNodes: DrawNode[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      WRef.current = rect.width;
      HRef.current = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildHubs();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const W = WRef.current;
      const H = HRef.current;
      const cx = W / 2;
      const cy = H / 2;
      tick++;
      const t = tick * 0.016;
      const drill = drillRef.current;
      const hubs = hubsRef.current;
      hitNodes.length = 0;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Dot field
      const gs = 22;
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let x = gs / 2; x < W; x += gs) {
        for (let y = gs / 2; y < H; y += gs) {
          ctx.beginPath();
          ctx.arc(x, y, 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Orbital rings
      const maxR = Math.min(W, H) * 0.42;
      for (let i = 1; i <= 4; i++) {
        const rr = (maxR * i) / 4;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.035 + i * 0.008})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Soft center glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.55);
      glow.addColorStop(0, 'rgba(34,211,238,0.06)');
      glow.addColorStop(0.5, 'rgba(232,197,71,0.03)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      if (!drill) {
        // ── Overview: hubs only ──────────────────────────────────────
        const hubR = Math.min(W, H) * 0.30;

        // Particle dust near center
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2 + t * 0.08;
          const pr = 18 + (i % 7) * 4 + Math.sin(t + i) * 3;
          ctx.globalAlpha = 0.25 + Math.sin(t * 2 + i) * 0.1;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, 0.8, 0, Math.PI * 2);
          ctx.fillStyle = i % 3 === 0 ? GOLD : CREAM;
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Core
        const coreR = 16;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR + 6, 0, Math.PI * 2);
        ctx.strokeStyle = `${GOLD}55`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,18,24,0.95)';
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◉', cx, cy);
        hitNodes.push({ id: 'core', x: cx, y: cy, r: coreR + 8, color: GOLD, label: 'AXE CORE', kind: 'core', href: '/memory' });

        hubs.forEach((hub, i) => {
          const angle = (i / Math.max(hubs.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const hx = cx + Math.cos(angle) * hubR;
          const hy = cy + Math.sin(angle) * hubR;
          const hr = 11;
          const hovered = hoveredRef.current === hub.id;

          // Spoke
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * (coreR + 8), cy + Math.sin(angle) * (coreR + 8));
          ctx.lineTo(hx - Math.cos(angle) * hr, hy - Math.sin(angle) * hr);
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Gold particle on spoke
          const sig = ((t * 0.15 + i * 0.2) % 1);
          const px = cx + Math.cos(angle) * (coreR + 8 + (hubR - coreR - 8 - hr) * sig);
          const py = cy + Math.sin(angle) * (coreR + 8 + (hubR - coreR - 8 - hr) * sig);
          ctx.beginPath();
          ctx.arc(px, py, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = GOLD;
          ctx.globalAlpha = 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;

          // Tiny leaf stubs (constellation arms)
          const stubN = Math.min(hub.leaves.length, 5);
          for (let s = 0; s < stubN; s++) {
            const sa = angle + ((s / Math.max(stubN - 1, 1)) - 0.5) * 0.9;
            const sr = 22 + (s % 3) * 8;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + Math.cos(sa) * sr, hy + Math.sin(sa) * sr);
            ctx.strokeStyle = `${hub.color}44`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hx + Math.cos(sa) * sr, hy + Math.sin(sa) * sr, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = CREAM;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          // Hub node
          ctx.beginPath();
          ctx.arc(hx, hy, hr + (hovered ? 3 : 0), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(18,20,28,0.95)';
          ctx.fill();
          ctx.strokeStyle = hovered ? GOLD : hub.color;
          ctx.lineWidth = hovered ? 1.8 : 1.2;
          ctx.stroke();
          ctx.fillStyle = hovered ? GOLD : hub.color;
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(hub.glyph, hx, hy);

          // Outer label
          const lx = cx + Math.cos(angle) * (hubR + 28);
          const ly = cy + Math.sin(angle) * (hubR + 28);
          ctx.font = '600 9px system-ui, sans-serif';
          ctx.fillStyle = hovered ? CREAM : 'rgba(255,255,255,0.45)';
          ctx.letterSpacing = '0.12em';
          ctx.fillText(hub.label, lx, ly);
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillText(`${hub.leaves.length} nodes`, lx, ly + 12);

          hitNodes.push({
            id: hub.id, x: hx, y: hy, r: hr + 10, color: hub.color,
            label: hub.label, detail: `${hub.leaves.length} nodes`, kind: 'hub',
            glyph: hub.glyph, href: hub.href, count: hub.leaves.length,
          });
        });
      } else {
        // ── Drill-in: focused hub as center ──────────────────────────
        const hub = hubs.find(h => h.id === drill);
        if (hub) {
          const coreR = 18;

          // Core = focused hub
          ctx.beginPath();
          ctx.arc(cx, cy, coreR + 8, 0, Math.PI * 2);
          ctx.strokeStyle = `${GOLD}66`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15,18,24,0.95)';
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.fillStyle = GOLD;
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(hub.glyph, cx, cy);

          ctx.font = '600 11px system-ui, sans-serif';
          ctx.fillStyle = CREAM;
          ctx.fillText(hub.label, cx, cy + coreR + 18);
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillText(`${hub.leaves.length} nodes`, cx, cy + coreR + 30);

          hitNodes.push({
            id: hub.id, x: cx, y: cy, r: coreR + 10, color: GOLD,
            label: hub.label, kind: 'hub', href: hub.href,
          });

          const leafR = Math.min(W, H) * 0.28;
          hub.leaves.forEach((leaf, j) => {
            const angle = (j / Math.max(hub.leaves.length, 1)) * Math.PI * 2 - Math.PI / 2;
            // Slight orbital variation
            const or = leafR * (0.75 + (j % 3) * 0.12);
            const lx = cx + Math.cos(angle) * or;
            const ly = cy + Math.sin(angle) * or;
            const lr = 8;
            const hovered = hoveredRef.current === leaf.id;

            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * (coreR + 10), cy + Math.sin(angle) * (coreR + 10));
            ctx.lineTo(lx - Math.cos(angle) * lr, ly - Math.sin(angle) * lr);
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1;
            ctx.stroke();

            const sig = ((t * 0.2 + j * 0.15) % 1);
            const px = cx + Math.cos(angle) * (coreR + 10 + (or - coreR - 10 - lr) * sig);
            const py = cy + Math.sin(angle) * (coreR + 10 + (or - coreR - 10 - lr) * sig);
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = GOLD;
            ctx.globalAlpha = 0.75;
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.arc(lx, ly, lr + (hovered ? 2 : 0), 0, Math.PI * 2);
            ctx.fillStyle = CREAM;
            ctx.globalAlpha = hovered ? 1 : 0.92;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = hovered ? GOLD : 'rgba(0,0,0,0.25)';
            ctx.lineWidth = hovered ? 1.5 : 0.5;
            ctx.stroke();

            // Small glyph inside
            ctx.fillStyle = '#1a1a1a';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('·', lx, ly);

            if (hovered) {
              ctx.font = '9px system-ui, sans-serif';
              ctx.fillStyle = CREAM;
              ctx.fillText(leaf.label, lx, ly + lr + 12);
            }

            hitNodes.push({
              id: leaf.id, x: lx, y: ly, r: lr + 8, color: hub.color,
              label: leaf.label, detail: leaf.detail, kind: 'leaf', href: leaf.href,
            });
          });
        }
      }

      // stash hit list on canvas for events
      (canvas as unknown as { __hits?: DrawNode[] }).__hits = hitNodes;

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    const hitTest = (mx: number, my: number): DrawNode | null => {
      const hits = (canvas as unknown as { __hits?: DrawNode[] }).__hits ?? [];
      for (let i = hits.length - 1; i >= 0; i--) {
        const n = hits[i];
        const dx = mx - n.x;
        const dy = my - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < n.r) return n;
      }
      return null;
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hov = hitTest(mx, my);
      hoveredRef.current = hov?.id ?? null;
      setTooltip(hov ? {
        x: mx, y: my, title: hov.label, detail: hov.detail,
        hint: hov.kind === 'hub' ? (drillRef.current ? 'click to open · back for overview' : 'click to enter cluster') : hov.href ? 'click to open' : undefined,
      } : null);
      canvas.style.cursor = hov ? 'pointer' : 'default';
    };
    const onLeave = () => {
      hoveredRef.current = null;
      setTooltip(null);
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = hitTest(mx, my);
      if (!node) {
        if (drillRef.current) setDrillHub(null);
        return;
      }
      if (node.kind === 'hub' && !drillRef.current) {
        setDrillHub(node.id);
        return;
      }
      if (node.kind === 'core') {
        setDrillHub(null);
        if (node.href) navigate(node.href);
        return;
      }
      if (node.href) navigate(node.href);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
  }, [rebuildHubs, navigate]);

  const activeHub = hubsRef.current.find(h => h.id === drillHub);

  return (
    <div className="absolute inset-0" style={{ background: BG }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />

      {/* Back / drill chrome */}
      {drillHub && (
        <button
          type="button"
          onClick={() => setDrillHub(null)}
          className="absolute top-4 left-4 z-10 flex items-center gap-1.5 text-[10px] tracking-[0.14em] font-medium uppercase"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          ← All layers
        </button>
      )}

      {counts.total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6">
            <div className="text-[13px] font-medium mb-1" style={{ color: 'rgba(232,197,71,0.55)' }}>
              Constellation is empty
            </div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              Chat with AXE, save memories, or sync Obsidian notes.
            </div>
          </div>
        </div>
      )}

      <div
        className="absolute bottom-3 right-4 text-[9px] tracking-[0.1em] pointer-events-none"
        style={{ color: 'rgba(255,255,255,0.28)' }}
      >
        {activeHub ? activeHub.label : 'SUPER BRAIN'} · {counts.total} NODES
      </div>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 px-3 py-2 rounded-lg"
          style={{
            left: Math.min(tooltip.x + 14, WRef.current - 220),
            top: Math.max(8, tooltip.y - 8),
            transform: 'translateY(-100%)',
            background: 'rgba(12,14,20,0.96)',
            border: `1px solid ${GOLD}33`,
            maxWidth: 260,
          }}
        >
          <div className="text-[11px] font-semibold mb-0.5" style={{ color: CREAM }}>
            {tooltip.title}
          </div>
          {tooltip.detail && (
            <div className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {tooltip.detail}
            </div>
          )}
          {tooltip.hint && (
            <div className="text-[8px] mt-1 tracking-wide" style={{ color: `${GOLD}99` }}>
              {tooltip.hint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
