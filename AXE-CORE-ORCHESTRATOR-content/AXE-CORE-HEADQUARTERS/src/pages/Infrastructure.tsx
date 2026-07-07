import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Node { id: string; name: string; type: 'core' | 'service' | 'agent'; x: number; y: number; color: string; status: 'online' | 'idle' | 'offline'; connections: number; }
interface Link { source: string; target: string; }

const NODES: Node[] = [
  { id: 'axe-core',      name: 'AXE Core',     type: 'core',    x: 0.50, y: 0.42, color: '#22D3EE', status: 'online', connections: 8 },
  { id: 'axe-companion', name: 'AXE Companion', type: 'core',    x: 0.30, y: 0.22, color: '#10B981', status: 'online', connections: 4 },
  { id: 'axe-intel',     name: 'AXE Intel',     type: 'core',    x: 0.70, y: 0.22, color: '#3B82F6', status: 'online', connections: 5 },
  { id: 'supabase',      name: 'Supabase',      type: 'service', x: 0.22, y: 0.58, color: '#3ECF8E', status: 'online', connections: 3 },
  { id: 'cloudflare',    name: 'Cloudflare',    type: 'service', x: 0.38, y: 0.72, color: '#F48120', status: 'online', connections: 4 },
  { id: 'vercel',        name: 'Vercel',        type: 'service', x: 0.62, y: 0.72, color: '#FFFFFF', status: 'online', connections: 2 },
  { id: 'railway',       name: 'Railway',       type: 'service', x: 0.78, y: 0.58, color: '#8B5CF6', status: 'online', connections: 2 },
  { id: 'resend',        name: 'Resend',        type: 'service', x: 0.86, y: 0.36, color: '#F59E0B', status: 'online', connections: 1 },
  { id: 'coding',        name: 'Coding',        type: 'agent',   x: 0.14, y: 0.36, color: '#22D3EE', status: 'online', connections: 2 },
  { id: 'trading',       name: 'Trading',       type: 'agent',   x: 0.14, y: 0.62, color: '#F59E0B', status: 'online', connections: 2 },
  { id: 'research',      name: 'Research',      type: 'agent',   x: 0.86, y: 0.62, color: '#8B5CF6', status: 'idle',   connections: 1 },
  { id: 'memory',        name: 'Memory',        type: 'agent',   x: 0.50, y: 0.80, color: '#EC4899', status: 'idle',   connections: 1 },
  { id: 'vision',        name: 'Vision',        type: 'agent',   x: 0.50, y: 0.12, color: '#06B6D4', status: 'online', connections: 1 },
  { id: 'browser',       name: 'Browser',       type: 'agent',   x: 0.30, y: 0.88, color: '#3B82F6', status: 'online', connections: 1 },
];

const LINKS: Link[] = [
  { source: 'axe-core', target: 'axe-companion' },
  { source: 'axe-core', target: 'axe-intel' },
  { source: 'axe-core', target: 'coding' },
  { source: 'axe-core', target: 'trading' },
  { source: 'axe-core', target: 'research' },
  { source: 'axe-core', target: 'memory' },
  { source: 'axe-core', target: 'vision' },
  { source: 'axe-core', target: 'browser' },
  { source: 'supabase', target: 'memory' },
  { source: 'supabase', target: 'axe-core' },
  { source: 'cloudflare', target: 'axe-core' },
  { source: 'vercel', target: 'axe-core' },
  { source: 'railway', target: 'axe-intel' },
  { source: 'resend', target: 'axe-companion' },
  { source: 'axe-companion', target: 'browser' },
  { source: 'axe-intel', target: 'research' },
];

