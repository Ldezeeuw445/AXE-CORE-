import { useMemo, useState, useRef, useCallback, useEffect, type ComponentType, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Network, Cpu, Wrench, Server, Activity, X, Check, Plus, Trash2 } from 'lucide-react';
import {
  loadAxeOrganization,
  type OrganizationNode,
  type OrganizationNodeKind,
} from '@/services/systemRegistryService';

/* ── kleurcode ───────────────────────────────────────────────────────────── */
const KIND_STYLE: Record<OrganizationNodeKind, { color: string; bg: string; border: string; icon: ComponentType<{ size: number; style: CSSProperties }> }> = {
  user:            { color: '#E5E7EB', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.12)', icon: Brain },
  core:            { color: '#22D3EE', bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.35)', icon: Brain },
  executive:       { color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.35)', icon: Brain },
  orchestrator:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)', icon: Network },
  specialist:      { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.35)', icon: Activity },
  application:     { color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)', icon: Server },
  provider:        { color: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)', icon: Server },
  model:           { color: '#3B82F6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.25)', icon: Cpu },
  coding_system:   { color: '#EC4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.25)', icon: Wrench },
  research_system: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.25)', icon: Activity },
  tool:            { color: '#EC4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.25)', icon: Wrench },
  mcp:             { color: '#F97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.25)', icon: Server },
  service:         { color: '#EF4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)', icon: Server },
  memory:          { color: '#14B8A6', bg: 'rgba(20,184,166,0.06)', border: 'rgba(20,184,166,0.25)', icon: Brain },
  infrastructure:  { color: '#EF4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.25)', icon: Server },
  health:          { color: '#22D3EE', bg: 'rgba(34,211,238,0.06)', border: 'rgba(34,211,238,0.25)', icon: Activity },
};

/* ── status tekst ─────────────────────────────────────────────────────────── */
function statusLabel(s: OrganizationNode['status']) {
  switch (s) {
    case 'healthy':    return 'Healthy';
    case 'online':     return 'Online';
    case 'configured': return 'Configured';
    case 'degraded':   return 'Degraded';
    case 'offline':    return 'Offline';
    default:           return 'Unknown';
  }
}

function statusColor(s: OrganizationNode['status']) {
  switch (s) {
    case 'healthy':
    case 'online':     return 'var(--success)';
    case 'configured': return 'var(--accent-cyan)';
    case 'degraded':   return 'var(--warning)';
    case 'offline':    return 'var(--error)';
    default:           return 'var(--text-muted)';
  }
}

