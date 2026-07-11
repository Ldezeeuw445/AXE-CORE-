/**
 * ArchitectureRedesign.tsx
 * ------------------------------------------------------------------
 * Linear-app inspired architecture cards for the Home page.
 * Each card: matte black bg, thin white border, provider-specific accent.
 * Providers all get their own card. Drag & drop enabled.
 */

import { useState, useCallback } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import {
  Activity, Brain, Server, Globe, Code2, FileText, Zap,
  ChevronRight, Lock, Unlock, Cpu, Layers, Sparkles,
  X, GripVertical, Plus, Edit3, Save, Trash2,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
export interface ArchCard {
  id: string;
  type: 'provider' | 'orchestrator' | 'tool' | 'memory' | 'health';
  title: string;
  subtitle: string;
  accent: string;       // hex accent color
  status: 'active' | 'idle' | 'error' | 'configuring';
  items: ArchItem[];
  expanded?: boolean;
  editable?: boolean;
}

export interface ArchItem {
  id: string;
  label: string;
  value?: string;
  icon?: string;
  status?: 'ok' | 'warn' | 'error' | 'neutral';
}

/* ─── Color map per provider/tool ──────────────────────────────────────── */
export const ACCENTS: Record<string, string> = {
  // Providers — each gets own accent
  anthropic:  '#D4A574',   // warm beige
  openai:     '#10A37F',   // OpenAI green
  google:     '#4285F4',   // Google blue
  xai:        '#1DA1F2',   // X blue
  groq:       '#F55036',   // Groq red-orange
  openrouter: '#8B5CF6',   // purple
  ollama:     '#FF6B35',   // Ollama orange
  openhands:  '#00D4AA',   // teal
  openjarvis: '#6C5CE7',   // indigo
  openclaw:   '#E17055',   // coral
  kilocode:   '#00B894',   // mint
  crewai:     '#FDCB6E',   // gold
  hermes:     '#A29BFE',   // lavender
  // Orchestrator
  langgraph:  '#22D3EE',   // cyan — same as kilocode (orchestrator → kilocode)
  // Tools
  kimiclaw:   '#F59E0B',   // amber
  kimicode:   '#10B981',   // emerald
  kimiwork:   '#8B5CF6',   // violet
  // System
  memory:     '#EC4899',   // pink
  health:     '#22D3EE',   // cyan
  skills:     '#F472B6',   // rose
};

/* ─── Status dot ───────────────────────────────────────────────────────── */
function StatusDot({ status, accent }: { status: string; accent: string }) {
  const colors: Record<string, string> = {
    active: accent,
    idle: '#6B7280',
    error: '#EF4444',
    configuring: '#F59E0B',
    ok: '#10B981',
    warn: '#F59E0B',
    neutral: '#6B7280',
  };
  return <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: colors[status] || colors.idle, boxShadow: status === 'active' ? `0 0 6px ${accent}60` : 'none' }} />;
}

