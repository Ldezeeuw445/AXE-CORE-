/**
 * RuntimeInspector — node detail + skill catalog picker for agent nodes.
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router';
import { X, Save, Plus, Trash2, ShieldCheck, ArrowUpRight, Search, Sparkles } from 'lucide-react';
import type { OrganizationNode } from '@/application/system/systemRegistryService';
import { saveAgentEdit } from '@/infrastructure/persistence/runtimeEditsService';
import { findRouteForRuntimeNodeId } from '@/domain/navRegistry';
import {
  loadAllSkills,
  setSkillsForAgent,
  addCustomSkill,
  getSkillsForAgent,
} from '@/infrastructure/persistence/skillRegistryService';
import { SKILL_CATEGORIES, type SkillDefinition } from '@/domain/skills/skillCatalog';

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
  const [catalog, setCatalog] = useState<SkillDefinition[]>([]);
  const [skillQuery, setSkillQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showPicker, setShowPicker] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newInstr, setNewInstr] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const navigate = useNavigate();
  const tabRoute = findRouteForRuntimeNodeId(node.id);

  useEffect(() => {
    void loadAllSkills().then(setCatalog);
    if (agentSaveKey) {
      void getSkillsForAgent(agentSaveKey).then(ids => {
        if (ids.length) setSkills(ids);
      });
    }
  }, [agentSaveKey, node.id]);

  const skillMeta = useMemo(() => {
    const map = new Map(catalog.map(s => [s.id, s]));
    return map;
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    return catalog.filter(s => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (skills.includes(s.id)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.id.includes(q) || s.description.toLowerCase().includes(q);
    });
  }, [catalog, skillQuery, categoryFilter, skills]);

  const toggleSkill = (id: string) => {
    setSkills(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const handleCreateSkill = async () => {
    if (!newName.trim()) return;
    const created = await addCustomSkill({
      name: newName.trim(),
      description: newDesc.trim() || newName.trim(),
      instruction: newInstr.trim() || newDesc.trim() || newName.trim(),
    });
    setCatalog(await loadAllSkills());
    setSkills(list => [...list, created.id]);
    setNewName('');
    setNewDesc('');
    setNewInstr('');
  };

  const handleSave = async () => {
    if (!agentSaveKey) return;
    setSaving(true);
    try {
      await saveAgentEdit(agentSaveKey, { systemPrompt: editPrompt, skills });
      await setSkillsForAgent(agentSaveKey, skills);
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
      className="absolute right-3 top-3 bottom-14 z-30 w-[340px] max-w-[90vw] rounded-2xl overflow-hidden flex flex-col"
      style={{ background: '#000000', border: `1px solid ${accentColor}44`, boxShadow: `0 0 30px ${accentColor}22` }}
    >
      <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ borderBottom: `1px solid ${accentColor}1f` }}>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: accentColor }}>{node.label}</div>
          <div className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{node.kind} · {node.source}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {tabRoute && (
            <button onClick={() => navigate(tabRoute)} className="flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium" style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}55`, color: accentColor }}>
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>System Prompt</div>
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
            rows={4}
            placeholder={agentSaveKey ? 'No prompt registered yet — write one and save.' : 'Prompt is not registered for this node.'}
            className="w-full text-[10px] leading-relaxed p-2 rounded-lg resize-none outline-none"
            style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(165,243,252,0.8)' }}
          />
        </div>

        {agentSaveKey && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[9px] uppercase tracking-widest flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Sparkles size={10} style={{ color: accentColor }} /> Skills ({skills.length})
              </div>
              <button
                type="button"
                onClick={() => setShowPicker(v => !v)}
                className="text-[9px] px-2 py-0.5 rounded-full"
                style={{ background: showPicker ? `${accentColor}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${showPicker ? accentColor + '66' : 'rgba(255,255,255,0.08)'}`, color: showPicker ? accentColor : 'var(--text-muted)' }}
              >
                {showPicker ? 'Hide catalog' : 'Browse catalog'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {skills.length === 0 && (
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>No skills assigned — open catalog</span>
              )}
              {skills.map(id => {
                const s = skillMeta.get(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px]" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.22)', color: 'rgba(165,243,252,0.9)' }} title={s?.description}>
                    {s?.name ?? id}
                    <button type="button" onClick={() => toggleSkill(id)} style={{ color: 'var(--text-muted)' }}><Trash2 size={8} /></button>
                  </span>
                );
              })}
            </div>

            {showPicker && (
              <div className="rounded-xl p-2 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-1.5">
                  <Search size={11} style={{ color: 'var(--text-muted)' }} />
                  <input
                    value={skillQuery}
                    onChange={e => setSkillQuery(e.target.value)}
                    placeholder="Search skills…"
                    className="flex-1 text-[10px] bg-transparent outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => setCategoryFilter('all')} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: categoryFilter === 'all' ? 'rgba(34,211,238,0.15)' : 'transparent', color: categoryFilter === 'all' ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>All</button>
                  {SKILL_CATEGORIES.map(c => (
                    <button key={c.id} type="button" onClick={() => setCategoryFilter(c.id)} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: categoryFilter === c.id ? 'rgba(34,211,238,0.15)' : 'transparent', color: categoryFilter === c.id ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{c.label}</button>
                  ))}
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredCatalog.slice(0, 40).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSkill(s.id)}
                      className="w-full text-left rounded-lg px-2 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      <div className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                      <div className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{s.description}</div>
                    </button>
                  ))}
                  {filteredCatalog.length === 0 && (
                    <div className="text-[9px] py-2 text-center" style={{ color: 'var(--text-muted)' }}>No matching skills</div>
                  )}
                </div>

                <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-[8px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Create custom skill</div>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" className="w-full text-[10px] px-2 py-1 rounded mb-1 outline-none" style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }} />
                  <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Short description" className="w-full text-[10px] px-2 py-1 rounded mb-1 outline-none" style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }} />
                  <textarea value={newInstr} onChange={e => setNewInstr(e.target.value)} placeholder="Instruction body (how the agent should apply this skill)" rows={2} className="w-full text-[10px] px-2 py-1 rounded mb-1 outline-none resize-none" style={{ background: '#050505', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }} />
                  <button type="button" onClick={() => void handleCreateSkill()} className="w-full flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-medium" style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', color: 'var(--accent-cyan)' }}>
                    <Plus size={11} /> Add skill to library
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {agentSaveKey && (
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-medium disabled:opacity-50"
            style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55`, color: accentColor }}
          >
            {saving ? 'Saving…' : <><Save size={11} /> Save skills & prompt</>}
          </button>
        )}
        {savedAt && <div className="text-center text-[8px]" style={{ color: 'var(--text-muted)' }}>Saved {savedAt}</div>}
      </div>
    </motion.div>
  );
}
