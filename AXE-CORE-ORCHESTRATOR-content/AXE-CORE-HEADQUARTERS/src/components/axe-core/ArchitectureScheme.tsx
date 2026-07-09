import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network, Cpu, Server, Bot, Wrench, Database, Activity,
} from 'lucide-react';
import {
  loadAxeOrganization,
  type OrganizationNode,
  type OrganizationNodeKind,
} from '@/services/systemRegistryService';
import { DetailPanel } from '@/pages/Organization';

/* per-specialist Ollama model (matches the deployed crew on the VPS) */
const SPECIALIST_MODEL: Record<string, string> = {
  'axe core': 'ollama/llama3',
  'wags': 'ollama/deepseek-coder:6.7b',
  'dollar bill': 'ollama/mistral',
  'intel': 'ollama/llama3',
  'sentinel': 'ollama/mistral',
  'forge': 'ollama/deepseek-coder:6.7b',
  'pulse': 'ollama/llama3',
  'atlas': 'ollama/llama3',
  'nova': 'ollama/llama3',
};

const KIND_COLOR: Record<OrganizationNodeKind, string> = {
  user: '#E5E7EB',
  core: '#22D3EE',
  orchestrator: '#A78BFA',
  specialist: '#10B981',
  provider: '#F59E0B',
  model: '#3B82F6',
  tool: '#EC4899',
  infrastructure: '#EF4444',
};

function statusColor(s: OrganizationNode['status']) {
  if (s === 'online' || s === 'healthy') return 'var(--success)';
  if (s === 'configured') return 'var(--accent-cyan)';
  if (s === 'degraded') return 'var(--warning)';
  if (s === 'offline') return 'var(--error)';
  return 'var(--text-muted)';
}

