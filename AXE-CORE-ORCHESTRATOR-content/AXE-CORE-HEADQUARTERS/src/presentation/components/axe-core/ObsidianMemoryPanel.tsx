/**
 * ObsidianMemoryPanel — structured durable notes + optional Mac vault sync.
 * Optional props sync selection with the neural graph on the Obsidian page.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Brain,
  FolderOpen,
  HardDrive,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  listRecentObsidianNotes,
  searchObsidianNotes,
  writeObsidianNote,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { runMemoryDecayPass } from '@/infrastructure/persistence/memoryDecayService';
import {
  getVaultPath,
  setVaultPath,
  syncVaultBidirectional,
  vaultSyncAvailable,
} from '@/infrastructure/persistence/obsidianVaultSyncService';

const FOLDER_COLORS: Record<string, string> = {
  Reflections: '#A78BFA',
  Decisions: '#22D3EE',
  Preferences: '#34D399',
  Projects: '#F59E0B',
  System: '#94A3B8',
  AXE: '#22D3EE',
};

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'AXE';
}

function Preview({ content }: { content: string }) {
  const text = content.replace(/\[\[[^\]]+\]\]/g, '').replace(/^#+\s*/gm, '').trim();
  return <>{text.slice(0, 160)}{text.length > 160 ? '…' : ''}</>;
}