export default function Infrastructure() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    if (svgRef.current?.parentElement) obs.observe(svgRef.current.parentElement);
    return () => obs.disconnect();
  }, []);

  // Animated dash offset for links
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60);
    return () => clearInterval(id);
  }, []);

  const px = (n: Node) => n.x * size.w;
  const py = (n: Node) => n.y * size.h;

  const selectedNode = selected ? NODES.find(n => n.id === selected) : null;

  return (
    <motion.div
      className="h-full flex flex-col"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Infrastructure</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            {NODES.filter(n => n.status === 'online').length} of {NODES.length} nodes online · {LINKS.length} connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          {[{ color: '#22D3EE', label: 'Core' }, { color: '#3ECF8E', label: 'Service' }, { color: '#8B5CF6', label: 'Agent' }].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 8, height: 8, background: l.color, display: 'inline-block' }} />
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: 'default' }}
        >
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(34,211,238,0.03)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            {NODES.map(n => (
              <radialGradient key={`grad-${n.id}`} id={`glow-${n.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={n.color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={n.color} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>
          <rect width="100%" height="100%" fill="url(#bgGrad)" />

          {/* Links */}
          {LINKS.map((lnk, i) => {
            const src = NODES.find(n => n.id === lnk.source);
            const tgt = NODES.find(n => n.id === lnk.target);
            if (!src || !tgt) return null;
            const isSelected = selected && (lnk.source === selected || lnk.target === selected);
            return (
              <line
                key={i}
                x1={px(src)} y1={py(src)} x2={px(tgt)} y2={py(tgt)}
                stroke={isSelected ? src.color : 'rgba(255,255,255,0.07)'}
                strokeWidth={isSelected ? 1.5 : 0.8}
                strokeDasharray={isSelected ? '6 4' : '0'}
                strokeDashoffset={isSelected ? -(tick * 0.5) : 0}
                style={{ transition: 'stroke 0.2s' }}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map(n => {
            const r = n.type === 'core' ? 22 : n.type === 'service' ? 16 : 13;
            const isSelected = selected === n.id;
            return (
              <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(selected === n.id ? null : n.id)}>
                {/* Glow */}
                <circle cx={px(n)} cy={py(n)} r={r * 2.5} fill={`url(#glow-${n.id})`} opacity={isSelected ? 1 : 0.5} />
                {/* Outer ring */}
                <circle cx={px(n)} cy={py(n)} r={r + 3} fill="none" stroke={n.color} strokeWidth={isSelected ? 1.5 : 0.8} opacity={0.5} />
                {/* Node circle */}
                <circle cx={px(n)} cy={py(n)} r={r} fill={`rgba(0,0,0,0.8)`} stroke={n.color} strokeWidth={isSelected ? 2 : 1} />
                {/* Status dot */}
                <circle cx={px(n) + r * 0.65} cy={py(n) - r * 0.65} r={3.5}
                  fill={n.status === 'online' ? '#10B981' : n.status === 'idle' ? '#F59E0B' : '#6B7280'}
                  stroke="#000" strokeWidth={1}
                />
                {/* Label */}
                <text x={px(n)} y={py(n) + r + 14} textAnchor="middle" fontSize={10} fill={isSelected ? n.color : 'rgba(255,255,255,0.55)'} fontFamily="JetBrains Mono, monospace">
                  {n.name}
                </text>
                {/* Icon text */}
                <text x={px(n)} y={py(n) + 4} textAnchor="middle" fontSize={n.type === 'core' ? 9 : 8} fill={n.color} fontFamily="JetBrains Mono, monospace" fontWeight="600">
                  {n.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Detail panel */}
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 right-4 rounded-xl p-4 w-52"
            style={{ background: 'rgba(0,0,0,0.85)', border: `1px solid ${selectedNode.color}33`, backdropFilter: 'blur(10px)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full" style={{ width: 8, height: 8, background: selectedNode.color, display: 'inline-block', boxShadow: `0 0 8px ${selectedNode.color}` }} />
              <span className="text-small font-semibold" style={{ color: selectedNode.color }}>{selectedNode.name}</span>
            </div>
            <div className="space-y-1.5">
              {[
                { k: 'Type', v: selectedNode.type },
                { k: 'Status', v: selectedNode.status },
                { k: 'Connections', v: String(selectedNode.connections) },
              ].map(({ k, v }) => (
                <div key={k} className="flex justify-between">
                  <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="text-xs-custom font-mono-data" style={{ color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setSelected(null)} className="mt-3 text-[10px] w-full text-center" style={{ color: 'var(--text-muted)' }}>close</button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
