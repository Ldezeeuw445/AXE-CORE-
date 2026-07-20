/**
 * RuntimeInspector.tsx
 * ------------------------------------------------------------------
 * Inspector dock for the Runtime workspace. Clicking a node opens
 * this card with Name / Description / Status / Health / Provider /
 * Model / Capabilities / Memory / Tools / Events / Settings. Prompt
 * and skills are editable for agent-backed nodes and save back to
 * Supabase via runtimeEditsService.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import { X, Save, Plus, Trash2, ShieldCheck, ArrowUpRight } from 'lucide-react';
import type { OrganizationNode } from '@/services/platform/systemRegistryService';
import { saveAgentEdit } from '@/services/platform/runtimeEditsService';
import { findRouteForRuntimeNodeId } from '@/lib/navRegistry';

function statusColor(status: OrganizationNode['status']) {
  switch (status) {
    case 'healthy':
    case 'online': return '#10B981';
    case 'configured': return 'var(--accent-cyan)';
    case 'degraded': return '#F59E0B';
    case 'offline': return '#EF4444';
    default: return 'var(--text-muted)';
  }
}

function MetaRow({ label, value }: { label: string; value: unknown }) {
  const display = Array.isArray(value)
    ? (value.length ? value.join(', ') : 'none')
    : value === null || value === undefined || value === ''
      ? 'not registered'
      : String(value);
  return (
    <div className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[8px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[10px] mt-0.5 break-words" style={{ color: 'var(--text-primary)' }}>{display}</div>
    </div>
  );
}

export function RuntimeInspector({
  node, accentColor, onClose, onSaved,
}: {
  node: OrganizationNode;
  accentColor: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const agentSaveKey = typeof node.meta?.agentSaveKey === 'string' ? node.meta.agentSaveKey : null;
  const [editPrompt, setEditPrompt] = useState(typeof node.meta?.prompt === 'string' ? node.meta.prompt : '');
  const [skills, setSkills] = useState<string[]>(Array.isArray(node.meta?.skills) ? node.meta.skills as string[] : []);
  const [skillInput, setSkillInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const navigate = useNavigate();
  const tabRoute = findRouteForRuntimeNodeId(node.id);

  const handleSave = async () => {
    if (!agentSaveKey) return;
    setSaving(true);
    try {
      await saveAgentEdit(agentSaveKey, { systemPrompt: editPrompt, skills });
      setSavedAt(new Date().toLocaleTimeString());
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute right-3 top-3 bottom-14 z-30 w-[320px] max-w-[88vw] rounded-2xl overflow-hidden flex flex-col"
      style={{ background: '#05070a', border: `1px solid ${accentColor}44`, boxShadow: `0 0 30px ${accentColor}22` }}
    >
      <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ borderBottom: `1px solid ${accentColor}1f` }}>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: accentColor }}>{node.label}</div>
          <div className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{node.kind} · {node.source}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {tabRoute && (
            <button
              onClick={() => navigate(tabRoute)}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium"
              style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}55`, color: accentColor }}
            >
              Open tab <ArrowUpRight size={10} />
            </button>
          )}
          <button onClick={onClose} className="rounded-full p-1" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}><X size={12} /></button>
        </div>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        <div className="flex items-center gap-2 text-[10px] uppercase font-mono" style={{ color: statusColor(node.status) }}>
          <span className="rounded-full" style={{ width: 7, height: 7, background: statusColor(node.status) }} />
          {node.status}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetaRow label="Description" value={node.detail} />
          <MetaRow label="Children" value={node.children.length} />
          <MetaRow label="Provider" value={node.meta?.provider} />
          <MetaRow label="Model" value={node.meta?.model ?? node.meta?.preferredModels} />
          <MetaRow label="Capabilities" value={node.meta?.capabilities} />
          <MetaRow label="Memory" value={node.meta?.memory} />
          <MetaRow label="Tools" value={node.meta?.tools} />
          <MetaRow label="Events / Last activity" value={node.meta?.activity ?? node.meta?.lastTestAt ?? node.meta?.updated_at} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Settings — System Prompt</div>
            {!agentSaveKey && (
              <div className="flex items-center gap-1 text-[8px]" style={{ color: 'var(--text-muted)' }}>
                <ShieldCheck size={10} /> read-only
              </div>
            )}
          </div>
          <textarea
            value={editPrompt}
            onChange={e => setEditPrompt(e.target.value)}
            readOnly={!agentSaveKey}
            rows={5}
            placeholder={agentSaveKey ? 'No prompt registered yet — write one and save.' : 'Prompt is not registered for this node.'}
            className="w-full text-[10px] leading-relaxed p-2 rounded-lg resize-none outline-none"
            style={{ background: '#030405', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(165,243,252,0.8)' }}
          />
        </div>

        {agentSaveKey && (
          <div>
            <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Skills</div>
            <div className="flex flex-wrap gap-1 mb-1">
              {skills.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                  {s}
                  <button onClick={() => setSkills(list => list.filter((_, idx) => idx !== i))} style={{ color: 'var(--text-muted)' }}><Trash2 size={8} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && skillInput.trim()) { setSkills(list => [...list, skillInput.trim()]); setSkillInput(''); } }}
                placeholder="Add skill…"
                className="flex-1 text-[10px] px-2 py-1 rounded-lg outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
              />
              <button onClick={() => { if (skillInput.trim()) { setSkills(list => [...list, skillInput.trim()]); setSkillInput(''); } }} className="px-2 py-1 rounded-lg" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Plus size={10} /></button>
            </div>
          </div>
        )}

        {agentSaveKey && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-medium disabled:opacity-50"
            style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55`, color: accentColor }}
          >
            {saving ? 'Saving…' : <><Save size={11} /> Save to Supabase</>}
          </button>
        )}
        {savedAt && <div className="text-center text-[8px]" style={{ color: 'var(--text-muted)' }}>Saved {savedAt}</div>}
      </div>
    </motion.div>
  );
}