export default function ObsidianMemoryPanel({
  externalSelectedPath,
  onNotesChanged,
  onSelectPath,
}: {
  externalSelectedPath?: string | null;
  onNotesChanged?: (notes: ObsidianNote[]) => void;
  onSelectPath?: (path: string | null) => void;
} = {}) {
  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | 'all'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [decayBusy, setDecayBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [vaultPath, setVaultPathState] = useState(() => getVaultPath() || '');
  const [showVault, setShowVault] = useState(false);
  const canVault = vaultSyncAvailable();

  const select = useCallback((path: string | null) => {
    setSelectedPath(path);
    onSelectPath?.(path);
  }, [onSelectPath]);

  useEffect(() => {
    if (externalSelectedPath && externalSelectedPath !== selectedPath) {
      setSelectedPath(externalSelectedPath);
    }
  }, [externalSelectedPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = query.trim().length >= 2
        ? await searchObsidianNotes(query.trim(), 80)
        : await listRecentObsidianNotes(80);
      setNotes(data);
      onNotesChanged?.(data);
      if (!selectedPath && data[0]) select(data[0].path);
    } finally {
      setLoading(false);
    }
  }, [query, selectedPath, onNotesChanged, select]);

  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => { void reload(); }, 280);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const folders = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      const f = folderOf(n.path);
      map.set(f, (map.get(f) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const filtered = useMemo(() => {
    if (folderFilter === 'all') return notes;
    return notes.filter(n => folderOf(n.path) === folderFilter);
  }, [notes, folderFilter]);

  const selected = notes.find(n => n.path === selectedPath) ?? filtered[0] ?? null;

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const { path } = await writeObsidianNote({
        title: title.trim(),
        content: content.trim(),
        tags,
        source: 'user',
      });
      setTitle('');
      setContent('');
      setTagsInput('');
      setShowAdd(false);
      select(path);
      setStatus(`Saved → ${path}`);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDecay = async () => {
    setDecayBusy(true);
    setStatus(null);
    try {
      const report = await runMemoryDecayPass();
      setStatus(`Decay: scanned ${report.scanned}, decayed ${report.decayed}, reinforced ${report.reinforced}, pruned ${report.pruned}`);
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Decay failed');
    } finally {
      setDecayBusy(false);
    }
  };

  const handleSaveVaultPath = () => {
    setVaultPath(vaultPath.trim() || null);
    setStatus(vaultPath.trim() ? `Vault folder set` : 'Vault folder cleared');
  };

  const handleSyncVault = async () => {
    setSyncBusy(true);
    setStatus(null);
    try {
      setVaultPath(vaultPath.trim() || null);
      const { push, pull } = await syncVaultBidirectional(200);
      setStatus(
        push.errors[0] && push.written === 0 && pull.pulled === 0
          ? push.errors[0]
          : `↑ ${push.written}/${push.total} → vault · ↓ ${pull.pulled}/${pull.total} van vault${push.failed || pull.errors.length ? ` (${push.failed + pull.errors.length} fouten)` : ''}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[300px] flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <BookOpen size={15} color="var(--accent-cyan)" />
            <span className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>Notes</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>
              {notes.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowVault(v => !v)} className="p-1.5 rounded-lg" style={{ background: showVault ? 'rgba(34,211,238,0.15)' : 'var(--bg-hover)', color: showVault ? 'var(--accent-cyan)' : 'var(--text-muted)' }} title="Vault folder sync">
              <HardDrive size={12} />
            </button>
            <button onClick={() => void reload()} className="p-1.5 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }} title="Refresh">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
              style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.2)' }}
            >
              <Plus size={11} /> Note
            </button>
          </div>
        </div>

        {showVault && (
          <div className="px-3 py-2 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(34,211,238,0.04)' }}>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {canVault
                ? 'Paste the absolute path to your Obsidian vault folder. Sync writes AXE notes as .md files there.'
                : 'Vault sync needs the Tauri desktop app (not the browser).'}
            </p>
            <input
              value={vaultPath}
              onChange={e => setVaultPathState(e.target.value)}
              placeholder="/Users/you/Documents/Obsidian/MyVault"
              disabled={!canVault}
              className="w-full rounded-lg text-[10px] px-2 py-1.5 outline-none font-mono"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={handleSaveVaultPath}
                disabled={!canVault}
                className="text-[10px] px-2 py-1 rounded-lg"
                style={{ background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)' }}
              >
                Save path
              </button>
              <button
                onClick={() => void handleSyncVault()}
                disabled={!canVault || syncBusy || !vaultPath.trim()}
                className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#6EE7B7' }}
              >
                <HardDrive size={10} /> {syncBusy ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          </div>
        )}

        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <Search size={12} color="var(--text-muted)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search notes, tags, decisions…"
              className="flex-1 min-w-0 text-[11px] bg-transparent outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div className="px-3 py-2 flex flex-wrap gap-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setFolderFilter('all')}
            className="text-[9px] px-2 py-0.5 rounded font-mono"
            style={{
              background: folderFilter === 'all' ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
              color: folderFilter === 'all' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}
          >
            all
          </button>
          {folders.map(([name, count]) => (
            <button
              key={name}
              onClick={() => setFolderFilter(name)}
              className="text-[9px] px-2 py-0.5 rounded font-mono"
              style={{
                background: folderFilter === name ? `${FOLDER_COLORS[name] || '#22D3EE'}22` : 'rgba(255,255,255,0.04)',
                color: folderFilter === name ? (FOLDER_COLORS[name] || '#22D3EE') : 'var(--text-muted)',
              }}
            >
              {name} ({count})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && notes.length === 0 && (
            <div className="flex justify-center py-10"><RefreshCw size={14} className="animate-spin" color="var(--text-muted)" /></div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 px-4 text-center">
              <Brain size={22} color="rgba(34,211,238,0.35)" />
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Nog geen notes. AXE schrijft reflecties hier naartoe — of voeg er zelf één toe.
              </p>
            </div>
          )}
          {filtered.map(n => {
            const active = (selected?.path || selectedPath) === n.path;
            const folder = folderOf(n.path);
            return (
              <button
                key={n.path}
                onClick={() => select(n.path)}
                className="w-full text-left rounded-lg px-3 py-2 transition-colors"
                style={{
                  background: active ? 'rgba(34,211,238,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(34,211,238,0.2)' : '1px solid transparent',
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <FolderOpen size={10} color={FOLDER_COLORS[folder] || '#8B9DBF'} />
                  <span className="text-[9px] font-mono" style={{ color: FOLDER_COLORS[folder] || 'var(--text-muted)' }}>{folder}</span>
                  <span className="text-[8px] ml-auto font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {n.updated_at ? new Date(n.updated_at).toLocaleDateString('nl-NL') : ''}
                  </span>
                </div>
                <div className="text-[12px] font-medium truncate" style={{ color: active ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                  {n.title}
                </div>
                <div className="text-[10px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                  <Preview content={n.content} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => void handleDecay()}
            disabled={decayBusy}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(167,139,250,0.12)', color: '#C4B5FD' }}
          >
            <Sparkles size={11} /> {decayBusy ? 'Decay…' : 'Decay pass'}
          </button>
          {status && <span className="text-[9px] truncate flex-1" style={{ color: 'var(--text-muted)' }}>{status}</span>}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
            >
              <div className="p-4 space-y-3">
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Title — e.g. Decision: promote exec auto-approve"
                  className="w-full rounded-lg text-[12px] px-3 py-2 outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Markdown body. Use [[wikilinks]] to connect notes."
                  rows={5}
                  className="w-full rounded-lg text-[12px] p-3 resize-none outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <div className="flex items-center gap-2">
                  <Tag size={11} color="var(--text-muted)" />
                  <input
                    value={tagsInput}
                    onChange={e => setTagsInput(e.target.value)}
                    placeholder="tags, comma-separated"
                    className="flex-1 rounded-lg text-[11px] px-3 py-1.5 outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => setShowAdd(false)} className="text-[11px] px-3 py-1.5" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving || !title.trim() || !content.trim()}
                    className="text-[11px] font-medium px-4 py-1.5 rounded-lg"
                    style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--accent-cyan)' }}
                  >
                    {saving ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {selected ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)' }}>
                  {selected.source}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{selected.path}</span>
              </div>
              <h2 className="text-[18px] font-semibold" style={{ color: 'var(--text-primary)' }}>{selected.title}</h2>
            </div>
            {(selected.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(selected.tags || []).map(t => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(59,130,246,0.12)', color: '#93C5FD' }}>#{t}</span>
                ))}
              </div>
            )}
            {(selected.wikilinks || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link2 size={12} color="var(--text-muted)" />
                {(selected.wikilinks || []).map(w => (
                  <span key={w} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.12)', color: '#C4B5FD' }}>[[{w}]]</span>
                ))}
              </div>
            )}
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-sans" style={{ color: 'var(--text-secondary)' }}>
              {selected.content}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <BookOpen size={28} color="rgba(34,211,238,0.35)" />
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>Co-founder memory</p>
            <p className="text-[11px] max-w-sm" style={{ color: 'var(--text-muted)' }}>
              Click a node in the neural map above, or a note in the list.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

void Trash2;
