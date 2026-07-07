import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Search, Edit2, Trash2, X, Check, Database, ExternalLink } from 'lucide-react';
import { WidgetCard } from '@/components/widgets/WidgetCard';

type AI = 'axe-core' | 'axe-companion' | 'axe-intel';

const AI_CFG: Record<AI, { label: string; color: string; description: string }> = {
  'axe-core':      { label: 'AXE Core',      color: '#22D3EE', description: 'Central intelligence — system behavior, routing rules, capabilities' },
  'axe-companion': { label: 'AXE Companion',  color: '#10B981', description: 'Personal assistant — preferences, routines, personal context' },
  'axe-intel':     { label: 'AXE Intel',      color: '#3B82F6', description: 'Market intelligence — research, analysis templates, data sources' },
};

interface Doc { id: string; title: string; content: string; category: string; ai: AI; updatedAt: number; source: 'user' | 'axe-core'; }

function loadDocs(): Doc[] {
  try { return JSON.parse(localStorage.getItem('axe_kb_docs') ?? '[]'); } catch { return []; }
}
function saveDocs(d: Doc[]) { localStorage.setItem('axe_kb_docs', JSON.stringify(d)); }

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<Doc[]>(loadDocs);
  const [activeAI, setActiveAI] = useState<AI>('axe-core');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const supaConnected = !!localStorage.getItem('axe_supa_url');

  const [newDoc, setNewDoc] = useState({ title: '', content: '', category: 'General' });

  useEffect(() => { saveDocs(docs); }, [docs]);

  const filtered = docs.filter(d => {
    const matchAI = d.ai === activeAI;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.content.toLowerCase().includes(search.toLowerCase());
    return matchAI && matchSearch;
  });

  const addDoc = () => {
    if (!newDoc.title.trim()) return;
    const doc: Doc = {
      id: Date.now().toString(),
      title: newDoc.title.trim(),
      content: newDoc.content.trim(),
      category: newDoc.category,
      ai: activeAI,
      updatedAt: Date.now(),
      source: 'user',
    };
    const updated = [doc, ...docs];
    setDocs(updated);
    setNewDoc({ title: '', content: '', category: 'General' });
    setAdding(false);
  };

  const removeDoc = (id: string) => setDocs(docs.filter(d => d.id !== id));

  const editingDoc = editing ? docs.find(d => d.id === editing) : null;
  const [editContent, setEditContent] = useState('');

  const startEdit = (doc: Doc) => { setEditing(doc.id); setEditContent(doc.content); };
  const saveEdit = () => {
    setDocs(docs.map(d => d.id === editing ? { ...d, content: editContent, updatedAt: Date.now() } : d));
    setEditing(null);
  };

  const totals = { 'axe-core': docs.filter(d => d.ai === 'axe-core').length, 'axe-companion': docs.filter(d => d.ai === 'axe-companion').length, 'axe-intel': docs.filter(d => d.ai === 'axe-intel').length };

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Knowledge Base</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{docs.length} documents across 3 AI systems</p>
        </div>
        <div className="flex items-center gap-2">
          {supaConnected ? (
            <span className="text-xs-custom px-2 py-1 rounded flex items-center gap-1" style={{ background: 'rgba(62,207,142,0.1)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.2)' }}>
              <Database size={10} /> Supabase
            </span>
          ) : (
            <a href="/settings" className="text-xs-custom px-2 py-1 rounded flex items-center gap-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <Database size={10} /> Connect Supabase
            </a>
          )}
          <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1.5 text-xs-custom px-3 py-1.5 rounded-lg" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
            <Plus size={13} /> Add Document
          </button>
        </div>
      </div>

      {/* AI selector tabs */}
      <div className="flex gap-2 mb-4">
        {(Object.entries(AI_CFG) as [AI, typeof AI_CFG[AI]][]).map(([id, cfg]) => (
          <button
            key={id}
            onClick={() => setActiveAI(id)}
            className="flex-1 py-2 px-3 rounded-xl text-xs-custom font-medium transition-all"
            style={{
              background: activeAI === id ? `${cfg.color}15` : 'var(--bg-surface)',
              border: `1px solid ${activeAI === id ? cfg.color + '40' : 'var(--border-subtle)'}`,
              color: activeAI === id ? cfg.color : 'var(--text-muted)',
            }}
          >
            <div className="font-semibold">{cfg.label}</div>
            <div className="text-[9px] mt-0.5" style={{ color: activeAI === id ? `${cfg.color}aa` : 'var(--text-muted)' }}>{totals[id]} docs</div>
          </button>
        ))}
      </div>

      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>{AI_CFG[activeAI].description}</p>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documents..."
          className="w-full text-small pl-8 pr-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -8, height: 0 }} className="overflow-hidden mb-3">
            <WidgetCard title={`New Document for ${AI_CFG[activeAI].label}`}>
              <div className="space-y-2">
                <input autoFocus value={newDoc.title} onChange={e => setNewDoc(n => ({ ...n, title: e.target.value }))} placeholder="Document title..." className="w-full text-small px-3 py-2 rounded-lg outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
                <input value={newDoc.category} onChange={e => setNewDoc(n => ({ ...n, category: e.target.value }))} placeholder="Category (e.g. Architecture, Behavior)" className="w-full text-xs-custom px-3 py-1.5 rounded-lg outline-none" style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }} />
                <textarea value={newDoc.content} onChange={e => setNewDoc(n => ({ ...n, content: e.target.value }))} placeholder="Content — instructions, context, information for this AI..." rows={4} className="w-full text-xs-custom px-3 py-2 rounded-lg outline-none resize-none" style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }} />
                <div className="flex gap-2">
                  <button onClick={addDoc} className="px-4 py-1.5 rounded-lg text-xs-custom font-medium" style={{ background: AI_CFG[activeAI].color, color: '#000' }}>Save Document</button>
                  <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg text-xs-custom" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>Cancel</button>
                </div>
              </div>
            </WidgetCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Doc list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <FileText size={28} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <p className="text-small" style={{ color: 'var(--text-muted)' }}>No documents yet for {AI_CFG[activeAI].label}</p>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>Add instructions, context, or rules that this AI should know</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc, i) => (
            <motion.div key={doc.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <WidgetCard title="">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 flex-1">
                      <FileText size={15} style={{ color: AI_CFG[doc.ai].color, flexShrink: 0, marginTop: 1 }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{doc.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${AI_CFG[doc.ai].color}15`, color: AI_CFG[doc.ai].color }}>{doc.category}</span>
                          {doc.source === 'axe-core' && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>AXE Added</span>}
                        </div>
                        {editing === doc.id ? (
                          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} className="w-full text-xs-custom px-2 py-1.5 rounded mt-1 outline-none resize-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }} />
                        ) : (
                          doc.content && <p className="text-xs-custom mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{doc.content}</p>
                        )}
                        <span className="text-[9px] mt-1 block" style={{ color: 'var(--text-muted)' }}>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {editing === doc.id ? (
                        <>
                          <button onClick={saveEdit} style={{ color: 'var(--success)' }}><Check size={13} /></button>
                          <button onClick={() => setEditing(null)} style={{ color: 'var(--text-muted)' }}><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(doc)} style={{ color: 'var(--text-muted)' }}><Edit2 size={12} /></button>
                          <button onClick={() => removeDoc(doc.id)} style={{ color: 'var(--text-muted)' }}><Trash2 size={12} /></button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </WidgetCard>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
