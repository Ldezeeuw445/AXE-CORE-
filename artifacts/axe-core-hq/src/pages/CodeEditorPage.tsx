/**
 * CodeEditorPage.tsx
 * ------------------------------------------------------------------
 * Full-page code editor with file tree, Monaco editor, a real embedded
 * terminal, and AI chat assistant. Reads/writes actual project files
 * through the api-server file API (see workspaceFilesService.ts) — this
 * is not a scratch/virtual file system.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Save, FilePlus, FolderPlus, Trash2,
  Terminal, ChevronRight, FileCode, Folder,
  Copy, Check, Bot, Send,
  FolderOpen, RefreshCw,
} from 'lucide-react';
import { useVoiceStore } from '@/store/voiceStore';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRealTerminal } from '@/hooks/useRealTerminal';
import {
  listWorkspaceDirectory, readWorkspaceFile, writeWorkspaceFile,
  createWorkspaceEntry, deleteWorkspaceEntry,
} from '@/services/workspaceFilesService';
import Editor from '@monaco-editor/react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface FileNode {
  path: string;        // repo-relative path — doubles as the unique id
  name: string;
  type: 'file' | 'folder';
  content?: string;
  isModified?: boolean;
  expanded?: boolean;
  loaded?: boolean;     // folders: children have been fetched from the API
  loading?: boolean;
  children?: FileNode[];
}

/* ─── Language detection ───────────────────────────────────────────────── */
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    json: 'json', md: 'markdown', html: 'html', css: 'css',
    scss: 'scss', sql: 'sql', sh: 'shell', yaml: 'yaml', yml: 'yaml',
    dockerfile: 'dockerfile', toml: 'ini',
  };
  return map[ext] || 'plaintext';
}

/* ─── Tree helpers (all operate by repo-relative path) ─────────────────── */
function findNode(nodes: FileNode[], targetPath: string | null): FileNode | null {
  if (!targetPath) return null;
  for (const n of nodes) {
    if (n.path === targetPath) return n;
    if (n.children) { const f = findNode(n.children, targetPath); if (f) return f; }
  }
  return null;
}

function mapNode(nodes: FileNode[], targetPath: string, fn: (n: FileNode) => FileNode): FileNode[] {
  return nodes.map(n => {
    if (n.path === targetPath) return fn(n);
    if (n.children) return { ...n, children: mapNode(n.children, targetPath, fn) };
    return n;
  });
}

function removeNode(nodes: FileNode[], targetPath: string): FileNode[] {
  return nodes.filter(n => n.path !== targetPath).map(n =>
    n.children ? { ...n, children: removeNode(n.children, targetPath) } : n
  );
}