/* ── node card ───────────────────────────────────────────────────────────── */
function ArchNode({
  node, x, y, w, h, isSelected, onClick, sub,
}: {
  node: OrganizationNode; x: number; y: number; w: number; h: number;
  isSelected?: boolean; onClick?: () => void; sub?: string;
}) {
  const style = KIND_STYLE[node.kind] ?? KIND_STYLE['core'];
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setDrag({ dx: e.clientX - rect.left, dy: e.clientY - rect.top });
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag || !ref.current) return;
    const parent = ref.current.parentElement?.getBoundingClientRect();
    if (!parent) return;
    const nx = ((e.clientX - parent.left - drag.dx) / parent.width) * 100;
    const ny = ((e.clientY - parent.top - drag.dy) / parent.height) * 100;
    ref.current.style.left = `${Math.max(0, Math.min(94, nx))}%`;
    ref.current.style.top = `${Math.max(0, Math.min(94, ny))}%`;
  }, [drag]);

  const onPointerUp = useCallback(() => setDrag(null), []);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onClick}
      className="absolute cursor-grab active:cursor-grabbing rounded-xl px-3 py-2 text-left transition-shadow"
      style={{
        left: `${x}%`, top: `${y}%`, width: w, minHeight: h,
        background: style.bg,
        border: `1px solid ${isSelected ? style.color + 'cc' : style.border}`,
        boxShadow: isSelected ? `0 0 18px ${style.color}33` : '0 0 10px rgba(0,0,0,0.25)',
      }}
    >
      <div ref={ref} className="contents">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full" style={{ width: 6, height: 6, background: statusColor(node.status), display: 'inline-block' }} />
          <span className="text-[11px] font-semibold tracking-wide truncate" style={{ color: style.color }}>{node.label}</span>
        </div>
        {(node.detail || sub) ? (
          <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] truncate" style={{ color: 'var(--text-muted)' }}>{node.detail || sub}</div>
        ) : null}
        {node.meta?.preferredModels ? (
          <div className="mt-0.5 text-[8px] font-mono truncate" style={{ color: 'rgba(165,243,252,0.55)' }}>
            {Array.isArray(node.meta.preferredModels) ? node.meta.preferredModels.slice(0, 2).join(', ') : String(node.meta.preferredModels)}
          </div>
        ) : null}
        {node.meta?.fallbackModels ? (
          <div className="text-[8px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
            fallback: {Array.isArray(node.meta.fallbackModels) ? node.meta.fallbackModels.slice(0, 2).join(', ') : String(node.meta.fallbackModels)}
          </div>
        ) : null}
        {node.kind === 'specialist' && node.meta?.tools && Array.isArray(node.meta.tools) && node.meta.tools.length > 0 ? (
          <div className="mt-0.5 text-[8px] truncate" style={{ color: 'rgba(236,72,153,0.6)' }}>
            tools: {node.meta.tools.slice(0, 3).join(', ')}
          </div>
        ) : null}
        {node.kind === 'provider' && node.meta?.models && Array.isArray(node.meta.models) && node.meta.models.length > 0 ? (
          <div className="mt-0.5 text-[8px] truncate" style={{ color: 'rgba(16,185,129,0.55)' }}>
            models: {node.meta.models.slice(0, 3).join(', ')}
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[8px] uppercase font-mono" style={{ color: statusColor(node.status) }}>{statusLabel(node.status)}</span>
          {node.kind === 'specialist' && node.meta?.skills && Array.isArray(node.meta.skills) && node.meta.skills.length > 0 ? (
            <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{node.meta.skills.length} skills</span>
          ) : null}
          {node.kind === 'tool' && node.meta?.tools && Array.isArray(node.meta.tools) && node.meta.tools.length > 0 ? (
            <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{node.meta.tools.length} tools</span>
          ) : null}
        </div>
      </div>
    </motion.button>
  );
}