/* ─── Individual Card ──────────────────────────────────────────────────── */
function ArchCardComponent({
  card,
  onToggle,
  onDeleteItem,
  onAddItem,
}: {
  card: ArchCard;
  onToggle: (id: string) => void;
  onDeleteItem: (cardId: string, itemId: string) => void;
  onAddItem: (cardId: string, label: string, value?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');

  return (
    <Reorder.Item
      value={card}
      id={card.id}
      style={{ listStyle: 'none' }}
    >
      <motion.div
        layout
        className="rounded-xl overflow-hidden"
        style={{
          background: '#0a0a0a',
          border: `1px solid rgba(255,255,255,0.08)`,
        }}
      >
        {/* Card Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer"
          style={{ borderBottom: card.expanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
          onClick={() => onToggle(card.id)}
        >
          <GripVertical size={12} style={{ color: 'rgba(255,255,255,0.15)', cursor: 'grab' }} />
          <StatusDot status={card.status} accent={card.accent} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold truncate" style={{ color: card.accent }}>{card.title}</span>
              {card.status === 'active' && (
                <span className="text-[7px] px-1 rounded-full" style={{ background: `${card.accent}18`, color: card.accent, border: `1px solid ${card.accent}30` }}>LIVE</span>
              )}
            </div>
            <span className="text-[9px] truncate block" style={{ color: 'rgba(255,255,255,0.35)' }}>{card.subtitle}</span>
          </div>
          <ChevronRight
            size={12}
            style={{
              color: 'rgba(255,255,255,0.25)',
              transform: card.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>

        {/* Card Body */}
        <AnimatePresence>
          {card.expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 py-2 space-y-1.5">
                {card.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <StatusDot status={item.status || 'neutral'} accent={card.accent} />
                    <span className="text-[10px] flex-1 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{item.label}</span>
                    {item.value && (
                      <span className="text-[9px] truncate max-w-[80px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.value}</span>
                    )}
                    <button
                      onClick={() => onDeleteItem(card.id, item.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    >
                      <Trash2 size={8} style={{ color: 'rgba(255,255,255,0.2)' }} />
                    </button>
                  </div>
                ))}

                {/* Add item */}
                {card.editable && (
                  <div className="pt-1">
                    {editing ? (
                      <div className="flex gap-1">
                        <input
                          value={newLabel}
                          onChange={e => setNewLabel(e.target.value)}
                          placeholder="Label"
                          className="flex-1 text-[9px] px-1.5 py-0.5 rounded outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
                          autoFocus
                        />
                        <input
                          value={newValue}
                          onChange={e => setNewValue(e.target.value)}
                          placeholder="Value"
                          className="flex-1 text-[9px] px-1.5 py-0.5 rounded outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
                        />
                        <button
                          onClick={() => { if (newLabel.trim()) { onAddItem(card.id, newLabel, newValue); setNewLabel(''); setNewValue(''); setEditing(false); }}}
                          className="px-1.5 py-0.5 rounded text-[8px]"
                          style={{ background: card.accent, color: '#000' }}
                        >
                          <Save size={9} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-1 text-[9px] py-0.5"
                        style={{ color: 'rgba(255,255,255,0.25)' }}
                      >
                        <Plus size={9} /> Add skill / prompt
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Reorder.Item>
  );
}

/* ─── Architecture Panel ───────────────────────────────────────────────── */
interface ArchitectureRedesignProps {
  cards: ArchCard[];
  onCardsChange: (cards: ArchCard[]) => void;
}

export function ArchitectureRedesign({ cards, onCardsChange }: ArchitectureRedesignProps) {
  const handleReorder = useCallback((newOrder: ArchCard[]) => {
    onCardsChange(newOrder);
  }, [onCardsChange]);

  const toggleCard = useCallback((id: string) => {
    onCardsChange(cards.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c));
  }, [cards, onCardsChange]);

  const deleteItem = useCallback((cardId: string, itemId: string) => {
    onCardsChange(cards.map(c =>
      c.id === cardId ? { ...c, items: c.items.filter(i => i.id !== itemId) } : c
    ));
  }, [cards, onCardsChange]);

  const addItem = useCallback((cardId: string, label: string, value?: string) => {
    onCardsChange(cards.map(c =>
      c.id === cardId
        ? { ...c, items: [...c.items, { id: Date.now().toString(), label, value, status: 'neutral' }] }
        : c
    ));
  }, [cards, onCardsChange]);

  return (
    <Reorder.Group
      axis="y"
      values={cards}
      onReorder={handleReorder}
      className="space-y-2"
    >
      {cards.map(card => (
        <ArchCardComponent
          key={card.id}
          card={card}
          onToggle={toggleCard}
          onDeleteItem={deleteItem}
          onAddItem={addItem}
        />
      ))}
    </Reorder.Group>
  );
}
