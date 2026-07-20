import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Database, Share2, Search, Plus, Trash2, FileText, MessageSquare, Code2, Globe, Sparkles } from 'lucide-react';
import { loadMemories, saveMemory, deleteMemory } from '@/services/memory/coreDB';
import type { CoreMemoryEntry } from '@/services/memory/coreDB';

interface MemoryEntry {
  id: string;
  timestamp: string;
  category: 'global' | 'specialist' | 'shared';
  specialist?: string;
  content: string;
  tags: string[];
}

const SPECIALIST_ICONS: Record<string, typeof Code2> = {
  code: Code2,
  search: Globe,
  analyze: FileText,
  chat: MessageSquare,
};

const SPECIALIST_COLORS: Record<string, string> = {
  code: '#10B981',
  search: '#F59E0B',
  analyze: '#8B5CF6',
  chat: '#22D3EE',
};

function mapToEntry(core: CoreMemoryEntry): MemoryEntry {
  const source = core.source;
  const category: MemoryEntry['category'] =
    source === 'manual' || source === 'global' ? 'global' :
    source === 'shared' ? 'shared' : 'specialist';
  const specialist = category === 'specialist' ? source : undefined;
  return {
    id: core.id,
    timestamp: new Date(core.created_at).toLocaleTimeString('en-US', { hour12: false }),
    category,
    specialist,
    content: core.content,
    tags: core.tags.filter(t => !t.startsWith('specialist:')),
  };
}

function mapToCore(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): { content: string; tags: string[]; source: string } {
  const tags = [...entry.tags];
  if (entry.specialist) tags.push(`specialist:${entry.specialist}`);
  const source = entry.category === 'global' ? 'manual' : entry.category === 'shared' ? 'shared' : entry.specialist || 'specialist';
  return { content: entry.content, tags, source };
}

export function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'global' | 'specialist' | 'shared'>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryEntry['category']>('global');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const loaded = await loadMemories(50);
        if (loaded.length > 0) {
          setMemories(loaded.map(mapToEntry));
        } else {
          // Fallback to localStorage if Supabase is empty
          const stored = localStorage.getItem('axe_memory');
          if (stored) {
            try { setMemories(JSON.parse(stored)); } catch { /* ignore */ }
          }
        }
      } catch {
        // Fallback to localStorage on error
        const stored = localStorage.getItem('axe_memory');
        if (stored) {
          try { setMemories(JSON.parse(stored)); } catch { /* ignore */ }
        }
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const syncLocalStorage = (m: MemoryEntry[]) => {
    localStorage.setItem('axe_memory', JSON.stringify(m.slice(-100)));
  };

  const addMemory = async () => {
    if (!newContent.trim()) return;
    const tags = extractTags(newContent);
    const payload = mapToCore({ category: newCategory, content: newContent.trim(), tags });

    const entry = await saveMemory(payload.content, payload.tags, 5, payload.source);
    if (entry) {
      const newEntry = mapToEntry(entry);
      setMemories(prev => {
        const next = [...prev, newEntry];
        syncLocalStorage(next);
        return next;
      });
    } else {
      // Fallback: save to localStorage only
      const newEntry: MemoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
        category: newCategory,
        content: newContent.trim(),
        tags,
      };
      setMemories(prev => {
        const next = [...prev, newEntry];
        syncLocalStorage(next);
        return next;
      });
    }
    setNewContent('');
    setShowAdd(false);
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
    setMemories(prev => {
      const next = prev.filter(m => m.id !== id);
      syncLocalStorage(next);
      return next;
    });
  };

  const extractTags = (text: string): string[] => {
    const common = ['code', 'api', 'bug', 'feature', 'config', 'search', 'doc', 'analysis'];
    return common.filter(t => text.toLowerCase().includes(t));
  };

  const filtered = memories.filter(m => {
    if (filter !== 'all' && m.category !== filter) return false;
    if (search && !m.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    global: memories.filter(m => m.category === 'global').length,
    specialist: memories.filter(m => m.category === 'specialist').length,
    shared: memories.filter(m => m.category === 'shared').length,
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Stats */}
      <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: '#22D3EE' }}>{stats.global} global</span>
        <span style={{ color: '#F59E0B' }}>{stats.specialist} specialist</span>
        <span style={{ color: '#8B5CF6' }}>{stats.shared} shared</span>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 flex-1 rounded px-1.5 py-0.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)' }}>
          <Search size={8} style={{ color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search memory..." className="flex-1 min-w-0 text-[9px] bg-transparent outline-none" style={{ color: 'var(--text-primary)' }} />
        </div>
        <button onClick={() => setShowAdd(v => !v)} className="p-0.5 rounded" style={{ color: 'var(--accent-cyan)' }}><Plus size={10} /></button>
      </div>

      {/* Category filter */}
      <div className="flex gap-0.5">
        {(['all', 'global', 'specialist', 'shared'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className="text-[7px] px-1 py-0.5 rounded capitalize" style={{ background: filter === f ? 'rgba(34,211,238,0.1)' : 'transparent', color: filter === f ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{f}</button>
        ))}
      </div>

      {/* Add memory */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-1 p-1.5 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)' }}>
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addMemory(); } }} placeholder="Add to memory..." className="text-[9px] bg-transparent outline-none resize-none" style={{ color: 'var(--text-primary)', minHeight: 30 }} />
              <div className="flex items-center gap-1">
                {(['global', 'specialist', 'shared'] as const).map(c => (
                  <button key={c} onClick={() => setNewCategory(c)} className="text-[7px] px-1 py-0.5 rounded capitalize" style={{ background: newCategory === c ? 'rgba(34,211,238,0.1)' : 'transparent', color: newCategory === c ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{c}</button>
                ))}
                <div className="flex-1" />
                <button onClick={addMemory} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Save</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory entries */}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {loading && <div className="text-[9px] text-center py-2" style={{ color: 'var(--text-muted)' }}>Loading...</div>}
        {!loading && filtered.length === 0 && <div className="text-[9px] text-center py-2" style={{ color: 'var(--text-muted)' }}>No memories yet</div>}
        {!loading && filtered.slice().reverse().map(m => {
          const catColors = { global: '#22D3EE', specialist: '#F59E0B', shared: '#8B5CF6' };
          return (
            <div key={m.id} className="flex items-start gap-1 p-1 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="rounded-full flex-shrink-0 mt-0.5" style={{ width: 5, height: 5, background: catColors[m.category] }} />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] leading-snug truncate" style={{ color: 'var(--text-primary)' }}>{m.content}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[7px]" style={{ color: 'var(--text-muted)' }}>{m.timestamp}</span>
                  {m.tags.map(t => <span key={t} className="text-[7px] px-1 rounded" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)' }}>{t}</span>)}
                </div>
              </div>
              <button onClick={() => handleDelete(m.id)} className="flex-shrink-0 p-0.5"><Trash2 size={8} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
