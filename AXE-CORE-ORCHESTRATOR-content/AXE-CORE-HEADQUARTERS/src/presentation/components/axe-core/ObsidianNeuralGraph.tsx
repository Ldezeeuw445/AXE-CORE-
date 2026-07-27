/**
 * ObsidianNeuralGraph — Home-style neural map for co-founder memory.
 * Core → folder hubs (Reflections, Decisions, …) → note leaves.
 * Extra edges for [[wikilinks]] between notes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';

const FOLDER_META: Record<string, { color: string; icon: string; label: string }> = {
  Reflections: { color: '#A78BFA', icon: '🪞', label: 'Reflections' },
  Decisions:   { color: '#22D3EE', icon: '⚖️', label: 'Decisions' },
  Preferences: { color: '#34D399', icon: '⚙️', label: 'Preferences' },
  Projects:    { color: '#F59E0B', icon: '📁', label: 'Projects' },
  System:      { color: '#94A3B8', icon: '📡', label: 'System' },
  AXE:         { color: '#38BDF8', icon: '⚡', label: 'AXE' },
};

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  if (parts.length > 1 && FOLDER_META[parts[0]]) return parts[0];
  return 'AXE';
}

interface NNode {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  label: string;
  detail?: string;
  kind: 'core' | 'hub' | 'leaf';
  path?: string;
  phase: number;
  opacity: number;
}

interface NEdge {
  from: string;
  to: string;
  color: string;
  sig: number;
  speed: number;
  link?: boolean;
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
  const nodesRef = useRef<NNode[]>([]);
  const edgesRef = useRef<NEdge[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const WRef = useRef(800);
  const HRef = useRef(420);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: NNode } | null>(null);

  const buildGraph = useCallback(() => {
    const W = WRef.current;
    const H = HRef.current;
    const cx = W / 2;
    const cy = H / 2;
    const nodes: NNode[] = [];
    const edges: NEdge[] = [];

    nodes.push({
      id: 'core',
      x: cx,
      y: cy,
      r: 28,
      color: '#22D3EE',
      label: 'MEMORY',
      detail: `${notes.length} durable notes · co-founder vault`,
      kind: 'core',
      phase: 0,
      opacity: 1,
    });

    const byFolder = new Map<string, ObsidianNote[]>();
    for (const n of notes) {
      const f = folderOf(n.path);
      if (!byFolder.has(f)) byFolder.set(f, []);
      byFolder.get(f)!.push(n);
    }

    // Always show architecture hubs even when empty
    const folderOrder = ['Reflections', 'Decisions', 'Preferences', 'Projects', 'System', 'AXE'];
    for (const f of byFolder.keys()) {
      if (!folderOrder.includes(f)) folderOrder.push(f);
    }

    const hubRing = Math.min(W, H) * 0.32;
    const leafRing = Math.min(W, H) * 0.14;

    folderOrder.forEach((folder, i) => {
      const meta = FOLDER_META[folder] || { color: '#64748B', icon: '📄', label: folder };
      const list = byFolder.get(folder) || [];
      const angle = (i / folderOrder.length) * Math.PI * 2 - Math.PI / 2;
      const hx = cx + Math.cos(angle) * hubRing;
      const hy = cy + Math.sin(angle) * hubRing;
      const hubId = `hub-${folder}`;

      nodes.push({
        id: hubId,
        x: hx,
        y: hy,
        r: 11 + Math.min(list.length * 0.7, 9),
        color: meta.color,
        label: meta.label,
        detail: `${list.length} notes · ${meta.icon}`,
        kind: 'hub',
        phase: (i / folderOrder.length) * Math.PI * 2,
        opacity: list.length > 0 ? 1 : 0.35,
      });

      edges.push({
        from: 'core',
        to: hubId,
        color: meta.color,
        sig: i / folderOrder.length,
        speed: 0.003 + i * 0.0003,
      });

      const visible = list.slice(0, 8);
      visible.forEach((note, j) => {
        const spread = Math.PI * 0.7;
        const leafAngle =
          angle + (visible.length === 1 ? 0 : ((j / (visible.length - 1)) - 0.5) * spread);
        const leafId = `leaf-${note.path}`;
        const selected = selectedPath === note.path;
        nodes.push({
          id: leafId,
          x: hx + Math.cos(leafAngle) * leafRing,
          y: hy + Math.sin(leafAngle) * leafRing,
          r: selected ? 7 : 5,
          color: meta.color,
          label: note.title.length > 22 ? `${note.title.slice(0, 22)}…` : note.title,
          detail: (note.content || '').replace(/\s+/g, ' ').slice(0, 120),
          kind: 'leaf',
          path: note.path,
          phase: Math.random() * Math.PI * 2,
          opacity: selected ? 1 : 0.85,
        });
        edges.push({
          from: hubId,
          to: leafId,
          color: meta.color,
          sig: Math.random(),
          speed: 0.005 + Math.random() * 0.006,
        });
      });
    });

    // Wikilink edges between leaves (by title match)
    const titleToLeaf = new Map<string, string>();
    for (const n of nodes) {
      if (n.kind === 'leaf' && n.path) {
        const note = notes.find(x => x.path === n.path);
        if (note) titleToLeaf.set(note.title.toLowerCase(), n.id);
      }
    }
    for (const note of notes) {
      const fromId = titleToLeaf.get(note.title.toLowerCase()) || nodes.find(x => x.path === note.path)?.id;
      if (!fromId) continue;
      for (const link of note.wikilinks || []) {
        const toId = titleToLeaf.get(link.toLowerCase());
        if (toId && toId !== fromId) {
          edges.push({
            from: fromId,
            to: toId,
            color: '#C4B5FD',
            sig: Math.random(),
            speed: 0.008,
            link: true,
          });
        }
      }
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [notes, selectedPath]);

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

      ctx.strokeStyle = 'rgba(34,211,238,0.025)';
      ctx.lineWidth = 0.5;
      const gs = 40;
      for (let x = 0; x < W; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      for (const e of edgesRef.current) e.sig = (e.sig + e.speed) % 1;
      const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

      for (const e of edgesRef.current) {
        const A = nodeMap.get(e.from);
        const B = nodeMap.get(e.to);
        if (!A || !B) continue;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = e.link ? `${e.color}33` : `${e.color}18`;
        ctx.lineWidth = e.link ? 1.2 : 1;
        if (e.link) ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        const px = A.x + (B.x - A.x) * e.sig;
        const py = A.y + (B.y - A.y) * e.sig;
        const fade = Math.sin(e.sig * Math.PI);
        ctx.globalAlpha = fade * 0.9;
        ctx.beginPath();
        ctx.arc(px, py, e.link ? 2 : 2.4, 0, Math.PI * 2);
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      const ORDER: NNode['kind'][] = ['leaf', 'hub', 'core'];
      const sorted = [...nodesRef.current].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

      for (const node of sorted) {
        const hovered = hoveredRef.current === node.id;
        const pulse = 1 + Math.sin(t * (node.kind === 'core' ? 2.2 : 1.6) + node.phase) * 0.06;
        const r = node.r * (hovered ? 1.4 : pulse);
        ctx.globalAlpha = node.opacity;

        const glowR = r + (node.kind === 'core' ? 48 : node.kind === 'hub' ? 20 : 10);
        const grd = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
        grd.addColorStop(0, `${node.color}50`);
        grd.addColorStop(0.5, `${node.color}12`);
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
        ctx.lineWidth = node.kind === 'leaf' ? 1.2 : 1.6;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = hovered ? 18 : node.kind === 'core' ? 16 : 7;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (node.kind === 'core') {
          [1.6, 2.1, 2.7].forEach((mult, ri) => {
            const ringR = r * (mult + Math.sin(t * 1.5 + ri) * 0.04);
            ctx.beginPath();
            ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `${node.color}${['28', '14', '0a'][ri]}`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          });
          ctx.font = `bold ${Math.round(r * 0.7)}px monospace`;
          ctx.fillStyle = node.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 12;
          ctx.fillText('🧠', node.x, node.y);
          ctx.shadowBlur = 0;
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = `${node.color}cc`;
          ctx.textBaseline = 'top';
          ctx.fillText('CO-FOUNDER MEMORY', node.x, node.y + r + 10);
        }

        if (node.kind === 'hub') {
          const folder = node.id.replace('hub-', '');
          const icon = FOLDER_META[folder]?.icon ?? '●';
          ctx.font = `${Math.round(r * 0.75)}px monospace`;
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
        const dx = mx - n.x, dy = my - n.y;
        if (Math.sqrt(dx * dx + dy * dy) < n.r + 10) {
          hov = n.id;
          hovNode = n;
          break;
        }
      }
      hoveredRef.current = hov;
      setTooltip(hovNode ? { x: mx, y: my, node: hovNode } : null);
      canvas.style.cursor = hovNode?.path ? 'pointer' : hov ? 'default' : 'crosshair';
    };
    const onLeave = () => {
      hoveredRef.current = null;
      setTooltip(null);
    };
    const onClick = () => {
      const id = hoveredRef.current;
      if (!id) return;
      const n = nodesRef.current.find(x => x.id === id);
      if (n?.path) onSelectPath(n.path);
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
  }, [buildGraph, onSelectPath]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  return (
    <div className="absolute inset-0" style={{ background: '#000' }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />

      <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-x-3 gap-y-1 pointer-events-none">
        {Object.entries(FOLDER_META).map(([k, meta]) => (
          <span key={k} className="flex items-center gap-1 text-[8px] font-mono" style={{ color: `${meta.color}99` }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, display: 'inline-block', boxShadow: `0 0 4px ${meta.color}` }} />
            {meta.label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: 'rgba(196,181,253,0.7)' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C4B5FD', display: 'inline-block' }} />
          Wikilinks
        </span>
      </div>

      <div className="absolute bottom-3 right-4 text-[8px] font-mono pointer-events-none" style={{ color: 'rgba(34,211,238,0.4)' }}>
        CO-FOUNDER VAULT · {notes.length} NOTES
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
          {tooltip.node.path && (
            <div className="text-[8px] mt-1 font-mono" style={{ color: 'rgba(34,211,238,0.5)' }}>
              click to open
            </div>
          )}
        </div>
      )}
    </div>
  );
}
