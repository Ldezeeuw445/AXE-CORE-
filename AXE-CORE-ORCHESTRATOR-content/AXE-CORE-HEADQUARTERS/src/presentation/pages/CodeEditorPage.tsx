/**
 * CodeEditorPage.tsx — AXE Code Studio (Zed-inspired)
 * - Cmd+K palette · Cmd+P quick-open · splits · live git · DnD file tree
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Save, FilePlus, FolderPlus, Trash2,
  Terminal, ChevronRight, FileCode, Folder,
  Copy, Check, Bot, Send, FolderOpen, RefreshCw,
  Play, Search, X, Files, Zap, Eye,
  GitBranch, Columns2, Rows2, Command,
} from 'lucide-react';
import { useVoiceStore, type KeySlot } from '@/presentation/store/voiceStore';
import { Sheet, SheetContent, SheetTrigger } from '@/presentation/components/ui/sheet';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { XtermTerminal, type XtermHandle } from '@/presentation/components/axe-core/XtermTerminal';
import {
  listWorkspaceDirectory, readWorkspaceFile, writeWorkspaceFile,
  createWorkspaceEntry, deleteWorkspaceEntry, searchWorkspace,
  moveWorkspaceEntry,
  type SearchResult,
} from '@/infrastructure/persistence/workspaceFilesService';
import { runLocalAgent, runAgentLoop, applyPatch, type FilePatch, type AgentTurn } from '@/application/agents/localCodeAgent';
import { apiExecuteOpenHands } from '@/infrastructure/gateways/axeCoreApiService';
import { AgentActivityTrace } from '@/presentation/components/axe-core/AgentActivityTrace';
import { PreviewPanel } from '@/presentation/components/axe-core/PreviewPanel';
import { designAgentBridge } from '@/presentation/components/axe-core/designAgentBridge';
import {
  LiveGitPanel, SplitResizeHandle,
  setDragFilePath, getDragFilePath,
} from '@/presentation/components/axe-core/CodeStudioExtras';
import { toast } from '@/presentation/components/shared/toast';
import Editor, { DiffEditor } from '@monaco-editor/react';

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
  savedContent: string;
}

interface PatchWithState extends FilePatch {
  id: string;
  state: 'pending' | 'accepted' | 'rejected';
}

interface AgentMessage {
  role: 'user' | 'agent' | 'status' | 'plan';
  text: string;
  planSteps?: string[];
  patches?: PatchWithState[];
  filesRead?: string[];
  autoApplied?: boolean;
  ranCommand?: AgentTurn['ranCommand'];
}

type SidebarMode = 'files' | 'search' | 'git';
type SplitMode = 'none' | 'horizontal' | 'vertical';

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  category: 'command' | 'file';
  run: () => void;
}

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
  if (ext === 'py') return `python3 "${path}"\n`;
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

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 + (t.startsWith(q) ? 20 : 0);
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 40 + qi : 0;
}

function FileTreeItem({
  node, depth, selectedPath, onSelect, onToggleFolder, onDelete, onMove,
}: {
  node: FileNode; depth: number; selectedPath: string | null;
  onSelect: (p: string) => void;
  onToggleFolder: (p: string) => void;
  onDelete: (p: string) => void;
  onMove?: (from: string, toFolder: string) => void;
}) {
  const active = selectedPath === node.path;
  const [dragOver, setDragOver] = useState(false);
  return (
    <div>
      <div
        className="flex items-center gap-1 py-[3px] pr-1 cursor-pointer group select-none"
        draggable
        onDragStart={e => setDragFilePath(e, node.path)}
        onDragOver={e => {
          if (node.type !== 'folder') return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          if (node.type !== 'folder') return;
          e.preventDefault();
          setDragOver(false);
          const from = getDragFilePath(e);
          if (from && from !== node.path && onMove) onMove(from, node.path);
        }}
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: dragOver
            ? 'rgba(34,211,238,0.18)'
            : active ? 'rgba(34,211,238,0.08)' : 'transparent',
          borderLeft: active || dragOver ? '2px solid var(--accent-cyan)' : '2px solid transparent',
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
          onToggleFolder={onToggleFolder} onDelete={onDelete} onMove={onMove} />
      ))}
    </div>
  );
}

function PatchBlock({
  patch, onAccept, onReject,
}: { patch: PatchWithState; onAccept: (id: string) => void; onReject: (id: string) => void }) {
  const done = patch.state !== 'pending';
  const borderColor = patch.state === 'accepted' ? 'rgba(16,185,129,0.3)' : patch.state === 'rejected' ? 'rgba(255,255,255,0.06)' : 'var(--tint-line)';
  return (
    <div className="rounded text-[9px] font-mono overflow-hidden"
      style={{ border: `1px solid ${borderColor}`, opacity: done ? 0.6 : 1 }}>
      <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <FileCode size={8} style={{ color: 'var(--accent-cyan)' }} />
        <span className="truncate flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{patch.file}</span>
        {patch.state === 'accepted' && <span style={{ color: 'var(--success)' }}>✓</span>}
        {patch.state === 'rejected' && <span style={{ color: '#6b7280' }}>✗</span>}
      </div>
      {patch.description && (
        <div className="px-2 py-0.5" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}>{patch.description}</div>
      )}
      <div className="px-2 py-1.5 space-y-px overflow-x-auto" style={{ maxHeight: 120, fontFamily: 'monospace' }}>
        {patch.search.split('\n').map((line, i) => (
          <div key={`d${i}`} className="whitespace-pre" style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.06)', fontSize: 9 }}>- {line}</div>
        ))}
        {patch.replace.split('\n').map((line, i) => (
          <div key={`a${i}`} className="whitespace-pre" style={{ color: 'var(--success)', background: 'rgba(16,185,129,0.06)', fontSize: 9 }}>+ {line}</div>
        ))}
      </div>
      {!done && (
        <div className="flex gap-1.5 px-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={() => onAccept(patch.id)}
            className="px-2 py-0.5 rounded text-[9px] font-medium"
            style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' }}>
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

function EditorPane({
  tab, activePendingPatch, isMobile, onChange, onAcceptPatch, onRejectPatch, focused, onFocus,
}: {
  tab: OpenTab | null;
  activePendingPatch: { msgIdx: number; patch: PatchWithState } | null;
  isMobile: boolean;
  onChange: (path: string, content: string) => void;
  onAcceptPatch: (msgIdx: number, id: string) => void;
  onRejectPatch: (msgIdx: number, id: string) => void;
  focused?: boolean;
  onFocus?: () => void;
}) {
  if (!tab) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3" onClick={onFocus}>
        <FolderOpen size={28} style={{ color: 'rgba(255,255,255,0.08)' }} />
        <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Open a file · ⌘P / ⌘K</div>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0" onClick={onFocus}
      style={{ outline: focused ? '1px solid var(--tint-line)' : 'none' }}>
      <div className="flex items-center gap-1 px-3 py-1 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <FileCode size={9} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[10px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{tab.path}</span>
        {tab.content !== tab.savedContent && <span style={{ color: 'var(--warning)', fontSize: 10 }}>●</span>}
        <span className="text-[8px] px-1 rounded ml-1"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>{tab.language}</span>
      </div>
      {activePendingPatch && activePendingPatch.patch.file === tab.path ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
            style={{ background: 'var(--tint-line)', borderBottom: '1px solid var(--tint-line)' }}>
            <Zap size={10} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] flex-1 truncate" style={{ color: 'rgba(165,243,252,0.85)' }}>
              {activePendingPatch.patch.description || 'Proposed change'}
            </span>
            <button onClick={() => onAcceptPatch(activePendingPatch.msgIdx, activePendingPatch.patch.id)}
              className="px-2 py-0.5 rounded text-[9px] font-medium"
              style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' }}>✓ Accept</button>
            <button onClick={() => onRejectPatch(activePendingPatch.msgIdx, activePendingPatch.patch.id)}
              className="px-2 py-0.5 rounded text-[9px]"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>✗ Reject</button>
          </div>
          <div className="flex-1 min-h-0">
            {(() => {
              const modified = applyPatch(tab.content, activePendingPatch.patch);
              if (modified === null) {
                return <div className="h-full flex items-center justify-center text-[10px] text-center px-6" style={{ color: 'var(--text-muted)' }}>Patch no longer matches — reject and ask again.</div>;
              }
              return (
                <DiffEditor language={tab.language} theme="vs-dark" original={tab.content} modified={modified}
                  options={{ readOnly: true, fontSize: 13, renderSideBySide: !isMobile, minimap: { enabled: false }, automaticLayout: true }} />
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Editor key={tab.path} language={tab.language} theme="vs-dark" value={tab.content}
            onChange={v => onChange(tab.path, v ?? '')}
            options={{
              minimap: { enabled: !isMobile }, fontSize: 13, lineNumbers: 'on', wordWrap: 'off',
              automaticLayout: true, scrollBeyondLastLine: false, renderWhitespace: 'boundary',
              smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on', fontLigatures: true,
            }}
            height="100%"
            loading={<div className="flex items-center justify-center h-full text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading editor…</div>}
          />
        </div>
      )}
    </div>
  );
}

export default function CodeEditorPage() {
  const voice = useVoiceStore();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const activeTab = openTabs.find(t => t.path === activeTabPath) ?? null;

  const [splitMode, setSplitMode] = useState<SplitMode>('none');
  const [splitTabPath, setSplitTabPath] = useState<string | null>(null);
  const [focusedPane, setFocusedPane] = useState<'main' | 'split'>('main');
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitTab = openTabs.find(t => t.path === splitTabPath) ?? null;

  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [showTerminal, setShowTerminal] = useState(true);
  const termRef = useRef<XtermHandle>(null);
  const [showAgent, setShowAgent] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);

  const activePendingPatch = (() => {
    if (!activeTab) return null;
    for (let i = agentMessages.length - 1; i >= 0; i--) {
      const patch = agentMessages[i].patches?.find(p => p.file === activeTab.path && p.state === 'pending');
      if (patch) return { msgIdx: i, patch };
    }
    return null;
  })();
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const agentChatRef = useRef<HTMLDivElement>(null);
  const agentMessageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [agentMode, setAgentMode] = useState(() => localStorage.getItem('axe_code_agent_mode') === 'on');
  useEffect(() => { localStorage.setItem('axe_code_agent_mode', agentMode ? 'on' : 'off'); }, [agentMode]);
  const agentAbortRef = useRef<AbortController | null>(null);
  const [agentEngine, setAgentEngine] = useState<'native' | 'openhands'>(
    () => (localStorage.getItem('axe_code_agent_engine') === 'openhands' ? 'openhands' : 'native'),
  );
  useEffect(() => { localStorage.setItem('axe_code_agent_engine', agentEngine); }, [agentEngine]);

  // window.prompt()/confirm() don't work in the Tauri webview without the
  // dialog plugin (not installed here) — they return null/throw instantly,
  // so askName()/confirm() used to fail completely silently and the
  // New File / New Folder / Close-with-unsaved-changes / Delete buttons
  // looked like they did nothing. In-app modals work in every context
  // (Tauri, packaged build, plain browser) since they're just React state.
  const [promptState, setPromptState] = useState<{ message: string; value: string; resolve: (v: string | null) => void } | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const askName = useCallback((message: string): Promise<string | null> => {
    return new Promise((resolve) => setPromptState({ message, value: '', resolve }));
  }, []);
  const askConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => setConfirmState({ message, resolve }));
  }, []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<'all' | 'files'>('all');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const isMobile = useIsMobile();

  const reloadTree = useCallback(async () => {
    try {
      const nodes = await listWorkspaceDirectory('');
      setFileTree(nodes.map(n => ({ ...n, expanded: false, loaded: n.type === 'file' })));
      setRootError(null);
    } catch (err) {
      setRootError(err instanceof Error ? err.message : 'Failed to load project files');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await reloadTree();
      } finally { setRootLoading(false); }
    })();
  }, [reloadTree]);

  useEffect(() => {
    agentChatRef.current?.scrollTo(0, agentChatRef.current.scrollHeight);
  }, [agentMessages]);

  const openFile = useCallback(async (path: string, targetPane?: 'main' | 'split') => {
    if (openTabs.some(t => t.path === path)) {
      if (targetPane === 'split' || (splitMode !== 'none' && focusedPane === 'split')) {
        setSplitTabPath(path); setFocusedPane('split');
      } else {
        setActiveTabPath(path); setFocusedPane('main');
      }
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
    if (targetPane === 'split' || (splitMode !== 'none' && focusedPane === 'split')) {
      setSplitTabPath(path); setFocusedPane('split');
    } else {
      setActiveTabPath(path); setFocusedPane('main');
    }
    setMobileFilesOpen(false);
  }, [openTabs, splitMode, focusedPane]);

  const closeTab = useCallback(async (path: string) => {
    const tab = openTabs.find(t => t.path === path);
    if (tab && tab.content !== tab.savedContent) {
      if (!(await askConfirm(`Close "${tab.name}" with unsaved changes?`))) return;
    }
    const remaining = openTabs.filter(t => t.path !== path);
    setOpenTabs(remaining);
    if (activeTabPath === path) setActiveTabPath(remaining.at(-1)?.path ?? null);
    if (splitTabPath === path) setSplitTabPath(remaining.find(t => t.path !== activeTabPath)?.path ?? null);
  }, [openTabs, activeTabPath, splitTabPath, askConfirm]);

  const updateContent = useCallback((path: string, content: string) => {
    setOpenTabs(prev => prev.map(t => t.path === path ? { ...t, content } : t));
  }, []);

  const saveActiveFile = useCallback(async () => {
    const path = focusedPane === 'split' ? splitTabPath : activeTabPath;
    const tab = openTabs.find(t => t.path === path);
    if (!tab || tab.content === tab.savedContent) return;
    setSaving(true);
    try {
      await writeWorkspaceFile(tab.path, tab.content);
      setOpenTabs(prev => prev.map(t => t.path === tab.path ? { ...t, savedContent: t.content } : t));
    } catch (err) { toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setSaving(false); }
  }, [activeTabPath, splitTabPath, focusedPane, openTabs]);

  const deleteNode = useCallback(async (path: string) => {
    if (!(await askConfirm(`Delete "${path}"? Cannot be undone.`))) return;
    try {
      await deleteWorkspaceEntry(path);
      setFileTree(prev => removeNode(prev, path));
      void closeTab(path);
    } catch (err) { toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`); }
  }, [closeTab, askConfirm]);

  const moveNode = useCallback(async (from: string, toFolder: string) => {
    const name = from.split('/').pop()!;
    const to = toFolder ? `${toFolder}/${name}` : name;
    if (to === from || to.startsWith(from + '/')) return;
    try {
      await moveWorkspaceEntry(from, to);
      await reloadTree();
      setOpenTabs(prev => prev.map(t => {
        if (t.path === from) return { ...t, path: to, name };
        if (t.path.startsWith(from + '/')) {
          const next = to + t.path.slice(from.length);
          return { ...t, path: next, name: next.split('/').pop() ?? t.name };
        }
        return t;
      }));
      if (activeTabPath === from) setActiveTabPath(to);
      if (splitTabPath === from) setSplitTabPath(to);
      toast.success(`Moved → ${to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [reloadTree, activeTabPath, splitTabPath]);

  const addFile = useCallback(async () => {
    const name = await askName('File path (relative to project root):');
    if (!name) return;
    try {
      await createWorkspaceEntry(name, 'file');
      setFileTree(prev => [...prev, { path: name, name: name.split('/').pop() ?? name, type: 'file', loaded: true }]);
      await openFile(name);
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  }, [openFile, askName]);

  const addFolder = useCallback(async () => {
    const name = await askName('Folder path (relative to project root):');
    if (!name) return;
    try {
      await createWorkspaceEntry(name, 'folder');
      setFileTree(prev => [...prev, { path: name, name: name.split('/').pop() ?? name, type: 'folder', expanded: false, loaded: false }]);
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  }, [askName]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try { setSearchResults(await searchWorkspace(q, { maxResults: 80 })); }
    catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, []);

  const runFile = useCallback(() => {
    if (!activeTab) return;
    const cmd = getRunCommand(activeTab.path, activeTab.content);
    if (!cmd) { toast.error('Cannot determine run command for this file type.'); return; }
    setShowTerminal(true);
    setTimeout(() => termRef.current?.send(cmd), 120);
  }, [activeTab]);

  const sendGit = useCallback((cmd: string) => {
    setShowTerminal(true);
    setTimeout(() => termRef.current?.send(cmd + '\n'), 80);
  }, []);

  const toggleSplit = useCallback((mode: SplitMode) => {
    if (splitMode === mode) {
      setSplitMode('none'); setSplitTabPath(null); setFocusedPane('main');
      return;
    }
    setSplitMode(mode);
    setSplitRatio(0.5);
    if (!splitTabPath && activeTabPath) {
      const other = openTabs.find(t => t.path !== activeTabPath);
      setSplitTabPath(other?.path ?? activeTabPath);
    }
  }, [splitMode, splitTabPath, activeTabPath, openTabs]);

  const getSlots = (): KeySlot[] =>
    [voice.primarySlot, voice.fallback1Slot, voice.fallback2Slot, voice.fallback3Slot]
      .filter((s): s is KeySlot => s !== null);

  const handleAgentSubmit = useCallback(async (overrideInstruction?: string) => {
    const instruction = (overrideInstruction ?? agentInput).trim();
    if (!instruction || agentBusy) return;
    setAgentInput('');
    setAgentBusy(true);
    setAgentMessages(prev => [...prev, { role: 'user', text: instruction }]);

    if (agentEngine === 'openhands') {
      setAgentMessages(prev => [...prev, { role: 'status', text: '🤲 Sending task to OpenHands…' }]);
      try {
        const context = activeTab ? `Active file: ${activeTab.path}\n\n${activeTab.content.slice(0, 8000)}` : undefined;
        const result = await apiExecuteOpenHands({ task: instruction, context });
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        setAgentMessages(prev => [...prev.slice(0, -1), { role: 'agent', text, patches: [] }]);
      } catch (err) {
        setAgentMessages(prev => [...prev.slice(0, -1), { role: 'agent', text: `OpenHands error: ${err instanceof Error ? err.message : String(err)}`, patches: [] }]);
      }
      setAgentBusy(false);
      return;
    }

    if (agentMode) {
      const controller = new AbortController();
      agentAbortRef.current = controller;
      setAgentMessages(prev => [...prev, { role: 'status', text: '🔍 Gathering context…' }]);
      const workspaceRoot = activeTab ? activeTab.path.split('/')[0] : '';
      await runAgentLoop(
        instruction,
        activeTab ? { path: activeTab.path, content: activeTab.content } : null,
        getSlots(),
        {
          workspaceRoot,
          signal: controller.signal,
          onPlan: (steps) => {
            setAgentMessages(prev => {
              const withoutStatus = prev[prev.length - 1]?.role === 'status' ? prev.slice(0, -1) : prev;
              return [...withoutStatus, { role: 'plan' as const, text: '', planSteps: steps }, { role: 'status' as const, text: '🤖 Thinking…' }];
            });
          },
          onTurn: (turn) => {
            const patches: PatchWithState[] = turn.patches.map(p => ({
              ...p, id: uid(), state: turn.appliedPatches.includes(p) ? 'accepted' : 'rejected',
            }));
            setAgentMessages(prev => {
              const withoutStatus = prev[prev.length - 1]?.role === 'status' ? prev.slice(0, -1) : prev;
              const next = [...withoutStatus, {
                role: 'agent' as const, text: turn.message, patches,
                filesRead: turn.filesRead, autoApplied: true, ranCommand: turn.ranCommand,
              }];
              if (!turn.done) next.push({ role: 'status', text: turn.ranCommand ? '🔁 Reacting…' : '🤖 Thinking…' });
              return next;
            });
            if (activeTab) {
              const touched = turn.appliedPatches.find(p => p.file === activeTab.path);
              if (touched) {
                void readWorkspaceFile(activeTab.path).then(content => {
                  setOpenTabs(prevTabs => prevTabs.map(t => t.path === activeTab.path ? { ...t, content, savedContent: content } : t));
                }).catch(() => {});
              }
            }
          },
        },
      );
      setAgentMessages(prev => prev[prev.length - 1]?.role === 'status' ? prev.slice(0, -1) : prev);
      agentAbortRef.current = null;
      setAgentBusy(false);
      return;
    }

    setAgentMessages(prev => [...prev, { role: 'status', text: '🔍 Gathering context…' }]);
    const result = await runLocalAgent(
      instruction,
      activeTab ? { path: activeTab.path, content: activeTab.content } : null,
      getSlots(),
      (msg) => setAgentMessages(prev => [...prev.slice(0, -1), { role: 'status', text: msg }]),
    );
    const patches: PatchWithState[] = result.patches.map(p => ({ ...p, id: uid(), state: 'pending' }));
    setAgentMessages(prev => [...prev.slice(0, -1), { role: 'agent', text: result.message, patches, filesRead: result.filesRead }]);
    setAgentBusy(false);
  }, [agentInput, agentBusy, activeTab, agentMode, agentEngine, voice]);

  useEffect(() => {
    return designAgentBridge.register((instruction) => {
      setShowAgent(true);
      void handleAgentSubmit(instruction);
    });
  }, [handleAgentSubmit]);

  const stopAgentLoop = useCallback(() => {
    agentAbortRef.current?.abort();
  }, []);

  const acceptPatch = useCallback(async (msgIdx: number, patchId: string) => {
    const patch = agentMessages[msgIdx]?.patches?.find(p => p.id === patchId);
    if (!patch) return;
    const inMemoryTab = openTabs.find(t => t.path === patch.file);
    if (inMemoryTab) {
      const next = applyPatch(inMemoryTab.content, patch);
      if (next === null) { toast.error(`Patch not found in ${patch.file}`); return; }
      setOpenTabs(prev => prev.map(t => t.path === patch.file ? { ...t, content: next } : t));
    } else {
      try {
        const content = await readWorkspaceFile(patch.file);
        const next = applyPatch(content, patch);
        if (next === null) { toast.error(`Patch not found in ${patch.file}`); return; }
        await writeWorkspaceFile(patch.file, next);
      } catch (err) { toast.error(`Patch failed: ${err instanceof Error ? err.message : String(err)}`); return; }
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

  const allFiles = flattenFiles(fileTree);

  const openPalette = useCallback((mode: 'all' | 'files' = 'all') => {
    setPaletteMode(mode); setPaletteQuery(''); setPaletteIndex(0); setPaletteOpen(true);
    setTimeout(() => paletteInputRef.current?.focus(), 40);
  }, []);

  const paletteItems: PaletteItem[] = useMemo(() => {
    const cmds: PaletteItem[] = [
      { id: 'save', label: 'Save File', hint: '⌘S', category: 'command', run: () => { void saveActiveFile(); } },
      { id: 'new-file', label: 'New File', category: 'command', run: () => { void addFile(); } },
      { id: 'new-folder', label: 'New Folder', category: 'command', run: () => { void addFolder(); } },
      { id: 'toggle-terminal', label: 'Toggle Terminal', category: 'command', run: () => setShowTerminal(v => !v) },
      { id: 'toggle-agent', label: 'Toggle Code Agent', category: 'command', run: () => setShowAgent(v => !v) },
      { id: 'toggle-preview', label: 'Toggle Preview', category: 'command', run: () => setShowPreview(v => !v) },
      { id: 'split-h', label: 'Split Editor Horizontal', category: 'command', run: () => toggleSplit('horizontal') },
      { id: 'split-v', label: 'Split Editor Vertical', category: 'command', run: () => toggleSplit('vertical') },
      { id: 'split-none', label: 'Close Split', category: 'command', run: () => toggleSplit('none') },
      { id: 'sidebar-files', label: 'Sidebar: Files', category: 'command', run: () => setSidebarMode('files') },
      { id: 'sidebar-search', label: 'Sidebar: Search', category: 'command', run: () => setSidebarMode('search') },
      { id: 'sidebar-git', label: 'Sidebar: Git', category: 'command', run: () => setSidebarMode('git') },
      { id: 'git-status', label: 'Git: Status', category: 'command', run: () => sendGit('git status') },
      { id: 'run-file', label: 'Run Active File', category: 'command', run: () => runFile() },
    ];
    const files: PaletteItem[] = allFiles.map(f => ({
      id: `file:${f.path}`, label: f.name, hint: f.path, category: 'file' as const,
      run: () => { void openFile(f.path); },
    }));
    const pool = paletteMode === 'files' ? files : [...cmds, ...files];
    if (!paletteQuery.trim()) return pool.slice(0, 40);
    return pool
      .map(item => ({ item, score: Math.max(fuzzyScore(paletteQuery, item.label), fuzzyScore(paletteQuery, item.hint ?? '')) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(x => x.item);
  }, [allFiles, paletteQuery, paletteMode, saveActiveFile, addFile, addFolder, toggleSplit, sendGit, runFile, openFile]);

  useEffect(() => { setPaletteIndex(0); }, [paletteQuery, paletteOpen]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') { e.preventDefault(); void saveActiveFile(); }
      if (mod && e.key === 'p') { e.preventDefault(); openPalette('files'); }
      if (mod && e.key === 'k') { e.preventDefault(); openPalette('all'); }
      if (e.key === 'Escape') { setPaletteOpen(false); setPaletteQuery(''); }
      if (paletteOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(i => Math.min(i + 1, paletteItems.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && paletteItems[paletteIndex]) {
          e.preventDefault();
          paletteItems[paletteIndex].run();
          setPaletteOpen(false); setPaletteQuery('');
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [activeTab, saveActiveFile, openPalette, paletteOpen, paletteItems, paletteIndex]);

  const copyCode = () => {
    if (!activeTab?.content) return;
    void navigator.clipboard.writeText(activeTab.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const treeProps = {
    selectedPath: activeTabPath,
    onSelect: (p: string) => { void openFile(p); },
    onToggleFolder: (p: string) => { void toggleFolder(p); },
    onDelete: (p: string) => { void deleteNode(p); },
    onMove: (from: string, to: string) => { void moveNode(from, to); },
  };

  return (
    <motion.div className="h-full flex flex-col relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AnimatePresence>
        {paletteOpen && (
          <motion.div className="absolute inset-0 z-50 flex items-start justify-center pt-14"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setPaletteOpen(false); setPaletteQuery(''); }}>
            <motion.div className="w-[540px] max-w-[calc(100vw-2rem)] rounded-lg overflow-hidden"
              style={{ background: '#111', border: '1px solid rgba(34,211,238,0.2)', boxShadow: '0 24px 64px rgba(0,0,0,0.85)' }}
              initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {paletteMode === 'all' ? <Command size={12} style={{ color: 'var(--accent-cyan)' }} /> : <Search size={12} style={{ color: 'var(--accent-cyan)' }} />}
                <input ref={paletteInputRef} value={paletteQuery} onChange={e => setPaletteQuery(e.target.value)}
                  placeholder={paletteMode === 'files' ? 'Search files…' : 'Type a command or file name…'}
                  className="flex-1 bg-transparent outline-none text-[12px]" style={{ color: 'rgba(255,255,255,0.9)' }} />
                <kbd className="text-[9px] px-1 rounded" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.3)' }}>ESC</kbd>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                {paletteItems.length === 0 && <div className="py-4 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No matches</div>}
                {paletteItems.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
                    style={{ background: i === paletteIndex ? 'var(--tint)' : 'transparent' }}
                    onMouseEnter={() => setPaletteIndex(i)}
                    onClick={() => { item.run(); setPaletteOpen(false); setPaletteQuery(''); }}>
                    {item.category === 'file'
                      ? <FileCode size={10} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                      : <Zap size={10} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />}
                    <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{item.label}</span>
                    {item.hint && <span className="text-[9px] truncate flex-1 text-right" style={{ color: 'rgba(255,255,255,0.25)' }}>{item.hint}</span>}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {promptState && (
          <motion.div className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { promptState.resolve(null); setPromptState(null); }}>
            <motion.form className="w-[420px] max-w-[calc(100vw-2rem)] rounded-lg overflow-hidden"
              style={{ background: '#111', border: '1px solid rgba(34,211,238,0.2)', boxShadow: '0 24px 64px rgba(0,0,0,0.85)' }}
              initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              onSubmit={e => {
                e.preventDefault();
                const v = promptState.value.trim();
                promptState.resolve(v || null);
                setPromptState(null);
              }}>
              <div className="px-4 pt-3 pb-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{promptState.message}</div>
              <input
                autoFocus
                value={promptState.value}
                onChange={e => setPromptState(s => s && { ...s, value: e.target.value })}
                onKeyDown={e => { if (e.key === 'Escape') { promptState.resolve(null); setPromptState(null); } }}
                className="w-full bg-transparent outline-none text-[12px] px-4 py-2"
                style={{ color: 'rgba(255,255,255,0.9)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              />
              <div className="flex items-center justify-end gap-2 px-3 py-2">
                <button type="button" onClick={() => { promptState.resolve(null); setPromptState(null); }}
                  className="text-[11px] px-2.5 py-1 rounded" style={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
                <button type="submit"
                  className="text-[11px] px-2.5 py-1 rounded" style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>Create</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmState && (
          <motion.div className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>
            <motion.div className="w-[380px] max-w-[calc(100vw-2rem)] rounded-lg overflow-hidden"
              style={{ background: '#111', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 24px 64px rgba(0,0,0,0.85)' }}
              initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
              onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 text-[12px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{confirmState.message}</div>
              <div className="flex items-center justify-end gap-2 px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button onClick={() => { confirmState.resolve(false); setConfirmState(null); }}
                  className="text-[11px] px-2.5 py-1 rounded" style={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
                <button autoFocus onClick={() => { confirmState.resolve(true); setConfirmState(null); }}
                  className="text-[11px] px-2.5 py-1 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.3)' }}>Confirm</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--tint-line)', background: '#03090b' }}>
        <Code2 size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CODE STUDIO</span>
        {isMobile && (
          <Sheet open={mobileFilesOpen} onOpenChange={setMobileFilesOpen}>
            <SheetTrigger asChild>
              <button className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
                <FolderOpen size={10} /> Files
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0 overflow-hidden"
              style={{ background: '#050505', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="py-1 overflow-y-auto h-full">
                {fileTree.map(node => <FileTreeItem key={node.path} node={node} depth={0} {...treeProps} />)}
              </div>
            </SheetContent>
          </Sheet>
        )}
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button onClick={() => void addFile()} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125" style={{ color: 'rgba(255,255,255,0.5)' }}><FilePlus size={10} /> New File</button>
        <button onClick={() => void addFolder()} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125" style={{ color: 'rgba(255,255,255,0.5)' }}><FolderPlus size={10} /> Folder</button>
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button onClick={() => void saveActiveFile()}
          disabled={!activeTab || activeTab.content === activeTab.savedContent || saving}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] disabled:opacity-30 hover:brightness-125"
          style={{ color: (activeTab && activeTab.content !== activeTab.savedContent) ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}>
          {saving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />} Save
        </button>
        <button onClick={copyCode} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {copied ? <><Check size={10} style={{ color: 'var(--success)' }} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
        {activeTab && getRunCommand(activeTab.path, activeTab.content) && (
          <button onClick={runFile} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium hover:brightness-125"
            style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Play size={9} /> Run
          </button>
        )}
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button onClick={() => toggleSplit('vertical')} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: splitMode === 'vertical' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)' }} title="Split vertical"><Columns2 size={10} /></button>
        <button onClick={() => toggleSplit('horizontal')} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: splitMode === 'horizontal' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)' }} title="Split horizontal"><Rows2 size={10} /></button>
        <div className="flex-1" />
        <button onClick={() => openPalette('all')} className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}><Command size={9} /> ⌘K</button>
        <button onClick={() => openPalette('files')} className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}><Search size={9} /> ⌘P</button>
        <button onClick={() => setShowPreview(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ background: showPreview ? 'var(--tint-line)' : 'transparent', border: showPreview ? '1px solid var(--tint-line)' : '1px solid transparent', color: 'var(--accent-cyan)' }}>
          <Eye size={10} /> Preview
        </button>
        <button onClick={() => setShowAgent(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ background: showAgent ? 'var(--tint-line)' : 'transparent', border: showAgent ? '1px solid var(--tint-line)' : '1px solid transparent', color: 'var(--accent-cyan)' }}>
          <Zap size={10} /> Agent
        </button>
        <button onClick={() => setShowTerminal(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: showTerminal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}>
          <Terminal size={10} /> Terminal
        </button>
      </div>

      {openTabs.length > 0 && (
        <div className="flex items-end overflow-x-auto flex-shrink-0"
          style={{ background: '#050505', borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: 32 }}>
          {openTabs.map(tab => {
            const isActive = tab.path === activeTabPath || tab.path === splitTabPath;
            const dirty = tab.content !== tab.savedContent;
            return (
              <div key={tab.path} className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer flex-shrink-0 group"
                style={{
                  borderRight: '1px solid rgba(255,255,255,0.04)',
                  borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  background: isActive ? 'var(--tint)' : 'transparent', maxWidth: 180,
                }}
                onClick={() => {
                  if (focusedPane === 'split' && splitMode !== 'none') setSplitTabPath(tab.path);
                  else setActiveTabPath(tab.path);
                }}
                title={tab.path}>
                <FileCode size={9} style={{ color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                <span className="text-[10px] truncate flex-1" style={{ color: isActive ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.55)' }}>{tab.name}</span>
                {dirty && <span style={{ color: 'var(--warning)', fontSize: 14, lineHeight: 1 }}>•</span>}
                <button onClick={e => { e.stopPropagation(); closeTab(tab.path); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded flex-shrink-0 hover:text-red-400"
                  style={{ color: 'rgba(255,255,255,0.3)' }}><X size={9} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative">
        <div className="hidden md:flex flex-col w-[220px] flex-shrink-0"
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}>
          <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {(['files', 'search', 'git'] as const).map(mode => (
              <button key={mode} onClick={() => setSidebarMode(mode)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[9px] uppercase tracking-wide"
                style={{
                  color: sidebarMode === mode ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.3)',
                  borderBottom: sidebarMode === mode ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                }}>
                {mode === 'files' ? <Files size={9} /> : mode === 'search' ? <Search size={9} /> : <GitBranch size={9} />}
                {mode}
              </button>
            ))}
          </div>

          {sidebarMode === 'files' && (
            <div className="flex-1 overflow-y-auto py-1"
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={e => {
                e.preventDefault();
                const from = getDragFilePath(e);
                if (from) void moveNode(from, '');
              }}>
              {rootLoading && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  <RefreshCw size={9} className="animate-spin" /> Loading…
                </div>
              )}
              {rootError && <div className="px-3 py-2 text-[9px]" style={{ color: 'var(--error)' }}>{rootError}</div>}
              {fileTree.map(n => <FileTreeItem key={n.path} node={n} depth={0} {...treeProps} />)}
              <div className="px-2 py-2 text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Drag files onto folders to move · drop on empty area → root
              </div>
            </div>
          )}

          {sidebarMode === 'search' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-1 rounded px-2 py-1"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Search size={9} style={{ color: 'rgba(255,255,255,0.3)' }} />
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void runSearch(searchQuery); }}
                    placeholder="Search in files… (Enter)"
                    className="flex-1 bg-transparent outline-none text-[10px]" style={{ color: 'rgba(255,255,255,0.8)' }} />
                  {searching && <RefreshCw size={8} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {searchResults.length === 0 && !searching && searchQuery && (
                  <div className="py-3 text-center text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No results</div>
                )}
                {searchResults.map((hit, i) => (
                  <div key={i} className="px-2 py-1 cursor-pointer hover:bg-white hover:bg-opacity-5"
                    onClick={() => void openFile(hit.file)}>
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

          {sidebarMode === 'git' && (
            <LiveGitPanel onRunInTerminal={(cmd) => {
              setShowTerminal(true);
              setTimeout(() => termRef.current?.send(cmd + '\n'), 80);
            }} />
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg-surface)' }}>
          <div id="axe-split-container" className={`flex-1 min-h-0 flex ${splitMode === 'horizontal' ? 'flex-col' : 'flex-row'}`}>
            <div style={{
              flex: splitMode === 'none' ? 1 : `0 0 ${splitRatio * 100}%`,
              minWidth: 0, minHeight: 0, display: 'flex',
            }}>
              <EditorPane tab={activeTab} activePendingPatch={activePendingPatch} isMobile={isMobile}
                onChange={updateContent}
                onAcceptPatch={(mi, id) => { void acceptPatch(mi, id); }}
                onRejectPatch={rejectPatch}
                focused={focusedPane === 'main'} onFocus={() => setFocusedPane('main')} />
            </div>
            {splitMode !== 'none' && (
              <>
                <SplitResizeHandle
                  orientation={splitMode === 'vertical' ? 'vertical' : 'horizontal'}
                  onRatioChange={setSplitRatio}
                />
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
                  <EditorPane tab={splitTab} activePendingPatch={null} isMobile={isMobile}
                    onChange={updateContent}
                    onAcceptPatch={(mi, id) => { void acceptPatch(mi, id); }}
                    onRejectPatch={rejectPatch}
                    focused={focusedPane === 'split'} onFocus={() => setFocusedPane('split')} />
                </div>
              </>
            )}
          </div>

          <div className="flex-shrink-0 overflow-hidden" style={{
            height: showTerminal ? 200 : 0,
            borderTop: showTerminal ? '1px solid rgba(255,255,255,0.08)' : 'none',
            transition: 'height 0.2s ease',
          }}>
            <div className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: '#03090b', height: 26 }}>
              <Terminal size={9} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>TERMINAL</span>
              <div className="flex-1" />
              <button onClick={() => termRef.current?.clear()} className="p-0.5 rounded hover:brightness-125" style={{ color: 'rgba(255,255,255,0.3)' }}><Trash2 size={8} /></button>
              <button onClick={() => setShowTerminal(false)} className="p-0.5 rounded hover:brightness-125" style={{ color: 'rgba(255,255,255,0.3)' }}><X size={9} /></button>
            </div>
            <div style={{ height: 'calc(200px - 26px)', padding: '4px 4px 4px 8px' }}>
              <XtermTerminal ref={termRef} style={{ height: '100%' }} />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showAgent && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`flex flex-col overflow-hidden ${isMobile ? 'absolute inset-0 z-30' : 'flex-shrink-0'}`}
              style={{ width: isMobile ? '100%' : 300, borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}>
              <div className="px-3 py-2 flex items-center gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Zap size={10} style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>CODE AGENT</span>
                {agentBusy && agentMode && agentEngine === 'native' && (
                  <button onClick={stopAgentLoop} className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                    style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.25)' }}>■ Stop</button>
                )}
                {agentEngine === 'native' && (
                  <button onClick={() => setAgentMode(m => !m)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium"
                    style={{
                      background: agentMode ? 'var(--tint)' : 'rgba(255,255,255,0.04)',
                      color: agentMode ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.35)',
                      border: `1px solid ${agentMode ? 'var(--tint-line)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    <span className="rounded-full" style={{ width: 5, height: 5, background: agentMode ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.25)' }} />
                    Agent Mode
                  </button>
                )}
                <button onClick={() => setAgentMessages([])} className="p-0.5 rounded hover:brightness-125" style={{ color: 'rgba(255,255,255,0.3)' }}><Trash2 size={9} /></button>
              </div>
              <div className="px-3 py-1.5 flex items-center gap-1 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Engine:</span>
                {(['native', 'openhands'] as const).map(engine => (
                  <button key={engine} onClick={() => setAgentEngine(engine)}
                    className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                    style={{
                      background: agentEngine === engine ? 'var(--tint)' : 'rgba(255,255,255,0.04)',
                      color: agentEngine === engine ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.35)',
                      border: `1px solid ${agentEngine === engine ? 'var(--tint-line)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    {engine === 'native' ? 'AXE Native' : 'OpenHands'}
                  </button>
                ))}
              </div>
              {activeTab && (
                <div className="px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]"
                    style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--tint-line)' }}>
                    <FileCode size={8} /><span className="truncate flex-1">{activeTab.name}</span><span className="opacity-50">context</span>
                  </div>
                </div>
              )}
              <AgentActivityTrace messages={agentMessages} busy={agentBusy}
                onSelect={i => agentMessageRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
              <div ref={agentChatRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                {agentMessages.length === 0 && (
                  <div className="text-[9px] text-center py-6 space-y-1" style={{ color: 'var(--text-muted)' }}>
                    <Bot size={20} style={{ margin: '0 auto 6px', opacity: 0.3 }} />
                    <div>Describe a code change</div>
                  </div>
                )}
                {agentMessages.map((msg, i) => (
                  <div key={i} ref={el => { agentMessageRefs.current[i] = el; }}>
                    {msg.role === 'plan' && msg.planSteps && (
                      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--tint-line)' }}>
                        <div className="flex items-center gap-1.5 px-2 py-1" style={{ background: 'var(--tint)' }}>
                          <Bot size={9} style={{ color: 'var(--accent-cyan)' }} />
                          <span className="text-[9px] font-medium" style={{ color: 'rgba(165,243,252,0.85)' }}>AXE's plan</span>
                        </div>
                        <ol className="px-2 py-1.5 space-y-1">
                          {msg.planSteps.map((step, si) => (
                            <li key={si} className="flex items-start gap-1.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                              <span className="flex-shrink-0 font-mono" style={{ color: 'var(--accent-cyan)' }}>{si + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {msg.role === 'status' && (
                      <div className="flex items-center gap-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        <RefreshCw size={8} className="animate-spin flex-shrink-0" /><span>{msg.text}</span>
                      </div>
                    )}
                    {msg.role === 'user' && (
                      <div className="flex justify-end">
                        <div className="max-w-[88%] rounded px-2 py-1.5 text-[10px] leading-snug"
                          style={{ background: 'var(--tint)', color: 'rgba(255,255,255,0.85)' }}>{msg.text}</div>
                      </div>
                    )}
                    {msg.role === 'agent' && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'var(--tint)' }}>
                            <Zap size={8} style={{ color: 'var(--accent-cyan)' }} />
                          </div>
                          <div className="text-[10px] leading-snug" style={{ color: 'rgba(165,243,252,0.85)' }}>{msg.text}</div>
                        </div>
                        {msg.patches && msg.patches.length > 0 && (
                          <div className="space-y-1.5">
                            {msg.patches.map(patch => (
                              <PatchBlock key={patch.id} patch={patch}
                                onAccept={id => { void acceptPatch(i, id); }}
                                onReject={id => rejectPatch(i, id)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex gap-1.5 items-end">
                  <textarea value={agentInput} onChange={e => setAgentInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAgentSubmit(); } }}
                    placeholder="Describe a code change…" rows={2}
                    className="flex-1 text-[10px] px-2 py-1.5 rounded resize-none outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                  <button onClick={() => void handleAgentSubmit()} disabled={agentBusy || !agentInput.trim()}
                    className="px-2 py-1.5 rounded disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                    <Send size={10} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPreview && <PreviewPanel isMobile={isMobile} onClose={() => setShowPreview(false)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