/* ── edit panel ──────────────────────────────────────────────────────────── */
function EditPanel({ node, onClose }: { node: OrganizationNode; onClose: () => void }) {
  const style = KIND_STYLE[node.kind] ?? KIND_STYLE['core'];
  const prompt = typeof node.meta?.prompt === 'string' ? node.meta.prompt : '';
  const skills: string[] = Array.isArray(node.meta?.skills) ? node.meta.skills : [];
  const [editPrompt, setEditPrompt] = useState(prompt);
  const [skillInput, setSkillInput] = useState('');
  const [skillsList, setSkillsList] = useState<string[]>(skills);
  const [saving, setSaving] = useState(false);

  // Close on click outside
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const savePrompt = async () => {
    setSaving(true);
    try {
      const baseUrl = (import.meta.env.VITE_AXE_CORE_API_URL ?? '').replace(/\/$/, '');
      const apiKey = import.meta.env.VITE_AXE_CORE_API_KEY ?? '';
      const res = await fetch(`${baseUrl}/supabase/table/core_agents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ data: { id: node.id, system_prompt: editPrompt, skills: skillsList }, match_col: 'id', match_val: node.id }),
      });
      if (!res.ok) throw new Error('save failed');
      onClose();
    } catch {
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const Icon = style.icon;

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      className="absolute z-30 w-[320px] max-h-[65vh] rounded-2xl overflow-hidden"
      style={{
        right: 12, bottom: 12,
        background: '#050807',
        border: `1px solid ${style.color}44`,
        boxShadow: `0 0 30px ${style.color}22`,
      }}
    >
      <div className="flex items-center justify-between p-3" style={{ borderBottom: `1px solid ${style.color}1f` }}>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg grid place-items-center" style={{ background: `${style.color}16`, border: `1px solid ${style.color}33` }}>
            <Icon size={14} style={{ color: style.color }} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: style.color }}>{node.label}</div>
            <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{node.kind} · {node.source}</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-1" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}><X size={12} /></button>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto max-h-[55vh]">
        <div>
          <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Specialty</div>
          <div className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{node.detail || 'General AXE Core agent'}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Master Prompt</div>
            <div className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Saved to Supabase</div>
          </div>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={5}
            className="w-full text-[10px] leading-relaxed p-2 rounded-lg resize-none outline-none"
            style={{ background: '#030505', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(165,243,252,0.8)' }}
          />
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Skills</div>
          <div className="flex flex-wrap gap-1 mb-1">
            {skillsList.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                {s}
                <button onClick={() => setSkillsList(list => list.filter((_, idx) => idx !== i))} style={{ color: 'var(--text-muted)' }}><Trash2 size={8} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && skillInput.trim()) { setSkillsList(list => [...list, skillInput.trim()]); setSkillInput(''); } }}
              placeholder="Add skill…"
              className="flex-1 text-[10px] px-2 py-1 rounded-lg outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
            />
            <button onClick={() => { if (skillInput.trim()) { setSkillsList(list => [...list, skillInput.trim()]); setSkillInput(''); } }} className="px-2 py-1 rounded-lg" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Plus size={10} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Health</div>
            <div className="text-[11px] font-medium mt-0.5" style={{ color: statusColor(node.status) }}>{statusLabel(node.status)}</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Memory</div>
            <div className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{String(node.meta?.memory ?? '—')}</div>
          </div>
        </div>

        {(node.meta?.preferredModels || node.meta?.fallbackModels) ? (
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Models</div>
            <div className="text-[10px]" style={{ color: 'var(--text-primary)' }}>
              {[node.meta?.preferredModels, node.meta?.fallbackModels].filter(Boolean).join(' → ')}
            </div>
          </div>
        ) : null}

        <button onClick={savePrompt} disabled={saving} className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-medium disabled:opacity-50" style={{ background: `${style.color}22`, border: `1px solid ${style.color}55`, color: style.color }}>
          {saving ? 'Saving…' : <><Check size={11} /> Save to Supabase</>}
        </button>
      </div>
    </motion.div>
  );
}

/* ── exacte ASCII-layout ─────────────────────────────────────────────────── */
function useAsciiLayout(root: OrganizationNode | null) {
  return useMemo(() => {
    if (!root) return [];
    const axe = root.children.find(n => n.kind === 'core') ?? root.children[0];
    const orch = axe?.children.find(n => n.kind === 'orchestrator');
    const allSpecialists = (orch?.children.filter(n => n.kind === 'specialist') ?? []).slice(0, 9);
    const branches = axe?.children.filter(n => ['provider','model','tool','infrastructure'].includes(n.kind)) ?? [];

    // Branch A: VPS Connected Per Provider With Best Fitting Ollama Models
    const branchA = axe?.children.find(n => n.id === 'providers') ?? {
      id: 'branch-a', label: 'VPS Connected Per Provider', kind: 'infrastructure' as OrganizationNodeKind, status: 'healthy' as const,
      detail: 'Best fitting Ollama Models', source: 'static',
      children: [
        { id: 'a-ollama', label: 'Ollama', kind: 'tool' as OrganizationNodeKind, status: 'healthy' as const, detail: 'local models', source: 'static', children: [] },
        { id: 'a-openjarvis', label: 'OpenJarvis', kind: 'tool' as OrganizationNodeKind, status: 'configured' as const, detail: 'agent bridge', source: 'static', children: [] },
        { id: 'a-openhands', label: 'OpenHands', kind: 'tool' as OrganizationNodeKind, status: 'configured' as const, detail: 'agent bridge', source: 'static', children: [] },
        { id: 'a-openclaw', label: 'OpenClaw', kind: 'tool' as OrganizationNodeKind, status: 'configured' as const, detail: 'agent bridge', source: 'static', children: [] },
        { id: 'a-interp', label: 'Open Interpreter', kind: 'tool' as OrganizationNodeKind, status: 'configured' as const, detail: 'code exec', source: 'static', children: [] },
        { id: 'a-n8n', label: 'n8n', kind: 'tool' as OrganizationNodeKind, status: 'configured' as const, detail: 'workflows', source: 'static', children: [] },
        { id: 'a-hermes', label: 'Hermes Agent', kind: 'tool' as OrganizationNodeKind, status: 'configured' as const, detail: 'agent', source: 'static', children: [] },
      ],
    };

    // Branch B: VPS → Kilo Code → LLM API Keys
    const branchB: OrganizationNode = {
      id: 'branch-b', label: 'VPS', kind: 'infrastructure', status: 'healthy', detail: 'Kilo Code', source: 'static',
      children: [
        { id: 'b-kilo', label: 'Kilo Code', kind: 'infrastructure', status: 'configured', detail: 'LLM API Keys', source: 'static', children: [
          { id: 'b-anthropic', label: 'Anthropic', kind: 'provider', status: 'configured', detail: 'Claude', source: 'static', children: [] },
          { id: 'b-openai', label: 'OpenAI', kind: 'provider', status: 'configured', detail: 'GPT', source: 'static', children: [] },
          { id: 'b-gemini', label: 'Gemini', kind: 'provider', status: 'configured', detail: 'Google', source: 'static', children: [] },
          { id: 'b-openrouter', label: 'OpenRouter', kind: 'provider', status: 'configured', detail: 'multi', source: 'static', children: [] },
          { id: 'b-groq', label: 'Groq', kind: 'provider', status: 'configured', detail: 'fast', source: 'static', children: [] },
        ]},
      ],
    };

    // Approval node
    const approval: OrganizationNode = {
      id: 'approval', label: 'AXE CORE ANSWER AND APPROVAL', kind: 'core', status: 'healthy', detail: 'final output', source: 'static', children: [],
    };

    // Layout in percentages
    const nodes: Array<{ node: OrganizationNode; x: number; y: number; w: number; h: number }> = [];

    // Row 0: User (top center)
    nodes.push({ node: { id: 'user', label: '(USER)', kind: 'user', status: 'online', detail: '', source: 'static', children: [] }, x: 42, y: 0, w: 100, h: 36 });

    // Row 1: AXE CORE | Approval
    nodes.push({ node: axe ?? { id: 'axe', label: 'AXE CORE', kind: 'core', status: 'healthy', detail: 'single identity', source: 'static', children: [] }, x: 28, y: 8, w: 140, h: 52 });
    nodes.push({ node: approval, x: 58, y: 8, w: 160, h: 52 });

    // Row 2: LangGraph Orchestrator (center)
    nodes.push({ node: orch ?? { id: 'orch', label: 'LangGraph Orchestrator', kind: 'orchestrator', status: 'healthy', detail: 'smart capability router', source: 'static', children: [] }, x: 38, y: 18, w: 180, h: 52 });

    // Row 3: Branch A | Branch B
    nodes.push({ node: branchA, x: 8, y: 30, w: 200, h: 52 });
    nodes.push({ node: branchB, x: 62, y: 30, w: 180, h: 52 });

    // Row 4: Branch A tools + Branch B LLM providers
    const bAChildren = branchA.children ?? [];
    const bBChildren = branchB.children[0]?.children ?? [];
    const toolY = 46;
    bAChildren.forEach((c, i) => {
      nodes.push({ node: c, x: 6 + i * 14, y: toolY, w: 110, h: 44 });
    });
    bBChildren.forEach((c, i) => {
      nodes.push({ node: c, x: 60 + i * 9, y: toolY, w: 90, h: 44 });
    });

    // Row 5: Specialists (only under Branch A)
    const specY = 68;
    const specs = allSpecialists;
    const specCols = specs.length <= 4 ? specs.length : specs.length <= 6 ? 3 : 4;
    const specW = Math.min(110, (88 - 4 * (specCols - 1)) / specCols);
    const totalSpecW = specCols * specW + (specCols - 1) * 2;
    const specStartX = 50 - totalSpecW / 2;
    specs.forEach((s, i) => {
      const col = i % specCols;
      const row = Math.floor(i / specCols);
      nodes.push({ node: s, x: specStartX + col * (specW + 2), y: specY + row * 12, w: specW, h: 44 });
    });

    return nodes;
  }, [root]);
}

/* ── verbindingslijnen (SVG) ─────────────────────────────────────────────── */
function ConnectionLines({ nodes }: { nodes: ReturnType<typeof useAsciiLayout> }) {
  const map = new Map(nodes.map(n => [n.node.id, n]));
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];

  function addLine(fromId: string, toId: string) {
    const a = map.get(fromId);
    const b = map.get(toId);
    if (a && b) {
      const color = KIND_STYLE[b.node.kind]?.color ?? KIND_STYLE[a.node.kind]?.color ?? 'rgba(34,211,238,0.4)';
      lines.push({ x1: a.x + a.w / 2, y1: a.y + a.h, x2: b.x + b.w / 2, y2: b.y, color });
    }
  }

  // User -> AXE CORE + Approval
  addLine('user', 'axe');
  addLine('user', 'approval');
  // AXE CORE -> LangGraph
  addLine('axe', 'orch');
  // LangGraph -> branches
  addLine('orch', 'branch-a');
  addLine('orch', 'branch-b');
  // Branch A -> tools
  const bAChildren = nodes.find(n => n.node.id === 'branch-a')?.node.children ?? [];
  bAChildren.forEach(c => addLine('branch-a', c.id));
  // Branch B -> Kilo -> providers
  addLine('branch-b', 'b-kilo');
  const bBChildren = nodes.find(n => n.node.id === 'b-kilo')?.node.children ?? [];
  bBChildren.forEach(c => addLine('b-kilo', c.id));
  // Branch A -> specialists
  nodes.filter(n => n.node.kind === 'specialist').forEach(s => addLine('branch-a', s.node.id));
  // Approval <- LangGraph (arrow up)
  const approvalNode = nodes.find(n => n.node.id === 'approval');
  const orchNode = nodes.find(n => n.node.id === 'orch');
  if (approvalNode && orchNode) {
    lines.push({ x1: orchNode.x + orchNode.w / 2, y1: orchNode.y, x2: approvalNode.x + approvalNode.w / 2, y2: approvalNode.y + approvalNode.h, color: '#22D3EE' });
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
      {lines.map((l, i) => (
        <line key={i} x1={`${l.x1}%`} y1={`${l.y1}%`} x2={`${l.x2}%`} y2={`${l.y2}%`}
          stroke={l.color} strokeWidth="1" opacity={0.4} strokeDasharray="3 3" />
      ))}
    </svg>
  );
}

/* ── main canvas ─────────────────────────────────────────────────────────── */
export default function ArchitectureCanvas({ root, onOpenFull }: { root: OrganizationNode | null; onOpenFull: () => void }) {
  const [selected, setSelected] = useState<OrganizationNode | null>(null);
  const nodes = useAsciiLayout(root);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            'radial-gradient(circle at 50% 20%, rgba(34,211,238,0.08), transparent 40%)',
          ].join(', '),
          backgroundSize: '32px 32px, 32px 32px, 100% 100%',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute top-3 left-4 z-10">
        <span className="text-[9px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>ARCHITECTURE</span>
      </div>
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>drag to rearrange · click to edit</span>
        <button onClick={onOpenFull} className="rounded-full px-2.5 py-1 text-[9px] font-medium" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.35)', color: 'var(--accent-cyan)' }}>
          <Network size={10} className="mr-1 inline" /> Full
        </button>
      </div>

      <ConnectionLines nodes={nodes} />

      {nodes.map(({ node, x, y, w, h }) => (
        <ArchNode
          key={node.id}
          node={node} x={x} y={y} w={w} h={h}
          isSelected={selected?.id === node.id}
          onClick={() => setSelected(node)}
          sub={node.detail}
        />
      ))}

      <AnimatePresence>
        {selected && (
          <EditPanel node={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
