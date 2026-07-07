import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getSystemState, checkAllServices, type ServiceState } from '@/services/systemService';

interface Node { id: string; name: string; type: 'core' | 'service' | 'agent'; x: number; y: number; color: string; status: 'online' | 'idle' | 'offline'; connections: number; }
interface Link { source: string; target: string; }

const NODES: Node[] = [
  { id: 'axe-core',      name: 'AXE Core',     type: 'core',    x: 0.50, y: 0.42, color: '#22D3EE', status: 'online', connections: 8 },
  { id: 'axe-companion', name: 'AXE Companion', type: 'core',    x: 0.30, y: 0.22, color: '#10B981', status: 'online', connections: 4 },
  { id: 'axe-intel',     name: 'AXE Intel',     type: 'core',    x: 0.70, y: 0.22, color: '#3B82F6', status: 'online', connections: 5 },
  { id: 'supabase',      name: 'Supabase',      type: 'service', x: 0.22, y: 0.58, color: '#3ECF8E', status: 'online', connections: 3 },
  { id: 'livekit',       name: 'LiveKit',       type: 'service', x: 0.38, y: 0.72, color: '#A855F7', status: 'online', connections: 2 },
  { id: 'n8n',           name: 'n8n',           type: 'service', x: 0.62, y: 0.72, color: '#FF6D5A', status: 'online', connections: 3 },
  { id: 'ollama',        name: 'Ollama',        type: 'service', x: 0.78, y: 0.58, color: '#F59E0B', status: 'online', connections: 2 },
  { id: 'openrouter',    name: 'OpenRouter',    type: 'service', x: 0.86, y: 0.36, color: '#60A5FA', status: 'online', connections: 2 },
  { id: 'github',        name: 'GitHub',        type: 'service', x: 0.14, y: 0.36, color: '#E5E7EB', status: 'online', connections: 2 },
  { id: 'trading_os',   name: 'Trading OS',    type: 'agent',   x: 0.14, y: 0.62, color: '#F59E0B', status: 'idle',   connections: 2 },
  { id: 'memory',        name: 'Memory',        type: 'agent',   x: 0.50, y: 0.82, color: '#EC4899', status: 'idle',   connections: 1 },
  { id: 'gemini',        name: 'Gemini',        type: 'service', x: 0.86, y: 0.62, color: '#34D399', status: 'online', connections: 1 },
  { id: 'vercel',        name: 'Vercel',        type: 'service', x: 0.50, y: 0.12, color: '#FFFFFF', status: 'online', connections: 1 },
];

// Map from core_system_state service keys → node ids
const SERVICE_TO_NODE: Record<string, string> = {
  supabase: 'supabase', livekit: 'livekit', n8n: 'n8n',
  ollama: 'ollama', openrouter: 'openrouter', github: 'github',
  gemini: 'gemini', axe_companion: 'axe-companion', axe_intel: 'axe-intel', trading_os: 'trading_os',
};

const LINKS: Link[] = [
  { source: 'axe-core', target: 'axe-companion' },
  { source: 'axe-core', target: 'axe-intel' },
  { source: 'axe-core', target: 'n8n' },
  { source: 'axe-core', target: 'livekit' },
  { source: 'axe-core', target: 'memory' },
  { source: 'axe-core', target: 'trading_os' },
  { source: 'axe-core', target: 'openrouter' },
  { source: 'axe-core', target: 'github' },
  { source: 'supabase', target: 'memory' },
  { source: 'supabase', target: 'axe-core' },
  { source: 'vercel', target: 'axe-core' },
  { source: 'ollama', target: 'axe-core' },
  { source: 'gemini', target: 'axe-core' },
  { source: 'n8n', target: 'axe-companion' },
  { source: 'n8n', target: 'axe-intel' },
  { source: 'axe-companion', target: 'trading_os' },
  { source: 'axe-intel', target: 'github' },
];

export default function Infrastructure() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [liveStates, setLiveStates] = useState<Record<string, ServiceState>>({});
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

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

  // Load real status from Supabase
  const loadStatus = useCallback(async () => {
    const states = await getSystemState();
    const map: Record<string, ServiceState> = {};
    for (const s of states) map[s.service] = s;
    setLiveStates(map);
    setLastCheck(new Date());
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runHealthCheck = useCallback(async () => {
    setChecking(true);
    await checkAllServices();
    await loadStatus();
    setChecking(false);
  }, [loadStatus]);

  // Merge static node list with live statuses
  const nodes = NODES.map(n => {
    const serviceKey = Object.entries(SERVICE_TO_NODE).find(([, v]) => v === n.id)?.[0];
    const live = serviceKey ? liveStates[serviceKey] : undefined;
    if (!live) return n;
    return { ...n, status: (live.status === 'online' ? 'online' : live.status === 'degraded' ? 'idle' : 'offline') as Node['status'] };
  });

  const px = (n: Node) => n.x * size.w;
  const py = (n: Node) => n.y * size.h;

  const selectedNode = selected ? nodes.find(n => n.id === selected) : null;
  const selectedLive = selectedNode ? (() => {
    const key = Object.entries(SERVICE_TO_NODE).find(([, v]) => v === selectedNode.id)?.[0];
    return key ? liveStates[key] : undefined;
  })() : undefined;

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
            {nodes.filter(n => n.status === 'online').length} of {nodes.length} nodes online · {lastCheck ? `checked ${lastCheck.toLocaleTimeString()}` : 'loading…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {[{ color: '#22D3EE', label: 'Core' }, { color: '#3ECF8E', label: 'Service' }, { color: '#8B5CF6', label: 'Agent' }].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 8, height: 8, background: l.color, display: 'inline-block' }} />
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
          <button
            onClick={runHealthCheck}
            disabled={checking}
            className="ml-2 px-3 py-1 rounded-lg text-xs font-mono transition-all"
            style={{ background: checking ? 'rgba(34,211,238,0.05)' : 'rgba(34,211,238,0.1)', color: checking ? 'rgba(34,211,238,0.4)' : '#22D3EE', border: '1px solid rgba(34,211,238,0.2)' }}
          >
            {checking ? 'checking…' : 'run health check'}
          </button>
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
            const src = nodes.find(n => n.id === lnk.source);
            const tgt = nodes.find(n => n.id === lnk.target);
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
          {nodes.map(n => {
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
            className="absolute top-4 right-4 rounded-xl p-4 w-56"
            style={{ background: 'rgba(0,0,0,0.85)', border: `1px solid ${selectedNode.color}33`, backdropFilter: 'blur(10px)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded-full" style={{ width: 8, height: 8, background: selectedNode.color, display: 'inline-block', boxShadow: `0 0 8px ${selectedNode.color}` }} />
              <span className="text-small font-semibold" style={{ color: selectedNode.color }}>{selectedNode.name}</span>
            </div>
            <div className="space-y-1.5">
              {[
                { k: 'Type', v: selectedNode.type },
                { k: 'Status', v: selectedLive?.status ?? selectedNode.status },
                { k: 'Latency', v: selectedLive?.latency_ms != null ? `${selectedLive.latency_ms}ms` : '—' },
                { k: 'Version', v: selectedLive?.version ?? '—' },
                { k: 'Last seen', v: selectedLive?.last_seen ? new Date(selectedLive.last_seen).toLocaleTimeString() : '—' },
              ].map(({ k, v }) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span className="text-xs-custom font-mono-data truncate" style={{ color: v === 'online' ? '#10B981' : v === 'offline' ? '#EF4444' : v === 'degraded' ? '#F59E0B' : 'var(--text-primary)' }}>{v}</span>
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