function Node({
  node,
  active,
  onClick,
  sub,
}: {
  node: OrganizationNode;
  active?: boolean;
  onClick?: () => void;
  sub?: string;
}) {
  const color = KIND_COLOR[node.kind] ?? 'var(--accent-cyan)';
  return (
    <button
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-center transition-all"
      style={{
        minWidth: 120,
        background: active ? `${color}1f` : 'rgba(255,255,255,0.035)',
        border: `1px solid ${active ? `${color}88` : 'rgba(34,211,238,0.30)'}`,
        boxShadow: active ? `0 0 22px ${color}33` : '0 0 14px rgba(34,211,238,0.07)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="text-[12px] font-semibold tracking-wide" style={{ color }}>{node.label}</div>
      {node.detail && (
        <div className="mt-0.5 text-[8px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>{node.detail}</div>
      )}
      {sub && (
        <div className="mt-0.5 text-[8px] font-mono truncate" style={{ color: 'rgba(165,243,252,0.6)' }}>{sub}</div>
      )}
      <div className="mt-1 flex items-center justify-center gap-1 text-[8px] uppercase font-mono" style={{ color: statusColor(node.status) }}>
        <span className="rounded-full" style={{ width: 5, height: 5, background: statusColor(node.status) }} />
        {node.status}
      </div>
    </button>
  );
}

const connector = 'h-6 w-px bg-gradient-to-b from-cyan-300/70 to-cyan-300/20';

export default function ArchitectureScheme({
  root,
  onOpenFull,
}: {
  root: OrganizationNode | null;
  onOpenFull: () => void;
}) {
  const [selected, setSelected] = useState<OrganizationNode | null>(null);

  const { axeCore, orchestrator, specialists, branchA, branchB } = useMemo(() => {
    const axe = root?.children.find((n) => n.kind === 'core') ?? root?.children[0] ?? null;
    const orch = axe?.children.find((n) => n.kind === 'orchestrator') ?? null;
    const specs = (orch?.children.filter((n) => n.kind === 'specialist') ?? []).map((s) => ({
      ...s,
      detail: SPECIALIST_MODEL[s.label.toLowerCase()] ?? s.detail,
    }));
    // Branch A: VPS / Ollama local tools
    const bA: OrganizationNode = {
      id: 'branch-a', label: 'VPS · Ollama', kind: 'infrastructure', status: 'healthy',
      detail: 'Local tools + CrewAI', source: 'static',
      children: [
        { id: 'a-ollama', label: 'Ollama', kind: 'model', status: 'healthy', detail: 'local models', source: 'static', children: [] },
        { id: 'a-openhands', label: 'OpenHands', kind: 'tool', status: 'configured', detail: 'agent bridge', source: 'static', children: [] },
        { id: 'a-openjarvis', label: 'OpenJarvis', kind: 'tool', status: 'configured', detail: 'agent bridge', source: 'static', children: [] },
        { id: 'a-openclaw', label: 'OpenClaw', kind: 'tool', status: 'configured', detail: 'agent bridge', source: 'static', children: [] },
        { id: 'a-interp', label: 'Open Interpreter', kind: 'tool', status: 'configured', detail: 'code exec', source: 'static', children: [] },
        { id: 'a-n8n', label: 'n8n', kind: 'tool', status: 'configured', detail: 'workflows', source: 'static', children: [] },
        { id: 'a-hermes', label: 'Hermes Agent', kind: 'tool', status: 'configured', detail: 'agent', source: 'static', children: [] },
      ],
    };
    // Branch B: Kilo Code → cloud LLM keys
    const bB: OrganizationNode = {
      id: 'branch-b', label: 'Kilo Code', kind: 'infrastructure', status: 'configured',
      detail: 'Cloud LLM keys', source: 'static',
      children: [
        { id: 'b-anthropic', label: 'Anthropic', kind: 'provider', status: 'configured', detail: 'Claude', source: 'static', children: [] },
        { id: 'b-openai', label: 'OpenAI', kind: 'provider', status: 'configured', detail: 'GPT', source: 'static', children: [] },
        { id: 'b-gemini', label: 'Gemini', kind: 'provider', status: 'configured', detail: 'Google', source: 'static', children: [] },
        { id: 'b-openrouter', label: 'OpenRouter', kind: 'provider', status: 'configured', detail: 'multi', source: 'static', children: [] },
        { id: 'b-groq', label: 'Groq', kind: 'provider', status: 'configured', detail: 'fast', source: 'static', children: [] },
      ],
    };
    return { axeCore: axe, orchestrator: orch, specialists: specs, branchA: bA, branchB: bB };
  }, [root]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* grid + glow backdrop */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            'radial-gradient(circle at 50% 30%, rgba(34,211,238,0.12), transparent 40%)',
          ].join(', '),
          backgroundSize: '28px 28px, 28px 28px, 100% 100%',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="relative z-10 flex h-full flex-col items-center gap-2 overflow-y-auto px-4 py-10">
        <button
          onClick={onOpenFull}
          className="self-end rounded-full px-3 py-1.5 text-[10px] font-medium"
          style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.35)', color: 'var(--accent-cyan)' }}
        >
          <Network size={11} className="mr-1 inline" /> Full organization
        </button>

        {/* AXE CORE → LangGraph */}
        <Node node={axeCore ?? { id: 'axe', label: 'AXE CORE', kind: 'core', status: 'healthy', detail: 'single identity', source: 'static', children: [] }}
          active={selected?.id === axeCore?.id} onClick={axeCore ? () => setSelected(axeCore) : undefined} />
        <div className={connector} />
        <Node node={orchestrator ?? { id: 'orch', label: 'LangGraph Orchestrator', kind: 'orchestrator', status: 'healthy', detail: 'smart capability router', source: 'static', children: [] }}
          active={selected?.id === orchestrator?.id} onClick={orchestrator ? () => setSelected(orchestrator) : undefined} />

        {/* branches split */}
        <div className="relative w-full max-w-4xl">
          <div className="absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 bg-cyan-300/70" />
          <div className="absolute left-1/4 right-1/4 top-5 h-px bg-cyan-300/50" />
          <div className="grid grid-cols-2 gap-6 pt-10">
            <div className="flex flex-col items-center gap-2">
              <div className="h-5 w-px bg-cyan-300/60" />
              <Node node={branchA} active={selected?.id === branchA.id} onClick={() => setSelected(branchA)} />
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {branchA.children.map((c) => (
                  <Node key={c.id} node={c} active={selected?.id === c.id} onClick={() => setSelected(c)} sub={c.detail} />
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-5 w-px bg-cyan-300/60" />
              <Node node={branchB} active={selected?.id === branchB.id} onClick={() => setSelected(branchB)} />
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {branchB.children.map((c) => (
                  <Node key={c.id} node={c} active={selected?.id === c.id} onClick={() => setSelected(c)} sub={c.detail} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-cyan-300/50" />
        <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
          Specialists · LangGraph routes only the needed agent
        </div>

        {/* 9 specialists */}
        <div className="grid w-full max-w-5xl grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {specialists.length > 0 ? specialists.map((s) => (
            <Node key={s.id} node={s} active={selected?.id === s.id} onClick={() => setSelected(s)} sub={s.detail} />
          )) : (
            ['Wags','Dollar Bill','Intel','Sentinel','Forge','Pulse','Atlas','Nova'].map((label) => (
              <Node key={label} node={{ id: `s-${label}`, label, kind: 'specialist', status: 'configured', detail: SPECIALIST_MODEL[label.toLowerCase()] ?? '', source: 'static', children: [] }} sub={SPECIALIST_MODEL[label.toLowerCase()]} />
            ))
          )}
        </div>
      </div>

      {/* detail drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="absolute inset-x-3 bottom-3 z-20 max-h-[70%]"
          >
            <div className="relative rounded-2xl overflow-hidden" style={{ background: '#050807', border: '1px solid rgba(34,211,238,0.25)' }}>
              <button
                onClick={() => setSelected(null)}
                className="absolute right-3 top-3 z-10 rounded-full p-1"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
              >✕</button>
              <div className="h-[60vh] max-h-[60vh]">
                <DetailPanel node={selected} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
