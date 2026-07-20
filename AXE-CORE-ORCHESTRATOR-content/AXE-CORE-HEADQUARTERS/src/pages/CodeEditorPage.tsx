/**
 * CodeEditorPage.tsx — AXE Code Studio
 * ─────────────────────────────────────────────────────────────────────────
 * VS Code / Cursor-style IDE:
 *   - Multi-file tab bar with unsaved (•) indicators
 *   - Monaco editor  ·  Cmd+S  ·  VS Dark theme
 *   - Sidebar: file tree  ↔  find-in-files (ripgrep)
 *   - AI Code Agent: chat → JSON patches → inline Accept / Reject diff
 *   - xterm.js terminal panel (always mounted, CSS show/hide)
 *   - ▶ Run button (node / python3 / bash auto-detection)
 *   - ⌘P quick-open file picker
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Save, FilePlus, FolderPlus, Trash2,
  Terminal, ChevronRight, FileCode, Folder,
  Copy, Check, Bot, Send, FolderOpen, RefreshCw,
  Play, Search, X, Files, Zap,
} from 'lucide-react';
import { useVoiceStore, type KeySlot } from '@/store/voiceStore';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { XtermTerminal, type XtermHandle } from '@/components/axe-core/XtermTerminal';
import {
  listWorkspaceDirectory, readWorkspaceFile, writeWorkspaceFile,
  createWorkspaceEntry, deleteWorkspaceEntry, searchWorkspace,
  type SearchResult,
} from '@/services/platform/workspaceFilesService';
import { runLocalAgent, applyPatch, type FilePatch } from '@/services/ai/localCodeAgent';
import Editor from '@monaco-editor/react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  expanded?: boolean;
  loaded?: boolean;
  loading?: boolean;
  children?: FileNode[];
}

interface OpenTab {
  path: string;
  name: string;
  language: string;
  content: string;
  savedContent: string; // tracks what's on disk
}

interface PatchWithState extends FilePatch {
  id: string;
  state: 'pending' | 'accepted' | 'rejected';
}

interface AgentMessage {
  role: 'user' | 'agent' | 'status';
  text: string;
  patches?: PatchWithState[];
  filesRead?: string[];
}

/* ─── Pure helpers ───────────────────────────────────────────────────────── */
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    json: 'json', md: 'markdown', html: 'html', css: 'css',
    scss: 'scss', sql: 'sql', sh: 'shell', yaml: 'yaml', yml: 'yaml',
    toml: 'ini', dockerfile: 'dockerfile',
  };
  return map[ext] ?? 'plaintext';
}

function getRunCommand(path: string, content: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'ts' || ext === 'tsx') return `npx tsx "${path}"\n`;
  if (ext === 'js' || ext === 'jsx') return `node "${path}"\n`;
  if (ext === 'py')                  return `python3 "${path}"\n`;
  if (ext === 'sh' || content.startsWith('#!/')) return `bash "${path}"\n`;
  return null;
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap(n => n.type === 'file' ? [n] : flattenFiles(n.children ?? []));
}

function findNode(nodes: FileNode[], target: string | null): FileNode | null {
  if (!target) return null;
  for (const n of nodes) {
    if (n.path === target) return n;
    if (n.children) { const f = findNode(n.children, target); if (f) return f; }
  }
  return null;
}

function mapNode(nodes: FileNode[], target: string, fn: (n: FileNode) => FileNode): FileNode[] {
  return nodes.map(n => {
    if (n.path === target) return fn(n);
    if (n.children) return { ...n, children: mapNode(n.children, target, fn) };
    return n;
  });
}

function removeNode(nodes: FileNode[], target: string): FileNode[] {
  return nodes.filter(n => n.path !== target).map(n =>
    n.children ? { ...n, children: removeNode(n.children, target) } : n
  );
}

function uid(): string { return Math.random().toString(36).slice(2, 8); }

