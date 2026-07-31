/**
 * ObsidianNeuralGraph — constellation map for co-founder vault.
 * Overview: folder hubs on orbital rings.
 * Drill-in: folder becomes center, notes radiate.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';

const FOLDER_META: Record<string, { color: string; glyph: string; label: string }> = {
  Reflections: { color: '#C4B5FD', glyph: '◐', label: 'REFLECTIONS' },
  Decisions:   { color: '#67E8F9', glyph: '⚖', label: 'DECISIONS' },
  Preferences: { color: '#6EE7B7', glyph: '◎', label: 'PREFERENCES' },
  Projects:    { color: '#FDBA74', glyph: '◈', label: 'PROJECTS' },
  System:      { color: '#94A3B8', glyph: '◉', label: 'SYSTEM' },
  AXE:         { color: '#38BDF8', glyph: '✦', label: 'AXE' },
};

const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
const BG = '#0B0E14';

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  if (parts.length > 1 && FOLDER_META[parts[0]]) return parts[0];
  return 'AXE';
}

interface HubSpec {
  id: string;
  folder: string;
  color: string;
  label: string;
  glyph: string;
  notes: ObsidianNote[];
}

export function ObsidianNeuralGraph({
  notes,
  selectedPath,
  onSelectPath,
}: {
  notes: ObsidianNote[];
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const hubsRef = useRef<HubSpec[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const drillRef = useRef<string | null>(null);
  const WRef = useRef(800);
  const HRef = useRef(420);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; detail?: string; hint?: string } | null>(null);
  const [drillHub, setDrillHub] = useState<string | null>(null);

  drillRef.current = drillHub;

  const rebuild = useCallback(() => {
    const byFolder = new Map<string, ObsidianNote[]>();
    for (const n of notes) {
      const f = folderOf(n.path);
      if (!byFolder.has(f)) byFolder.set(f, []);
      byFolder.get(f)!.push(n);
    }
    const folderOrder = ['Reflections', 'Decisions', 'Preferences', 'Projects', 'System', 'AXE'];
    for (const f of byFolder.keys()) {
      if (!folderOrder.includes(f)) folderOrder.push(f);
    }
    hubsRef.current = folderOrder.map(folder => {
      const meta = FOLDER_META[folder] || { color: '#64748B', glyph: '·', label: folder.toUpperCase() };
      return {
        id: `hub-${folder}`,
        folder,
        color: meta.color,
        label: meta.label,
        glyph: meta.glyph,
        notes: byFolder.get(folder) || [],
      };
    });
  }, [notes]);

  useEffect(() => { rebuild(); }, [rebuild]);

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
      path?: string;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      WRef.current = rect.width;
      HRef.current = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
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
      const hitNodes: DrawNode[] = [];

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      const gs = 22;
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let x = gs / 2; x < W; x += gs) {
        for (let y = gs / 2; y < H; y += gs) {
          ctx.beginPath();
          ctx.arc(x, y, 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const maxR = Math.min(W, H) * 0.42;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR * i) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${0.035 + i * 0.008})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.55);
      glow.addColorStop(0, 'rgba(34,211,238,0.05)');
      glow.addColorStop(0.5, 'rgba(232,197,71,0.025)');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      if (!drill) {
        const hubR = Math.min(W, H) * 0.30;
        const coreR = 15;

        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2 + t * 0.08;
          const pr = 16 + (i % 6) * 3.5 + Math.sin(t + i) * 2;
          ctx.globalAlpha = 0.22 + Math.sin(t * 2 + i) * 0.08;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, 0.75, 0, Math.PI * 2);
          ctx.fillStyle = i % 3 === 0 ? GOLD : CREAM;
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(cx, cy, coreR + 5, 0, Math.PI * 2);
        ctx.strokeStyle = `${GOLD}55`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,18,24,0.95)';
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('◉', cx, cy);
        hitNodes.push({ id: 'core', x: cx, y: cy, r: coreR + 8, color: GOLD, label: 'MEMORY', kind: 'core' });

        hubs.forEach((hub, i) => {
          const angle = (i / Math.max(hubs.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const hx = cx + Math.cos(angle) * hubR;
          const hy = cy + Math.sin(angle) * hubR;
          const hr = 10;
          const hovered = hoveredRef.current === hub.id;

          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * (coreR + 7), cy + Math.sin(angle) * (coreR + 7));
          ctx.lineTo(hx - Math.cos(angle) * hr, hy - Math.sin(angle) * hr);
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();

          const sig = ((t * 0.15 + i * 0.2) % 1);
          const px = cx + Math.cos(angle) * (coreR + 7 + (hubR - coreR - 7 - hr) * sig);
          const py = cy + Math.sin(angle) * (coreR + 7 + (hubR - coreR - 7 - hr) * sig);
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = GOLD;
          ctx.globalAlpha = 0.7;
          ctx.fill();
          ctx.globalAlpha = 1;

          const stubN = Math.min(hub.notes.length, 5);
          for (let s = 0; s < stubN; s++) {
            const sa = angle + ((s / Math.max(stubN - 1, 1)) - 0.5) * 0.85;
            const sr = 20 + (s % 3) * 7;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + Math.cos(sa) * sr, hy + Math.sin(sa) * sr);
            ctx.strokeStyle = `${hub.color}40`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hx + Math.cos(sa) * sr, hy + Math.sin(sa) * sr, 2, 0, Math.PI * 2);
            ctx.fillStyle = CREAM;
            ctx.globalAlpha = 0.65;
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          ctx.beginPath();
          ctx.arc(hx, hy, hr + (hovered ? 2.5 : 0), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(18,20,28,0.95)';
          ctx.fill();
          ctx.strokeStyle = hovered ? GOLD : hub.color;
          ctx.lineWidth = hovered ? 1.6 : 1.1;
          ctx.stroke();
          ctx.fillStyle = hovered ? GOLD : hub.color;
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(hub.glyph, hx, hy);

          const lx = cx + Math.cos(angle) * (hubR + 26);
          const ly = cy + Math.sin(angle) * (hubR + 26);
          ctx.font = '600 9px system-ui, sans-serif';
          ctx.fillStyle = hovered ? CREAM : 'rgba(255,255,255,0.42)';
          ctx.fillText(hub.label, lx, ly);
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillText(`${hub.notes.length} notes`, lx, ly + 11);

          hitNodes.push({
            id: hub.id, x: hx, y: hy, r: hr + 10, color: hub.color,
            label: hub.label, detail: `${hub.notes.length} notes`, kind: 'hub',
          });
        });
      } else {
        const hub = hubs.find(h => h.id === drill);
        if (hub) {
          const coreR = 17;
          const visible = hub.notes.slice(0, 12);

          ctx.beginPath();
          ctx.arc(cx, cy, coreR + 7, 0, Math.PI * 2);
          ctx.strokeStyle = `${GOLD}66`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15,18,24,0.95)';
          ctx.fill();
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.fillStyle = GOLD;
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(hub.glyph, cx, cy);
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.fillStyle = CREAM;
          ctx.fillText(hub.label, cx, cy + coreR + 16);
          ctx.font = '8px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillText(`${hub.notes.length} notes`, cx, cy + coreR + 28);

          hitNodes.push({ id: hub.id, x: cx, y: cy, r: coreR + 10, color: GOLD, label: hub.label, kind: 'hub' });

          const leafR = Math.min(W, H) * 0.28;
          visible.forEach((note, j) => {
            const angle = (j / Math.max(visible.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const or = leafR * (0.75 + (j % 3) * 0.12);
            const lx = cx + Math.cos(angle) * or;
            const ly = cy + Math.sin(angle) * or;
            const lr = selectedPath === note.path ? 9 : 7.5;
            const hovered = hoveredRef.current === `leaf-${note.path}`;
            const selected = selectedPath === note.path;

            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * (coreR + 9), cy + Math.sin(angle) * (coreR + 9));
            ctx.lineTo(lx - Math.cos(angle) * lr, ly - Math.sin(angle) * lr);
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1;
            ctx.stroke();

            const sig = ((t * 0.2 + j * 0.15) % 1);
            const px = cx + Math.cos(angle) * (coreR + 9 + (or - coreR - 9 - lr) * sig);
            const py = cy + Math.sin(angle) * (coreR + 9 + (or - coreR - 9 - lr) * sig);
            ctx.beginPath();
            ctx.arc(px, py, 1.4, 0, Math.PI * 2);
            ctx.fillStyle = GOLD;
            ctx.globalAlpha = 0.75;
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.arc(lx, ly, lr + (hovered || selected ? 2 : 0), 0, Math.PI * 2);
            ctx.fillStyle = CREAM;
            ctx.fill();
            ctx.strokeStyle = selected || hovered ? GOLD : 'rgba(0,0,0,0.2)';
            ctx.lineWidth = selected ? 1.8 : hovered ? 1.3 : 0.5;
            ctx.stroke();

            if (selected) {
              ctx.beginPath();
              ctx.arc(lx, ly, lr + 5, 0, Math.PI * 2);
              ctx.strokeStyle = `${GOLD}44`;
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            if (hovered || selected) {
              const title = note.title.length > 22 ? `${note.title.slice(0, 22)}…` : note.title;
              ctx.font = selected ? '600 9px system-ui, sans-serif' : '9px system-ui, sans-serif';
              ctx.fillStyle = CREAM;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(title, lx, ly + lr + 6);
            }

            hitNodes.push({
              id: `leaf-${note.path}`, x: lx, y: ly, r: lr + 8, color: hub.color,
              label: note.title,
              detail: (note.content || '').replace(/\s+/g, ' ').slice(0, 120),
              kind: 'leaf', path: note.path,
            });
          });
        }
      }

      (canvas as unknown as { __hits?: DrawNode[] }).__hits = hitNodes;
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    const hitTest = (mx: number, my: number) => {
      const hits = (canvas as unknown as { __hits?: DrawNode[] }).__hits ?? [];
      for (let i = hits.length - 1; i >= 0; i--) {
        const n = hits[i];
        const dx = mx - n.x, dy = my - n.y;
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
        hint: hov.kind === 'hub' ? (drillRef.current ? undefined : 'click to enter folder') : hov.path ? 'click to open' : undefined,
      } : null);
      canvas.style.cursor = hov ? 'pointer' : 'default';
    };
    const onLeave = () => { hoveredRef.current = null; setTooltip(null); };
    const onClick = () => {
      const id = hoveredRef.current;
      if (!id) { if (drillRef.current) setDrillHub(null); return; }
      const hits = (canvas as unknown as { __hits?: DrawNode[] }).__hits ?? [];
      const n = hits.find(x => x.id === id);
      if (!n) return;
      if (n.kind === 'hub' && !drillRef.current) { setDrillHub(n.id); return; }
      if (n.kind === 'core') { setDrillHub(null); return; }
      if (n.path) onSelectPath(n.path);
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
  }, [rebuild, onSelectPath, selectedPath]);

  const activeHub = hubsRef.current.find(h => h.id === drillHub);

  return (
    <div className="absolute inset-0" style={{ background: BG }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />

      {drillHub && (
        <button
          type="button"
          onClick={() => setDrillHub(null)}
          className="absolute top-3 left-3 z-10 flex items-center gap-1.5 text-[10px] tracking-[0.14em] font-medium uppercase"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          ← All folders
        </button>
      )}

      <div className="absolute bottom-3 right-4 text-[9px] tracking-[0.1em] pointer-events-none" style={{ color: 'rgba(255,255,255,0.28)' }}>
        {activeHub ? activeHub.label : 'CO-FOUNDER VAULT'} · {notes.length} NOTES
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
            maxWidth: 240,
          }}
        >
          <div className="text-[11px] font-semibold mb-0.5" style={{ color: CREAM }}>{tooltip.title}</div>
          {tooltip.detail && (
            <div className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{tooltip.detail}</div>
          )}
          {tooltip.hint && (
            <div className="text-[8px] mt-1 tracking-wide" style={{ color: `${GOLD}99` }}>{tooltip.hint}</div>
          )}
        </div>
      )}
    </div>
  );
}
