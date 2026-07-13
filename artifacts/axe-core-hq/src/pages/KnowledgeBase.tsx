import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Search, Edit2, Trash2, X, Check, Database, ExternalLink } from 'lucide-react';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { getSupabase } from '@/lib/supabaseClient';

type AI = 'axe-core' | 'axe-companion' | 'axe-intel';

const AI_CFG: Record<AI, { label: string; color: string; description: string }> = {
  'axe-core':      { label: 'AXE Core',      color: '#22D3EE', description: 'Central intelligence — system behavior, routing rules, capabilities' },
  'axe-companion': { label: 'AXE Companion',  color: '#10B981', description: 'Personal assistant — preferences, routines, personal context' },
  'axe-intel':     { label: 'AXE Intel',      color: '#3B82F6', description: 'Market intelligence — research, analysis templates, data sources' },
};

interface Doc { id: string; title: string; content: string; category: string; ai: AI; updatedAt: number; source: 'user' | 'axe-core'; }

// KB documents live in their own core_kb_documents table (see chatActionService.ts
// resolveRecordDeepLink) so both this page and chat deep-links share one source of
// truth and per-row CRUD scales past a handful of docs, unlike the old single JSON
// blob under 'axe_kb_docs' in user_settings.
type KbDocRow = {
  id: string;
  title: string;
  content: string | null;
  category: string | null;
  ai: AI;
  source: 'user' | 'axe-core';
  updated_at: string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wraps every case-insensitive occurrence of `query` in `text` with <mark> so
// cross-tab "search everywhere" results show at a glance why they matched.
function highlightMatches(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} style={{ background: 'rgba(34,211,238,0.35)', color: 'var(--text-primary)', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
    ) : (
      part
    )
  );
}

function fromRow(row: KbDocRow): Doc {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? '',
    category: row.category ?? 'General',
    ai: row.ai,
    updatedAt: new Date(row.updated_at).getTime(),
    source: row.source,
  };
}

// One-time migration: documents used to live as a single JSON blob under
// 'axe_kb_docs', either in localStorage or synced to the shared user_settings
// table. Carries any legacy docs found there into core_kb_documents so
// existing users don't see an empty Knowledge Base after this upgrade, then
// marks migration done (via a localStorage flag) so it never re-runs/re-inserts.
const LEGACY_KEY = 'axe_kb_docs';
const MIGRATION_FLAG = 'axe_kb_docs_migrated_v1';

