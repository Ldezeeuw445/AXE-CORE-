/**
 * OrganizationCanvas.tsx
 * ------------------------------------------------------------------
 * Visual agent organization canvas — draggable cards on a grid
 * with connection lines. Inspired by Zeta/Forge UI.
 * Each card: agent name, role, status, connections.
 * Click to open detail panel with tabs: Prompt, Skills, Memory, Voice.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, GripVertical, Plus, Bot, MessageSquare, Save,
  Brain, Code2, Search, Globe, Sparkles, Settings,
  Mic, FileText, Palette, ChevronRight, Trash2,
  Circle, Link2,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
export interface AgentCard {
  id: string;
  name: string;
  role: string;
  type: 'companion' | 'orchestrator' | 'tool' | 'provider';
  status: 'idle' | 'active' | 'busy' | 'error';
  color: string;
  x: number;
  y: number;
  prompt: string;
  skills: string[];
  connections: string[]; // IDs of connected agents
}

interface CanvasState {
  agents: AgentCard[];
  selectedId: string | null;
}

/* ─── Default agents ───────────────────────────────────────────────────── */
const DEFAULT_AGENTS: AgentCard[] = [
  {
    id: 'axe-core', name: 'AXE Core', role: 'orchestrator', type: 'orchestrator',
    status: 'active', color: '#22D3EE', x: 400, y: 80,
    prompt: 'You are AXE CORE, the master intelligence that controls the entire AXE ecosystem.',
    skills: ['system-control', 'routing', 'monitoring'], connections: ['kimiclaw', 'kimicode', 'kimiwork'],
  },
  {
    id: 'kimiclaw', name: 'KimiClaw', role: 'search & browse', type: 'tool',
    status: 'idle', color: '#F59E0B', x: 200, y: 280,
    prompt: 'You are KimiClaw. Your job is to search the web, fetch pages, and extract information.',
    skills: ['web-search', 'page-fetch', 'content-extract'], connections: ['axe-core'],
  },
  {
    id: 'kimicode', name: 'KimiCode', role: 'code agent', type: 'tool',
    status: 'idle', color: '#10B981', x: 400, y: 280,
    prompt: 'You are KimiCode. Your job is to write, edit, debug, and review code.',
    skills: ['code-edit', 'debug', 'review', 'terminal'], connections: ['axe-core', 'kilocode'],
  },
  {
    id: 'kimiwork', name: 'KimiWork', role: 'analysis', type: 'tool',
    status: 'idle', color: '#8B5CF6', x: 600, y: 280,
    prompt: 'You are KimiWork. Your job is data analysis, charting, and research synthesis.',
    skills: ['data-analysis', 'charts', 'research'], connections: ['axe-core'],
  },
  {
    id: 'kilocode', name: 'Kilo Code', role: 'IDE bridge', type: 'provider',
    status: 'idle', color: '#00B894', x: 250, y: 450,
    prompt: 'Kilo Code IDE bridge for real-time code editing.',
    skills: ['ide-bridge', 'live-edit'], connections: ['kimicode'],
  },
  {
    id: 'nova', name: 'Nova', role: 'research', type: 'companion',
    status: 'idle', color: '#3B82F6', x: 550, y: 450,
    prompt: 'You are Nova. Deep research specialist. Find sources, verify facts, synthesize.',
    skills: ['deep-research', 'fact-check', 'synthesis'], connections: ['axe-core', 'kimiwork'],
  },
  {
    id: 'forge', name: 'Forge', role: 'infrastructure', type: 'companion',
    status: 'idle', color: '#EF4444', x: 100, y: 150,
    prompt: 'You are Forge. Infrastructure and DevOps specialist. Deploy, monitor, scale.',
    skills: ['deploy', 'monitor', 'scale', 'infra'], connections: ['axe-core', 'kimicode'],
  },
];

/* ─── Status dot ───────────────────────────────────────────────────────── */
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: '#10B981', idle: '#6B7280', busy: '#F59E0B', error: '#EF4444',
  };
  const c = colors[status] || colors.idle;
  return (
    <span className="rounded-full flex-shrink-0 inline-block" style={{
      width: 6, height: 6, background: c,
      boxShadow: status === 'active' ? `0 0 6px ${c}80` : 'none',
    }} />
  );
}