/* ─── File Tree Item ─────────────────────────────────────────────────────── */
function FileTreeItem({
  node, depth, selectedPath, onSelect, onToggleFolder, onDelete,
}: {
  node: FileNode; depth: number; selectedPath: string | null;
  onSelect: (p: string) => void;
  onToggleFolder: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const active = selectedPath === node.path;
  return (
    <div>
      <div
        className="flex items-center gap-1 py-[3px] pr-1 cursor-pointer group select-none"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: active ? 'rgba(34,211,238,0.08)' : 'transparent',
          borderLeft: active ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        }}
        onClick={() => node.type === 'folder' ? onToggleFolder(node.path) : onSelect(node.path)}
      >
        {node.type === 'folder' && (
          <ChevronRight size={9} style={{ color: 'rgba(255,255,255,0.3)', transform: node.expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        )}
        {node.type === 'folder'
          ? (node.loading
              ? <RefreshCw size={10} className="animate-spin" style={{ color: 'rgba(255,255,255,0.4)' }} />
              : <Folder size={10} style={{ color: node.expanded ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }} />)
          : <FileCode size={10} style={{ color: active ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }} />
        }
        <span className="text-[10px] flex-1 truncate" style={{ color: active ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.65)' }}>
          {node.name}
        </span>
        <button onClick={e => { e.stopPropagation(); onDelete(node.path); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400">
          <Trash2 size={8} style={{ color: 'rgba(255,255,255,0.2)' }} />
        </button>
      </div>
      {node.type === 'folder' && node.expanded && node.children?.map(child => (
        <FileTreeItem key={child.path} node={child} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect}
          onToggleFolder={onToggleFolder} onDelete={onDelete} />
      ))}
    </div>
  );
}

/* ─── Diff patch block ───────────────────────────────────────────────────── */
function PatchBlock({
  patch, onAccept, onReject,
}: { patch: PatchWithState; onAccept: (id: string) => void; onReject: (id: string) => void }) {
  const done = patch.state !== 'pending';
  const borderColor = patch.state === 'accepted' ? 'rgba(16,185,129,0.3)' : patch.state === 'rejected' ? 'rgba(255,255,255,0.06)' : 'rgba(34,211,238,0.15)';
  return (
    <div className="rounded text-[9px] font-mono overflow-hidden"
      style={{ border: `1px solid ${borderColor}`, opacity: done ? 0.6 : 1 }}>
      <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <FileCode size={8} style={{ color: 'var(--accent-cyan)' }} />
        <span className="truncate flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{patch.file}</span>
        {patch.state === 'accepted' && <span style={{ color: '#10b981' }}>✓</span>}
        {patch.state === 'rejected' && <span style={{ color: '#6b7280' }}>✗</span>}
      </div>
      {patch.description && (
        <div className="px-2 py-0.5" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>{patch.description}</div>
      )}
      <div className="px-2 py-1.5 space-y-px overflow-x-auto" style={{ maxHeight: 120, fontFamily: 'monospace' }}>
        {patch.search.split('\n').map((line, i) => (
          <div key={`d${i}`} className="whitespace-pre" style={{ color: '#f87171', background: 'rgba(239,68,68,0.06)', fontSize: 9 }}>- {line}</div>
        ))}
        {patch.replace.split('\n').map((line, i) => (
          <div key={`a${i}`} className="whitespace-pre" style={{ color: '#34d399', background: 'rgba(16,185,129,0.06)', fontSize: 9 }}>+ {line}</div>
        ))}
      </div>
      {!done && (
        <div className="flex gap-1.5 px-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={() => onAccept(patch.id)}
            className="px-2 py-0.5 rounded text-[9px] font-medium"
            style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
            ✓ Accept
          </button>
          <button onClick={() => onReject(patch.id)}
            className="px-2 py-0.5 rounded text-[9px]"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════════ */
export default function CodeEditorPage() {
  const voice = useVoiceStore();

  /* ── File tree (structure only — no content stored here) ─────────────── */
  const [fileTree, setFileTree]   = useState<FileNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError]   = useState<string | null>(null);

  /* ── Multi-file tabs ──────────────────────────────────────────────────── */
  const [openTabs, setOpenTabs]       = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const activeTab = openTabs.find(t => t.path === activeTabPath) ?? null;

  /* ── Sidebar mode ─────────────────────────────────────────────────────── */
  const [sidebarMode, setSidebarMode] = useState<'files' | 'search'>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]     = useState(false);

  /* ── Terminal ─────────────────────────────────────────────────────────── */
  const [showTerminal, setShowTerminal] = useState(true);
  const termRef = useRef<XtermHandle>(null);

  /* ── AI Agent ─────────────────────────────────────────────────────────── */
  const [showAgent, setShowAgent]       = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput]     = useState('');
  const [agentBusy, setAgentBusy]       = useState(false);
  const agentChatRef = useRef<HTMLDivElement>(null);

  /* ── Quick-open (⌘P) ──────────────────────────────────────────────────── */
  const [quickOpen, setQuickOpen]   = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);

  /* ── Misc UI ──────────────────────────────────────────────────────────── */
  const [saving, setSaving]         = useState(false);
  const [copied, setCopied]         = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const isMobile = useIsMobile();

  /* ── Load root on mount ───────────────────────────────────────────────── */
  useEffect(() => {
    void (async () => {
      try {
        const nodes = await listWorkspaceDirectory('');
        setFileTree(nodes.map(n => ({ ...n, expanded: false, loaded: n.type === 'file' })));
      } catch (err) {
        setRootError(err instanceof Error ? err.message : 'Failed to load project files');
      } finally { setRootLoading(false); }
    })();
  }, []);

  /* ── Auto-scroll agent chat ───────────────────────────────────────────── */
  useEffect(() => {
    agentChatRef.current?.scrollTo(0, agentChatRef.current.scrollHeight);
  }, [agentMessages]);

  /* ── Keyboard shortcuts ─────────────────────────────────────────────────  */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); void saveActiveFile(); }
      if (mod && e.key === 'p') {
        e.preventDefault();
        setQuickOpen(true);
        setTimeout(() => quickInputRef.current?.focus(), 40);
      }
      if (e.key === 'Escape') { setQuickOpen(false); setQuickQuery(''); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /* ── File tree operations ─────────────────────────────────────────────── */
  const toggleFolder = useCallback(async (path: string) => {
    const node = findNode(fileTree, path);
    if (!node) return;
    if (!node.expanded && !node.loaded) {
      setFileTree(prev => mapNode(prev, path, n => ({ ...n, loading: true })));
      try {
        const children = await listWorkspaceDirectory(path);
        setFileTree(prev => mapNode(prev, path, n => ({
          ...n, loading: false, loaded: true, expanded: true,
          children: children.map(c => ({ ...c, expanded: false, loaded: c.type === 'file' })),
        })));
      } catch { setFileTree(prev => mapNode(prev, path, n => ({ ...n, loading: false }))); }
      return;
    }
    setFileTree(prev => mapNode(prev, path, n => ({ ...n, expanded: !n.expanded })));
  }, [fileTree]);

  const openFile = useCallback(async (path: string) => {
    // Already open → just activate
    if (openTabs.some(t => t.path === path)) {
      setActiveTabPath(path);
      setMobileFilesOpen(false);
      return;
    }
    const name = path.split('/').pop() ?? path;
    try {
      const content = await readWorkspaceFile(path);
      setOpenTabs(prev => [...prev, { path, name, language: detectLanguage(name), content, savedContent: content }]);
    } catch (err) {
      const msg = `// Failed to load: ${err instanceof Error ? err.message : 'unknown error'}`;
      setOpenTabs(prev => [...prev, { path, name, language: 'plaintext', content: msg, savedContent: msg }]);
    }
    setActiveTabPath(path);
    setMobileFilesOpen(false);
  }, [openTabs]);

  const closeTab = useCallback((path: string) => {
    const tab = openTabs.find(t => t.path === path);
    if (tab && tab.content !== tab.savedContent) {
      if (!confirm(`Close "${tab.name}" with unsaved changes?`)) return;
    }
    const remaining = openTabs.filter(t => t.path !== path);
    setOpenTabs(remaining);
    if (activeTabPath === path) {
      setActiveTabPath(remaining.at(-1)?.path ?? null);
    }
  }, [openTabs, activeTabPath]);

  const updateContent = useCallback((path: string, content: string) => {
    setOpenTabs(prev => prev.map(t => t.path === path ? { ...t, content } : t));
  }, []);

  const saveActiveFile = useCallback(async () => {
    if (!activeTab || activeTab.content === activeTab.savedContent) return;
    setSaving(true);
    try {
      await writeWorkspaceFile(activeTab.path, activeTab.content);
      setOpenTabs(prev => prev.map(t => t.path === activeTab.path ? { ...t, savedContent: t.content } : t));
    } catch (err) { alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setSaving(false); }
  }, [activeTab]);

  const deleteNode = useCallback(async (path: string) => {
    if (!confirm(`Delete "${path}"? Cannot be undone.`)) return;
    try {
      await deleteWorkspaceEntry(path);
      setFileTree(prev => removeNode(prev, path));
      closeTab(path);
    } catch (err) { alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`); }
  }, [closeTab]);

  const addFile = useCallback(async () => {
    const name = prompt('File path (relative to project root):');
    if (!name) return;
    try {
      await createWorkspaceEntry(name, 'file');
      setFileTree(prev => [...prev, { path: name, name: name.split('/').pop() ?? name, type: 'file', loaded: true }]);
      await openFile(name);
    } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  }, [openFile]);

  const addFolder = useCallback(async () => {
    const name = prompt('Folder path (relative to project root):');
    if (!name) return;
    try {
      await createWorkspaceEntry(name, 'folder');
      setFileTree(prev => [...prev, { path: name, name: name.split('/').pop() ?? name, type: 'folder', expanded: false, loaded: false }]);
    } catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  }, []);

  /* ── Find-in-files ────────────────────────────────────────────────────── */
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try { setSearchResults(await searchWorkspace(q, { maxResults: 80 })); }
    catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, []);

  /* ── Run active file in terminal ──────────────────────────────────────── */
  const runFile = useCallback(() => {
    if (!activeTab) return;
    const cmd = getRunCommand(activeTab.path, activeTab.content);
    if (!cmd) { alert('Cannot determine run command for this file type.'); return; }
    setShowTerminal(true);
    setTimeout(() => termRef.current?.send(cmd), 120);
  }, [activeTab]);

  /* ── AI Agent ─────────────────────────────────────────────────────────── */
  const getSlots = (): KeySlot[] =>
    [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot, voice.fallback3Slot]
      .filter((s): s is KeySlot => s !== null);

  const handleAgentSubmit = useCallback(async () => {
    const instruction = agentInput.trim();
    if (!instruction || agentBusy) return;
    setAgentInput('');
    setAgentBusy(true);

    // Append user message + status placeholder
    setAgentMessages(prev => [
      ...prev,
      { role: 'user', text: instruction },
      { role: 'status', text: '🔍 Gathering context…' },
    ]);

    const result = await runLocalAgent(
      instruction,
      activeTab ? { path: activeTab.path, content: activeTab.content } : null,
      getSlots(),
      (msg) => setAgentMessages(prev => [...prev.slice(0, -1), { role: 'status', text: msg }]),
    );

    const patches: PatchWithState[] = result.patches.map(p => ({ ...p, id: uid(), state: 'pending' }));
    setAgentMessages(prev => [
      ...prev.slice(0, -1),  // remove status
      { role: 'agent', text: result.message, patches, filesRead: result.filesRead },
    ]);
    setAgentBusy(false);
  }, [agentInput, agentBusy, activeTab, voice]);

  const acceptPatch = useCallback(async (msgIdx: number, patchId: string) => {
    const patch = agentMessages[msgIdx]?.patches?.find(p => p.id === patchId);
    if (!patch) return;

    const inMemoryTab = openTabs.find(t => t.path === patch.file);
    if (inMemoryTab) {
      const next = applyPatch(inMemoryTab.content, patch);
      if (next === null) { alert(`Patch search string not found in ${patch.file}.\nThe file may have changed.`); return; }
      setOpenTabs(prev => prev.map(t => t.path === patch.file ? { ...t, content: next } : t));
    } else {
      try {
        const content = await readWorkspaceFile(patch.file);
        const next = applyPatch(content, patch);
        if (next === null) { alert(`Patch search string not found in ${patch.file}.`); return; }
        await writeWorkspaceFile(patch.file, next);
      } catch (err) { alert(`Patch failed: ${err instanceof Error ? err.message : String(err)}`); return; }
    }

    setAgentMessages(prev => prev.map((m, i) =>
      i !== msgIdx ? m : { ...m, patches: m.patches?.map(p => p.id === patchId ? { ...p, state: 'accepted' as const } : p) }
    ));
  }, [agentMessages, openTabs]);

  const rejectPatch = useCallback((msgIdx: number, patchId: string) => {
    setAgentMessages(prev => prev.map((m, i) =>
      i !== msgIdx ? m : { ...m, patches: m.patches?.map(p => p.id === patchId ? { ...p, state: 'rejected' as const } : p) }
    ));
  }, [agentMessages]);

  /* ── Quick-open data ──────────────────────────────────────────────────── */
  const allFiles     = flattenFiles(fileTree);
  const quickFiles   = quickQuery
    ? allFiles.filter(n => n.path.toLowerCase().includes(quickQuery.toLowerCase()))
    : allFiles.slice(0, 24);

  /* ── Copy active file ─────────────────────────────────────────────────── */
  const copyCode = () => {
    if (!activeTab?.content) return;
    void navigator.clipboard.writeText(activeTab.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════ */
  return (
    <motion.div className="h-full flex flex-col relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* ── ⌘P Quick-open overlay ─────────────────────────────────── */}
      <AnimatePresence>
        {quickOpen && (
          <motion.div
            className="absolute inset-0 z-50 flex items-start justify-center pt-14"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setQuickOpen(false); setQuickQuery(''); }}
          >
            <motion.div
              className="w-[500px] rounded-lg overflow-hidden"
              style={{ background: '#111', border: '1px solid rgba(34,211,238,0.2)', boxShadow: '0 24px 64px rgba(0,0,0,0.85)' }}
              initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <Search size={12} style={{ color: 'var(--accent-cyan)' }} />
                <input ref={quickInputRef} value={quickQuery} onChange={e => setQuickQuery(e.target.value)}
                  placeholder="Search files…" className="flex-1 bg-transparent outline-none text-[12px]"
                  style={{ color: 'rgba(255,255,255,0.9)' }} />
                <kbd className="text-[9px] px-1 rounded" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)' }}>ESC</kbd>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
                {quickFiles.length === 0 && (
                  <div className="py-4 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {quickQuery ? 'No matches — try expanding more folders first' : 'Expand folders to populate the file list'}
                  </div>
                )}
                {quickFiles.map(f => (
                  <div key={f.path}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white hover:bg-opacity-5"
                    onClick={() => { void openFile(f.path); setQuickOpen(false); setQuickQuery(''); }}
                  >
                    <FileCode size={10} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{f.name}</span>
                    <span className="text-[9px] truncate flex-1 text-right" style={{ color: 'rgba(255,255,255,0.25)' }}>{f.path}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>

        <Code2 size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CODE STUDIO</span>

        {/* Mobile file-tree sheet */}
        {isMobile && (
          <Sheet open={mobileFilesOpen} onOpenChange={setMobileFilesOpen}>
            <SheetTrigger asChild>
              <button className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                style={{ background: 'rgba(34,211,238,0.1)', color: '#22D3EE', border: '1px solid rgba(34,211,238,0.2)' }}>
                <FolderOpen size={10} /> Files
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0 overflow-hidden"
              style={{ background: '#050505', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="py-1 overflow-y-auto h-full">
                {fileTree.map(node => (
                  <FileTreeItem key={node.path} node={node} depth={0}
                    selectedPath={activeTabPath}
                    onSelect={p => { void openFile(p); }}
                    onToggleFolder={p => { void toggleFolder(p); }}
                    onDelete={p => { void deleteNode(p); }}
                  />
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}

        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button onClick={() => void addFile()} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125" style={{ color: 'rgba(255,255,255,0.5)' }} title="New file"><FilePlus size={10} /> New File</button>
        <button onClick={() => void addFolder()} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125" style={{ color: 'rgba(255,255,255,0.5)' }} title="New folder"><FolderPlus size={10} /> Folder</button>
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />

        <button onClick={() => void saveActiveFile()}
          disabled={!activeTab || activeTab.content === activeTab.savedContent || saving}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] disabled:opacity-30 hover:brightness-125"
          style={{ color: (activeTab && activeTab.content !== activeTab.savedContent) ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}
          title="Save (Ctrl+S)">
          {saving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />} Save
        </button>

        <button onClick={copyCode} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {copied ? <><Check size={10} style={{ color: 'var(--success)' }} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>

        {/* Run button — shown only for runnable files */}
        {activeTab && getRunCommand(activeTab.path, activeTab.content) && (
          <button onClick={runFile}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium hover:brightness-125"
            style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
            title="Run this file in the terminal">
            <Play size={9} /> Run
          </button>
        )}

        <div className="flex-1" />

        {/* ⌘P */}
        <button onClick={() => { setQuickOpen(true); setTimeout(() => quickInputRef.current?.focus(), 40); }}
          className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }} title="Quick open (Ctrl+P)">
          <Search size={9} /> ⌘P
        </button>

        <button onClick={() => setShowAgent(v => !v)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ background: showAgent ? 'rgba(34,211,238,0.1)' : 'transparent', border: showAgent ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent', color: 'var(--accent-cyan)' }}
          title="Toggle AI Code Agent">
          <Zap size={10} /> Agent
        </button>

        <button onClick={() => setShowTerminal(v => !v)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: showTerminal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}
          title="Toggle terminal">
          <Terminal size={10} /> Terminal
        </button>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      {openTabs.length > 0 && (
        <div className="flex items-end overflow-x-auto flex-shrink-0"
          style={{ background: '#050505', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 32 }}>
          {openTabs.map(tab => {
            const isActive = tab.path === activeTabPath;
            const dirty    = tab.content !== tab.savedContent;
            return (
              <div key={tab.path}
                className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer flex-shrink-0 group"
                style={{
                  borderRight: '1px solid rgba(255,255,255,0.04)',
                  borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  background: isActive ? 'rgba(34,211,238,0.05)' : 'transparent',
                  maxWidth: 180,
                }}
                onClick={() => setActiveTabPath(tab.path)}
                title={tab.path}
              >
                <FileCode size={9} style={{ color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                <span className="text-[10px] truncate flex-1"
                  style={{ color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.55)' }}>
                  {tab.name}
                </span>
                {dirty && <span style={{ color: '#f59e0b', fontSize: 14, lineHeight: 1 }}>•</span>}
                <button
                  onClick={e => { e.stopPropagation(); closeTab(tab.path); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded flex-shrink-0 hover:text-red-400"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  <X size={9} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar (desktop) ─────────────────────────────────────── */}
        <div className="hidden md:flex flex-col w-[200px] flex-shrink-0"
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}>

          {/* Mode toggle */}
          <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {(['files', 'search'] as const).map(mode => (
              <button key={mode} onClick={() => setSidebarMode(mode)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[9px] uppercase tracking-wide"
                style={{
                  color: sidebarMode === mode ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.3)',
                  borderBottom: sidebarMode === mode ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                }}>
                {mode === 'files' ? <Files size={9} /> : <Search size={9} />}
                {mode}
              </button>
            ))}
          </div>

          {/* File tree */}
          {sidebarMode === 'files' && (
            <div className="flex-1 overflow-y-auto py-1">
              {rootLoading && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  <RefreshCw size={9} className="animate-spin" /> Loading…
                </div>
              )}
              {rootError && <div className="px-3 py-2 text-[9px]" style={{ color: '#ef4444' }}>{rootError}</div>}
              {fileTree.map(n => (
                <FileTreeItem key={n.path} node={n} depth={0}
                  selectedPath={activeTabPath}
                  onSelect={p => { void openFile(p); }}
                  onToggleFolder={p => { void toggleFolder(p); }}
                  onDelete={p => { void deleteNode(p); }}
                />
              ))}
            </div>
          )}

          {/* Find in files */}
          {sidebarMode === 'search' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-1 rounded px-2 py-1"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Search size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void runSearch(searchQuery); }}
                    placeholder="Search in files… (Enter)"
                    className="flex-1 bg-transparent outline-none text-[10px]"
                    style={{ color: 'rgba(255,255,255,0.8)' }}
                  />
                  {searching && <RefreshCw size={8} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {searchResults.length === 0 && !searching && searchQuery && (
                  <div className="py-3 text-center text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No results</div>
                )}
                {searchResults.map((hit, i) => (
                  <div key={i}
                    className="px-2 py-1 cursor-pointer hover:bg-white hover:bg-opacity-5 group"
                    onClick={() => void openFile(hit.file)}
                  >
                    <div className="text-[9px] truncate" style={{ color: 'var(--accent-cyan)' }}>{hit.file}</div>
                    <div className="flex items-center gap-1 text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <span>:{hit.line}</span>
                      <span className="truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{hit.text.trim().slice(0, 48)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Editor area ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: '#0a0a0a' }}>

          {activeTab ? (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 px-3 py-1 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <FileCode size={9} style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[10px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{activeTab.path}</span>
                {activeTab.content !== activeTab.savedContent && <span style={{ color: '#f59e0b', fontSize: 10 }}>●</span>}
                <span className="text-[8px] px-1 rounded ml-1"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                  {activeTab.language}
                </span>
              </div>

              {/* Monaco */}
              <div className="flex-1 min-h-0">
                <Editor
                  key={activeTab.path}
                  language={activeTab.language}
                  theme="vs-dark"
                  value={activeTab.content}
                  onChange={v => updateContent(activeTab.path, v ?? '')}
                  options={{
                    minimap: { enabled: !isMobile },
                    fontSize: 13,
                    lineNumbers: 'on',
                    wordWrap: 'off',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    renderWhitespace: 'boundary',
                    smoothScrolling: true,
                  }}
                  height="100%"
                  loading={<div className="flex items-center justify-center h-full text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading editor…</div>}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <FolderOpen size={32} style={{ color: 'rgba(255,255,255,0.08)' }} />
              <div className="text-center space-y-1">
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {rootLoading ? 'Loading project…' : 'Open a file from the sidebar'}
                </div>
                <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.1)' }}>⌘P for quick open</div>
              </div>
            </div>
          )}

          {/* xterm.js Terminal — always mounted; CSS height animates open/close */}
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{
              height: showTerminal ? 200 : 0,
              borderTop: showTerminal ? '1px solid rgba(255,255,255,0.08)' : 'none',
              transition: 'height 0.2s ease',
            }}
          >
            {/* Terminal header bar */}
            <div className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: '#03090b', height: 26 }}>
              <Terminal size={9} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>TERMINAL</span>
              <div className="flex-1" />
              <button onClick={() => termRef.current?.clear()} className="p-0.5 rounded hover:brightness-125" style={{ color: 'rgba(255,255,255,0.3)' }} title="Clear"><Trash2 size={8} /></button>
              <button onClick={() => setShowTerminal(false)} className="p-0.5 rounded hover:brightness-125" style={{ color: 'rgba(255,255,255,0.3)' }} title="Hide"><X size={9} /></button>
            </div>
            {/* xterm viewport */}
            <div style={{ height: 'calc(200px - 26px)', padding: '4px 4px 4px 8px' }}>
              <XtermTerminal ref={termRef} style={{ height: '100%' }} />
            </div>
          </div>
        </div>

        {/* ── AI Agent panel ────────────────────────────────────────── */}
        <AnimatePresence>
          {showAgent && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 flex flex-col overflow-hidden"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}
            >
              {/* Header */}
              <div className="px-3 py-2 flex items-center gap-1.5 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Zap size={10} style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>CODE AGENT</span>
                <button onClick={() => setAgentMessages([])} title="Clear chat"
                  className="p-0.5 rounded hover:brightness-125" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <Trash2 size={9} />
                </button>
              </div>

              {/* Active file badge */}
              {activeTab && (
                <div className="px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                    style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.12)', color: 'rgba(34,211,238,0.7)' }}>
                    <FileCode size={8} />
                    <span className="truncate flex-1">{activeTab.name}</span>
                    <span className="opacity-50">context</span>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div ref={agentChatRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                {agentMessages.length === 0 && (
                  <div className="text-[9px] text-center py-6 space-y-1" style={{ color: 'var(--text-muted)' }}>
                    <Bot size={20} style={{ margin: '0 auto 6px', opacity: 0.3 }} />
                    <div>Describe a code change</div>
                    <div className="opacity-50 text-[8px]">"add a loading spinner to the header"</div>
                  </div>
                )}
                {agentMessages.map((msg, i) => (
                  <div key={i}>
                    {msg.role === 'status' && (
                      <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        <RefreshCw size={8} className="animate-spin flex-shrink-0" />
                        <span>{msg.text}</span>
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className="flex justify-end">
                        <div className="max-w-[88%] rounded px-2 py-1.5 text-[10px] leading-snug"
                          style={{ background: 'rgba(34,211,238,0.12)', color: 'rgba(255,255,255,0.85)' }}>
                          {msg.text}
                        </div>
                      </div>
                    )}
                    {msg.role === 'agent' && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: 'rgba(34,211,238,0.15)' }}>
                            <Zap size={8} style={{ color: 'var(--accent-cyan)' }} />
                          </div>
                          <div className="text-[10px] leading-snug" style={{ color: 'rgba(165,243,252,0.85)' }}>
                            {msg.text}
                          </div>
                        </div>
                        {msg.filesRead && msg.filesRead.length > 0 && (
                          <div className="ml-5 text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                            Read: {msg.filesRead.slice(0, 3).join(', ')}
                          </div>
                        )}
                        {msg.patches && msg.patches.length > 0 && (
                          <div className="ml-0 space-y-1.5">
                            {msg.patches.map(patch => (
                              <PatchBlock key={patch.id} patch={patch}
                                onAccept={id => { void acceptPatch(i, id); }}
                                onReject={id => rejectPatch(i, id)}
                              />
                            ))}
                          </div>
                        )}
                        {msg.patches?.length === 0 && (
                          <div className="ml-5 text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            No code changes proposed.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex gap-1.5 items-end">
                  <textarea
                    value={agentInput}
                    onChange={e => setAgentInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleAgentSubmit();
                      }
                    }}
                    placeholder="Describe a code change… (↵ send · Shift+↵ newline)"
                    rows={2}
                    className="flex-1 text-[10px] px-2 py-1.5 rounded resize-none outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => void handleAgentSubmit()} disabled={agentBusy || !agentInput.trim()}
                    className="px-2 py-1.5 rounded disabled:opacity-40"
                    style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                    <Send size={10} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