/* ─── File Tree Item ───────────────────────────────────────────────────── */
function FileTreeItem({
  node, depth, selectedId, onSelect, onToggleFolder, onDelete,
}: {
  node: FileNode;
  depth: number;
  selectedId: string | null;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const isSelected = selectedId === node.path;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 pr-1 cursor-pointer group"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: isSelected ? 'rgba(34,211,238,0.08)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        }}
        onClick={() => node.type === 'folder' ? onToggleFolder(node.path) : onSelect(node.path)}
      >
        {node.type === 'folder' && (
          <ChevronRight
            size={9}
            style={{
              color: 'rgba(255,255,255,0.3)',
              transform: node.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          />
        )}
        {node.type === 'folder'
          ? (node.loading
              ? <RefreshCw size={10} className="animate-spin" style={{ color: 'rgba(255,255,255,0.4)' }} />
              : <Folder size={10} style={{ color: node.expanded ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }} />)
          : <FileCode size={10} style={{ color: isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }} />
        }
        <span className="text-[10px] flex-1 truncate" style={{ color: isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.65)' }}>
          {node.name}
          {node.isModified && <span style={{ color: '#F59E0B' }}>*</span>}
        </span>
        <button onClick={e => { e.stopPropagation(); onDelete(node.path); }} className="opacity-0 group-hover:opacity-100 p-0.5">
          <Trash2 size={8} style={{ color: 'rgba(255,255,255,0.2)' }} />
        </button>
      </div>
      {node.type === 'folder' && node.expanded && node.children?.map(child => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleFolder={onToggleFolder}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

/* ─── Compact real terminal panel (shares the WS session logic with the
       full Terminal tab — see useRealTerminal) ─────────────────────────── */
function TerminalPanel() {
  const { output, connected, send } = useRealTerminal('Connecting to real shell…\r\n');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1 font-mono-data whitespace-pre-wrap break-words text-[9px] leading-tight" style={{ color: 'rgba(255,255,255,0.7)' }}>
        {output}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: connected ? '#10B981' : '#ef4444', fontSize: 9 }}>$</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { send(input + '\n'); setInput(''); } }}
          placeholder={connected ? 'type a real command…' : 'connecting…'}
          disabled={!connected}
          className="flex-1 bg-transparent outline-none font-mono-data"
          style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9 }}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CODE EDITOR PAGE
   ══════════════════════════════════════════════════════════════════════════ */
export default function CodeEditorPage() {
  const voice = useVoiceStore();

  const [files, setFiles] = useState<FileNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  const selectedFile = findNode(files, selectedId);

  // Load the repo root listing on mount.
  useEffect(() => {
    void (async () => {
      try {
        const nodes = await listWorkspaceDirectory('');
        setFiles(nodes.map(n => ({ ...n, expanded: false, loaded: n.type === 'file' })));
      } catch (err) {
        setRootError(err instanceof Error ? err.message : 'Failed to load project files');
      } finally {
        setRootLoading(false);
      }
    })();
  }, []);

  const toggleFolder = useCallback(async (path: string) => {
    const node = findNode(files, path);
    if (!node) return;

    if (!node.expanded && !node.loaded) {
      setFiles(prev => mapNode(prev, path, n => ({ ...n, loading: true })));
      try {
        const children = await listWorkspaceDirectory(path);
        setFiles(prev => mapNode(prev, path, n => ({
          ...n,
          loading: false,
          loaded: true,
          expanded: true,
          children: children.map(c => ({ ...c, expanded: false, loaded: c.type === 'file' })),
        })));
      } catch {
        setFiles(prev => mapNode(prev, path, n => ({ ...n, loading: false })));
      }
      return;
    }

    setFiles(prev => mapNode(prev, path, n => ({ ...n, expanded: !n.expanded })));
  }, [files]);

  const selectFile = useCallback(async (path: string) => {
    setSelectedId(path);
    const node = findNode(files, path);
    if (!node || node.content !== undefined) return;
    setFiles(prev => mapNode(prev, path, n => ({ ...n, loading: true })));
    try {
      const content = await readWorkspaceFile(path);
      setFiles(prev => mapNode(prev, path, n => ({ ...n, content, loading: false })));
    } catch (err) {
      setFiles(prev => mapNode(prev, path, n => ({
        ...n, loading: false, content: `// Failed to load file: ${err instanceof Error ? err.message : 'unknown error'}`,
      })));
    }
  }, [files]);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles(prev => mapNode(prev, path, n => ({ ...n, content, isModified: true })));
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedFile || selectedFile.content === undefined || !selectedFile.isModified) return;
    setSaving(true);
    try {
      await writeWorkspaceFile(selectedFile.path, selectedFile.content);
      setFiles(prev => mapNode(prev, selectedFile.path, n => ({ ...n, isModified: false })));
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [selectedFile]);

  // Cmd/Ctrl+S saves the open file.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void saveFile(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveFile]);

  const deleteNode = useCallback(async (path: string) => {
    if (!confirm(`Delete ${path}? This cannot be undone.`)) return;
    try {
      await deleteWorkspaceEntry(path);
      setFiles(prev => removeNode(prev, path));
      if (selectedId === path) setSelectedId(null);
    } catch (err) {
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }, [selectedId]);

  // New files/folders are created at the repo root by default — keeps this
  // simple and predictable rather than guessing "current" directory context.
  const addFile = useCallback(async () => {
    const name = prompt('File path (relative to project root):');
    if (!name) return;
    try {
      await createWorkspaceEntry(name, 'file');
      setFiles(prev => [...prev, { path: name, name: name.split('/').pop() || name, type: 'file', content: '', loaded: true }]);
      setSelectedId(name);
    } catch (err) {
      alert(`Failed to create file: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }, []);

  const addFolder = useCallback(async () => {
    const name = prompt('Folder path (relative to project root):');
    if (!name) return;
    try {
      await createWorkspaceEntry(name, 'folder');
      setFiles(prev => [...prev, { path: name, name: name.split('/').pop() || name, type: 'folder', expanded: false, loaded: false }]);
    } catch (err) {
      alert(`Failed to create folder: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }, []);

  const copyCode = () => {
    if (!selectedFile?.content) return;
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAiChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatBusy(true);
    try {
      await voice.sendMessage(`[CODE] ${text}`);
      const last = voice.conversation[voice.conversation.length - 1];
      if (last?.role === 'axe') {
        setChatMessages(prev => [...prev, { role: 'ai', text: last.text }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Error processing request.' }]);
    }
    setChatBusy(false);
  };

  const language = selectedFile ? detectLanguage(selectedFile.name) : 'plaintext';

  return (
    <motion.div className="h-full flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>
        <Code2 size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CODE EDITOR</span>
        {isMobile && (
          <Sheet open={mobileFilesOpen} onOpenChange={setMobileFilesOpen}>
            <SheetTrigger asChild>
              <button className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[9px]" style={{ background: 'rgba(34,211,238,0.1)', color: '#22D3EE', border: '1px solid rgba(34,211,238,0.2)' }}>
                <FolderOpen size={10} /> Files
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0 overflow-hidden" style={{ background: '#050505', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="py-1 overflow-y-auto h-full">
                {files.map(node => (
                  <FileTreeItem
                    key={node.path} node={node} depth={0}
                    selectedId={selectedId}
                    onSelect={(path) => { void selectFile(path); setMobileFilesOpen(false); }}
                    onToggleFolder={(path) => void toggleFolder(path)}
                    onDelete={(path) => void deleteNode(path)}
                  />
                ))}
              </div>
            </SheetContent>
          </Sheet>
        )}
        <div className="w-px h-4 mx-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button onClick={() => void addFile()} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }} title="New file"><FilePlus size={10} /> New File</button>
        <button onClick={() => void addFolder()} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }} title="New folder"><FolderPlus size={10} /> Folder</button>
        <button
          onClick={() => void saveFile()}
          disabled={!selectedFile?.isModified || saving}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] disabled:opacity-30"
          style={{ color: selectedFile?.isModified ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}
          title="Save (Ctrl+S)"
        >
          {saving ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />} Save
        </button>
        <button onClick={copyCode} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }} title="Copy">{copied ? <><Check size={10} style={{ color: 'var(--success)' }} /> Copied</> : <><Copy size={10} /> Copy</>}</button>
        <div className="flex-1" />
        <button onClick={() => setShowAiChat(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]" style={{ background: showAiChat ? 'rgba(34,211,238,0.1)' : 'transparent', border: showAiChat ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent', color: 'var(--accent-cyan)' }}><Bot size={10} /> AI</button>
        <button onClick={() => setShowTerminal(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]" style={{ color: showTerminal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}><Terminal size={10} /> Terminal</button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* File Tree */}
        <div className="hidden md:block w-[200px] flex-shrink-0 overflow-y-auto py-1" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}>
          {rootLoading && (
            <div className="flex items-center gap-1.5 px-3 py-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              <RefreshCw size={10} className="animate-spin" /> Loading project files…
            </div>
          )}
          {rootError && (
            <div className="px-3 py-2 text-[9px]" style={{ color: '#EF4444' }}>{rootError}</div>
          )}
          {files.map(node => (
            <FileTreeItem
              key={node.path} node={node} depth={0}
              selectedId={selectedId}
              onSelect={(path) => void selectFile(path)}
              onToggleFolder={(path) => void toggleFolder(path)}
              onDelete={(path) => void deleteNode(path)}
            />
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: '#0a0a0a' }}>
          {selectedFile ? (
            <>
              <div className="flex items-center gap-1 px-3 py-1 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <FileCode size={9} style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{selectedFile.path}</span>
                {selectedFile.isModified && <span style={{ color: '#F59E0B', fontSize: 10 }}>*</span>}
                <span className="text-[8px] ml-1 px-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>{language}</span>
              </div>
              <div className="flex-1 min-h-0">
                {selectedFile.loading ? (
                  <div className="flex items-center justify-center h-full text-[10px] gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <RefreshCw size={10} className="animate-spin" /> Loading file…
                  </div>
                ) : (
                  <Editor
                    language={language}
                    theme="vs-dark"
                    value={selectedFile.content ?? ''}
                    onChange={(v) => updateFileContent(selectedFile.path, v ?? '')}
                    options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', wordWrap: 'on', automaticLayout: true, scrollBeyondLastLine: false }}
                    height="100%"
                    loading={<div className="flex items-center justify-center h-full text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading editor...</div>}
                  />
                )}
              </div>

              {/* Terminal */}
              <AnimatePresence>
                {showTerminal && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: 140 }} exit={{ height: 0 }}
                    className="flex-shrink-0 overflow-hidden"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <TerminalPanel />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <FolderOpen size={32} style={{ color: 'rgba(255,255,255,0.1)' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {rootLoading ? 'Loading project…' : 'Select a file or create a new one'}
              </span>
            </div>
          )}
        </div>

        {/* AI Chat Panel */}
        <AnimatePresence>
          {showAiChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden flex flex-col"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}
            >
              <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-1.5">
                  <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>CODE ASSISTANT</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {chatMessages.length === 0 && (
                  <div className="text-[9px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
                    Ask AXE to help with code, debug, or explain
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="mt-0.5 flex-shrink-0 text-[8px] w-4 h-4 rounded-full flex items-center justify-center" style={{ background: m.role === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(34,211,238,0.15)', color: m.role === 'user' ? 'var(--text-muted)' : 'var(--accent-cyan)' }}>
                      {m.role === 'user' ? 'U' : <Bot size={8} />}
                    </div>
                    <div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: m.role === 'user' ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: m.role === 'user' ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div>
                  </div>
                ))}
                {chatBusy && <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><RefreshCw size={8} className="animate-spin" /> Thinking...</div>}
              </div>
              <div className="p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex gap-1">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleAiChat(); }} placeholder="Ask about code..." className="flex-1 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                  <button onClick={handleAiChat} disabled={chatBusy} className="px-2 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Send size={10} /></button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