/* ─── Connection Line ──────────────────────────────────────────────────── */
function ConnectionLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: from.x + 100, top: from.y + 30,
        width: len - 100, height: 2,
        transformOrigin: '0 50%',
        transform: `rotate(${angle}deg)`,
        background: 'linear-gradient(90deg, rgba(34,211,238,0.3), rgba(34,211,238,0.1))',
      }}
    />
  );
}

/* ─── Agent Card ───────────────────────────────────────────────────────── */
function AgentCardComponent({
  agent, isSelected, onSelect, onDrag,
}: {
  agent: AgentCard;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (id: string, x: number, y: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, cardX: 0, cardY: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, cardX: agent.x, cardY: agent.y };
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onDrag(agent.id, dragStart.current.cardX + dx, dragStart.current.cardY + dy);
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragging, agent.id, onDrag]);

  return (
    <motion.div
      layout
      className="absolute cursor-pointer select-none"
      style={{
        left: agent.x, top: agent.y, width: 200,
        zIndex: isSelected ? 20 : dragging ? 15 : 10,
      }}
      onMouseDown={handleMouseDown}
      onClick={onSelect}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: isSelected ? `${agent.color}15` : 'rgba(15,15,25,0.85)',
          border: `1px solid ${isSelected ? agent.color : 'rgba(255,255,255,0.08)'}`,
          boxShadow: isSelected ? `0 0 20px ${agent.color}20` : '0 4px 20px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Card header */}
        <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="rounded-lg flex items-center justify-center" style={{ width: 28, height: 28, background: `${agent.color}20`, border: `1px solid ${agent.color}40` }}>
            <Bot size={14} style={{ color: agent.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold truncate" style={{ color: '#fff' }}>{agent.name}</div>
            <div className="text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{agent.role}</div>
          </div>
          <div className="flex items-center gap-1">
            <StatusDot status={agent.status} />
            <span className="text-[8px] uppercase" style={{ color: agent.status === 'active' ? '#10B981' : 'rgba(255,255,255,0.3)' }}>{agent.status}</span>
          </div>
        </div>

        {/* Connection count */}
        {agent.connections.length > 0 && (
          <div className="px-3 py-1.5 flex items-center gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <Link2 size={8} style={{ color: 'rgba(255,255,255,0.25)' }} />
            <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{agent.connections.length} connection{agent.connections.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Detail Panel ─────────────────────────────────────────────────────── */
function DetailPanel({
  agent, onClose, onUpdate,
}: {
  agent: AgentCard;
  onClose: () => void;
  onUpdate: (a: AgentCard) => void;
}) {
  const [tab, setTab] = useState<'prompt' | 'skills' | 'memory' | 'voice'>('prompt');
  const [editPrompt, setEditPrompt] = useState(agent.prompt);
  const [editColor, setEditColor] = useState(agent.color);
  const [newSkill, setNewSkill] = useState('');

  const tabs = [
    { id: 'prompt' as const, label: 'PROMPT & IDENTITY', icon: FileText },
    { id: 'skills' as const, label: 'SKILLS', icon: Sparkles },
    { id: 'memory' as const, label: 'MEMORY', icon: Brain },
    { id: 'voice' as const, label: 'VOICE', icon: Mic },
  ];

  const savePrompt = () => onUpdate({ ...agent, prompt: editPrompt, color: editColor });
  const addSkill = () => {
    if (!newSkill.trim()) return;
    onUpdate({ ...agent, skills: [...agent.skills, newSkill.trim()] });
    setNewSkill('');
  };
  const removeSkill = (idx: number) => {
    onUpdate({ ...agent, skills: agent.skills.filter((_, i) => i !== idx) });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[520px] max-w-[90vw] rounded-xl overflow-hidden"
      style={{ background: 'rgba(12,12,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="rounded-lg flex items-center justify-center" style={{ width: 28, height: 28, background: `${agent.color}20` }}>
            <Bot size={14} style={{ color: agent.color }} />
          </div>
          <div>
            <span className="text-[12px] font-semibold" style={{ color: '#fff' }}>{agent.name}</span>
            <span className="text-[9px] ml-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{agent.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={agent.status} />
          <button onClick={onClose} className="p-1 rounded" style={{ color: 'rgba(255,255,255,0.3)' }}><X size={14} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1 py-2 text-[9px] font-medium tracking-wider transition-colors"
            style={{
              color: tab === t.id ? editColor : 'rgba(255,255,255,0.3)',
              borderBottom: tab === t.id ? `2px solid ${editColor}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            <t.icon size={10} />{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-[320px] overflow-y-auto">
        {tab === 'prompt' && (
          <div className="space-y-3">
            {/* Color */}
            <div className="flex items-center gap-2">
              <Palette size={10} style={{ color: 'rgba(255,255,255,0.4)' }} />
              <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>Color</span>
              <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer" style={{ background: 'transparent', border: 'none' }} />
              <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.3)' }}>{editColor}</span>
            </div>
            {/* System Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>System Prompt</span>
                <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Auto-saves</span>
              </div>
              <textarea
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                rows={6}
                className="w-full text-[10px] leading-relaxed p-3 rounded-lg outline-none resize-none font-mono-data"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
              />
              <button onClick={savePrompt} className="mt-2 flex items-center gap-1 text-[9px] px-3 py-1.5 rounded-lg" style={{ background: editColor, color: '#000' }}>
                <Save size={10} /> Save
              </button>
            </div>
          </div>
        )}

        {tab === 'skills' && (
          <div className="space-y-2">
            {agent.skills.map((skill, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-1.5">
                  <Sparkles size={9} style={{ color: editColor }} />
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{skill}</span>
                </div>
                <button onClick={() => removeSkill(i)} className="p-0.5" style={{ color: 'rgba(255,255,255,0.15)' }}><Trash2 size={8} /></button>
              </div>
            ))}
            <div className="flex gap-1">
              <input value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSkill(); }} placeholder="Add skill..." className="flex-1 text-[9px] px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }} />
              <button onClick={addSkill} className="px-2 py-1 rounded text-[9px]" style={{ background: editColor, color: '#000' }}><Plus size={10} /></button>
            </div>
          </div>
        )}

        {tab === 'memory' && (
          <div className="text-center py-4">
            <Brain size={20} style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Shared memory — {agent.name} learns from every interaction with Luka and other agents.</p>
            <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Persisted to Supabase across sessions.</p>
          </div>
        )}

        {tab === 'voice' && (
          <div className="text-center py-4">
            <Mic size={20} style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Voice settings for {agent.name}</p>
            <p className="text-[9px] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Piper TTS / ElevenLabs integration</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ORGANIZATION CANVAS
   ══════════════════════════════════════════════════════════════════════════ */
export function OrganizationCanvas() {
  const [agents, setAgents] = useState<AgentCard[]>(() => {
    try {
      const stored = localStorage.getItem('axe_organization_canvas');
      if (stored) return JSON.parse(stored);
    } catch { /* */ }
    return DEFAULT_AGENTS;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('axe_organization_canvas', JSON.stringify(agents));
  }, [agents]);

  const handleDrag = useCallback((id: string, x: number, y: number) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, x: Math.max(0, x), y: Math.max(0, y) } : a));
  }, []);

  const handleUpdate = useCallback((updated: AgentCard) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a));
  }, []);

  const selectedAgent = agents.find(a => a.id === selectedId) || null;

  // Build connection lines
  const connections: Array<{ from: AgentCard; to: AgentCard }> = [];
  for (const agent of agents) {
    for (const connId of agent.connections) {
      const target = agents.find(a => a.id === connId);
      if (target) connections.push({ from: agent, to: target });
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#050510' }}>
      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Connection lines */}
      {connections.map((conn, i) => (
        <ConnectionLine key={i} from={{ x: conn.from.x, y: conn.from.y }} to={{ x: conn.to.x, y: conn.to.y }} />
      ))}

      {/* Agent cards */}
      {agents.map(agent => (
        <AgentCardComponent
          key={agent.id}
          agent={agent}
          isSelected={selectedId === agent.id}
          onSelect={() => setSelectedId(agent.id)}
          onDrag={handleDrag}
        />
      ))}

      {/* Detail panel */}
      <AnimatePresence>
        {selectedAgent && (
          <DetailPanel
            agent={selectedAgent}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
          />
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Drag cards to arrange</span>
        <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
        <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Click to configure</span>
      </div>
    </div>
  );
}