async function migrateLegacyDocs(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  let legacy: Array<Partial<Doc>> = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]');
  } catch { /* ignore malformed local cache */ }

  if (legacy.length === 0) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data } = await sb.from('user_settings').select('value').eq('user_id', user.id).eq('key', LEGACY_KEY).single();
        if (Array.isArray(data?.value)) legacy = data.value as Array<Partial<Doc>>;
      }
    } catch { /* no legacy blob to migrate — fine */ }
  }

  if (legacy.length > 0) {
    const rows = legacy
      .filter((d): d is Doc => !!d.title)
      .map(d => ({
        title: d.title!,
        content: d.content ?? '',
        category: d.category ?? 'General',
        ai: (d.ai ?? 'axe-core') as AI,
        source: d.source ?? 'user',
        created_at: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
        updated_at: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
      }));
    const { error } = await sb.from('core_kb_documents').insert(rows);
    if (error) {
      console.warn('[KnowledgeBase] legacy migration failed, will retry next load:', error.message);
      return; // Don't set the flag — try again next time so docs aren't lost.
    }
  }

  localStorage.setItem(MIGRATION_FLAG, '1');
  localStorage.removeItem(LEGACY_KEY);
}

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAI, setActiveAI] = useState<AI>('axe-core');
  const [search, setSearch] = useState('');
  const [searchEverywhere, setSearchEverywhere] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supaConnected = !!(import.meta.env.VITE_SUPABASE_URL || localStorage.getItem('axe_supa_url'));
  // Deep-link support: chat can send ?open=<docId> to jump straight to a
  // specific document (see chatActionService.ts resolveRecordDeepLink).
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const docRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [newDoc, setNewDoc] = useState({ title: '', content: '', category: 'General' });

  const refresh = async () => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb.from('core_kb_documents').select('*').order('updated_at', { ascending: false });
    if (error) {
      console.warn('[KnowledgeBase] refresh:', error.message);
      setErrorMsg(`Couldn't load documents: ${error.message}`);
    }
    setDocs((data ?? []).map(fromRow as (row: unknown) => Doc));
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    const init = async () => {
      const sb = getSupabase();
      if (sb) await migrateLegacyDocs(sb);
      if (!alive) return;
      await refresh();
    };
    void init();
    return () => { alive = false; };
  }, []);

  // Once docs are loaded, honor a deep-link (?open=<id>) by switching to its
  // AI tab, clearing any search filter that would hide it, scrolling it into
  // view, and briefly highlighting it. Falls through silently if the id no
  // longer exists.
  useEffect(() => {
    if (!openId || loading) return;
    const doc = docs.find(d => d.id === openId);
    if (!doc) return;
    setActiveAI(doc.ai);
    setSearch('');
    setHighlightedId(openId);
    requestAnimationFrame(() => {
      docRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearParams = new URLSearchParams(searchParams);
    clearParams.delete('open');
    setSearchParams(clearParams, { replace: true });
    const timer = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading, docs]);

  const matchesSearch = (d: Doc) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
  };

  // "Search everywhere" mode only applies while there's an active query — once
  // it's cleared we fall back to the normal per-tab view instead of showing
  // every document across all three AIs.
  const crossTabSearch = searchEverywhere && search.trim().length > 0;

  const filtered = docs.filter(d => (crossTabSearch ? true : d.ai === activeAI) && matchesSearch(d));

  // Selecting a result while searching everywhere jumps to that doc's AI tab,
  // clears the query, and reuses the deep-link highlight/scroll behavior.
  const jumpToDoc = (doc: Doc) => {
    setActiveAI(doc.ai);
    setSearch('');
    setHighlightedId(doc.id);
    requestAnimationFrame(() => {
      docRefs.current[doc.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setTimeout(() => setHighlightedId(null), 3000);
  };

  const addDoc = async () => {
    if (!newDoc.title.trim()) return;
    const sb = getSupabase();
    if (!sb) {
      setErrorMsg("Can't save — Supabase isn't connected. Connect it in Settings first.");
      return;
    }
    setErrorMsg(null);
    const { error } = await sb.from('core_kb_documents').insert({
      title: newDoc.title.trim(),
      content: newDoc.content.trim(),
      category: newDoc.category,
      ai: activeAI,
      source: 'user',
    });
    if (error) {
      console.warn('[KnowledgeBase] addDoc:', error.message);
      setErrorMsg(`Couldn't save the document: ${error.message}`);
      return;
    }
    setNewDoc({ title: '', content: '', category: 'General' });
    setAdding(false);
    await refresh();
  };

  const removeDoc = async (id: string) => {
    const sb = getSupabase();
    if (!sb) {
      setErrorMsg("Can't delete — Supabase isn't connected. Connect it in Settings first.");
      return;
    }
    setErrorMsg(null);
    const { error } = await sb.from('core_kb_documents').delete().eq('id', id);
    if (error) {
      console.warn('[KnowledgeBase] removeDoc:', error.message);
      setErrorMsg(`Couldn't delete the document: ${error.message}`);
      return;
    }
    await refresh();
  };

  const [editContent, setEditContent] = useState('');

  const startEdit = (doc: Doc) => { setEditing(doc.id); setEditContent(doc.content); };
  const saveEdit = async () => {
    const sb = getSupabase();
    if (!sb || !editing) {
      if (!sb) setErrorMsg("Can't save — Supabase isn't connected. Connect it in Settings first.");
      setEditing(null);
      return;
    }
    setErrorMsg(null);
    const { error } = await sb.from('core_kb_documents').update({ content: editContent, updated_at: new Date().toISOString() }).eq('id', editing);
    if (error) {
      console.warn('[KnowledgeBase] saveEdit:', error.message);
      setErrorMsg(`Couldn't save changes: ${error.message}`);
    }
    setEditing(null);
    await refresh();
  };

  const totals = { 'axe-core': docs.filter(d => d.ai === 'axe-core').length, 'axe-companion': docs.filter(d => d.ai === 'axe-companion').length, 'axe-intel': docs.filter(d => d.ai === 'axe-intel').length };

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Knowledge Base</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{loading ? 'Loading…' : `${docs.length} documents across 3 AI systems`}</p>
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

      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        {crossTabSearch ? `Showing results from all 3 AI systems for "${search}"` : AI_CFG[activeAI].description}
      </p>

      {errorMsg && (
        <div className="flex items-center justify-between gap-2 text-xs-custom px-3 py-2 rounded-lg mb-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--error, #f87171)' }}>
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ color: 'inherit' }}><X size={12} /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-2">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={searchEverywhere ? 'Search across all AI systems...' : `Search ${AI_CFG[activeAI].label} documents...`}
          className="w-full text-small pl-8 pr-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />
      </div>
      <label className="flex items-center gap-1.5 mb-3 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={searchEverywhere}
          onChange={e => setSearchEverywhere(e.target.checked)}
          className="w-3 h-3"
        />
        <span className="text-xs-custom" style={{ color: searchEverywhere ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
          Search everywhere (all 3 AI systems)
        </span>
      </label>

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
                  <button onClick={() => { void addDoc(); }} className="px-4 py-1.5 rounded-lg text-xs-custom font-medium" style={{ background: AI_CFG[activeAI].color, color: '#000' }}>Save Document</button>
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
          <p className="text-small" style={{ color: 'var(--text-muted)' }}>
            {crossTabSearch ? 'No documents match your search' : `No documents yet for ${AI_CFG[activeAI].label}`}
          </p>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            {crossTabSearch ? 'Try a different search term' : 'Add instructions, context, or rules that this AI should know'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc, i) => (
            <motion.div
              key={doc.id}
              ref={el => { docRefs.current[doc.id] = el; }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              style={highlightedId === doc.id ? { boxShadow: '0 0 0 2px rgba(34,211,238,0.4)', borderRadius: 12 } : undefined}
              onClick={crossTabSearch && editing !== doc.id ? () => jumpToDoc(doc) : undefined}
              className={crossTabSearch ? 'cursor-pointer' : undefined}
            >
              <WidgetCard title="">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 flex-1">
                      <FileText size={15} style={{ color: AI_CFG[doc.ai].color, flexShrink: 0, marginTop: 1 }} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{crossTabSearch ? highlightMatches(doc.title, search) : doc.title}</span>
                          {crossTabSearch && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: `${AI_CFG[doc.ai].color}15`, color: AI_CFG[doc.ai].color, border: `1px solid ${AI_CFG[doc.ai].color}30` }}>
                              <ExternalLink size={8} /> {AI_CFG[doc.ai].label}
                            </span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${AI_CFG[doc.ai].color}15`, color: AI_CFG[doc.ai].color }}>{doc.category}</span>
                          {doc.source === 'axe-core' && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>AXE Added</span>}
                        </div>
                        {editing === doc.id ? (
                          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} className="w-full text-xs-custom px-2 py-1.5 rounded mt-1 outline-none resize-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }} />
                        ) : (
                          doc.content && <p className="text-xs-custom mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{crossTabSearch ? highlightMatches(doc.content, search) : doc.content}</p>
                        )}
                        <span className="text-[9px] mt-1 block" style={{ color: 'var(--text-muted)' }}>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {editing === doc.id ? (
                        <>
                          <button onClick={e => { e.stopPropagation(); void saveEdit(); }} style={{ color: 'var(--success)' }}><Check size={13} /></button>
                          <button onClick={e => { e.stopPropagation(); setEditing(null); }} style={{ color: 'var(--text-muted)' }}><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={e => { e.stopPropagation(); startEdit(doc); }} style={{ color: 'var(--text-muted)' }}><Edit2 size={12} /></button>
                          <button onClick={e => { e.stopPropagation(); void removeDoc(doc.id); }} style={{ color: 'var(--text-muted)' }}><Trash2 size={12} /></button>
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
