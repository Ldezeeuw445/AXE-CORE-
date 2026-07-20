import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { Bot, Send, RefreshCw, Save, FileCode, Plus, FolderOpen } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { Sheet, SheetContent, SheetTrigger } from '@/presentation/components/ui/sheet';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { ghGetFile, ghUpdateFile, ghGetTree } from '@/infrastructure/gateways/axeCoreApiService';

interface RepoConfig {
  id: string;
  label: string;
  owner: string;
  repo: string;
  branch: string;
  srcPrefix: string;
  token: string;
}

const REPO_DEFAULTS: RepoConfig[] = [
  { id: 'axe-core', label: 'AXE CORE', owner: 'Ldezeeuw445', repo: 'AXE-CORE-', branch: 'orchestrator', srcPrefix: 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src', token: '' },
  { id: 'axe-companion', label: 'AXE Companion', owner: 'Ldezeeuw445', repo: 'AXE-COMPANION-OS-', branch: 'main', srcPrefix: 'src', token: '' },
  { id: 'trading-os', label: 'Trading OS', owner: 'TRADING-AXE-OS-APPS', repo: 'TRADING-OS', branch: 'main', srcPrefix: 'src', token: '' },
];

function loadRepoConfigs(): RepoConfig[] {
  try {
    const stored = JSON.parse(localStorage.getItem('axe_github_repos') ?? 'null');
    if (Array.isArray(stored) && stored.length > 0) return stored as RepoConfig[];
  } catch { /* */ }
  return REPO_DEFAULTS;
}

export default function CommandCenter() {
  const voice = useVoiceStore();
  const [repos, setRepos] = useState<RepoConfig[]>(loadRepoConfigs);
  const [activeRepo, setActiveRepo] = useState(repos[0]?.id ?? 'axe-core');
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'ok' | 'error'>('idle');
  const [statusText, setStatusText] = useState('');
  const [chat, setChat] = useState<Array<{ role: 'user' | 'axe'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const isMobile = useIsMobile();

  const repo = repos.find(r => r.id === activeRepo) ?? REPO_DEFAULTS[0];

  const loadTree = async () => {
    setStatus('loading'); setStatusText('Loading all repos...');
    try {
      const allFiles: Array<{ path: string; repo: RepoConfig }> = [];
      for (const r of repos) {
        try {
          const tree = await ghGetTree(`${r.owner}/${r.repo}`, r.branch);
          const srcFiles = tree.filter(p => p.startsWith(r.srcPrefix) && /\.(tsx?|ts|jsx?|js|json|css|md)$/.test(p)).slice(0, 100);
          srcFiles.forEach(f => allFiles.push({ path: f, repo: r }));
        } catch (e) {
          console.warn(`Failed to load ${r.label}:`, e);
        }
      }
      setFiles(allFiles.map(f => f.path));
      setStatus('idle'); setStatusText(`Loaded ${allFiles.length} files from ${repos.length} repos`);
    } catch (e) {
      setStatus('error'); setStatusText(String(e));
    }
  };

  const findRepoForPath = (path: string): RepoConfig | undefined => {
    return repos.find(r => path.startsWith(r.srcPrefix));
  };

  const openFile = async (path: string) => {
    setStatus('loading'); setStatusText('Reading file...');
    try {
      const fileRepo = findRepoForPath(path);
      if (!fileRepo) throw new Error('No repo found for path');
      const relative = path.slice(fileRepo.srcPrefix.length + 1);
      const data = await ghGetFile(`${fileRepo.owner}/${fileRepo.repo}`, path, fileRepo.branch);
      setActiveFile(path);
      setContent(data.content);
      setCommitMsg(`feat: update ${relative}`);
      setStatus('idle'); setStatusText('');
    } catch (e) {
      setStatus('error'); setStatusText(String(e));
    }
  };

  const createFile = async () => {
    if (!newFileName.trim()) return;
    const path = `${repo.srcPrefix}/${newFileName.trim()}`;
    setActiveFile(path);
    setContent('');
    setCommitMsg(`feat: add ${newFileName.trim()}`);
    setShowNewFile(false);
    setNewFileName('');
    setStatus('idle'); setStatusText('New file ready');
  };

  const saveFile = async () => {
    if (!activeFile || !content) return;
    setStatus('saving'); setStatusText('Committing to GitHub...');
    try {
      const relative = activeFile.slice(repo.srcPrefix.length + 1);
      await ghUpdateFile(`${repo.owner}/${repo.repo}`, activeFile, content, commitMsg || `update ${relative}`, repo.branch);
      setStatus('ok'); setStatusText('Committed! Vercel will redeploy shortly.');
      setTimeout(() => setStatus('idle'), 4000);
      await loadTree();
    } catch (e) {
      setStatus('error'); setStatusText(String(e));
    }
  };

  const handleChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChat(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatBusy(true);
    try {
      await voice.sendMessage(text);
      const last = voice.conversation[voice.conversation.length - 1];
      if (last?.role === 'axe') {
        setChat(prev => [...prev, { role: 'axe', text: last.text }]);
      }
    } catch {
      setChat(prev => [...prev, { role: 'axe', text: 'Error sending message.' }]);
    }
    setChatBusy(false);
  };

  useEffect(() => { loadTree(); }, [activeRepo]);

  return (
    <motion.div className="h-full flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>
        <FileCode size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>DEVELOPER — CODE + AI</span>
        <select value={activeRepo} onChange={e => setActiveRepo(e.target.value)} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
          {repos.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {isMobile && (
          <Sheet open={mobileFilesOpen} onOpenChange={setMobileFilesOpen}>
            <SheetTrigger asChild>
              <button className="ml-1 p-1 rounded" style={{ color: 'var(--accent-cyan)', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)' }}>
                <FolderOpen size={12} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0 overflow-hidden" style={{ background: '#030505', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="p-2 text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Files</div>
              <div className="overflow-y-auto h-full pb-4">
                {files.map(f => {
                  const relative = f.slice(repo.srcPrefix.length + 1);
                  return (
                    <button key={f} onClick={() => { openFile(f); setMobileFilesOpen(false); }} className="w-full text-left px-2 py-1 text-[10px] truncate" style={{ color: activeFile === f ? 'var(--accent-cyan)' : 'var(--text-muted)', background: activeFile === f ? 'rgba(34,211,238,0.05)' : 'transparent' }}>
                      {relative}
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
        <button onClick={loadTree} className="p-1 rounded" style={{ color: 'var(--text-muted)' }}><RefreshCw size={12} /></button>
        <button onClick={() => setShowNewFile(v => !v)} className="p-1 rounded" style={{ color: 'var(--accent-cyan)' }}><Plus size={12} /></button>
        {showNewFile && (
          <div className="flex items-center gap-1">
            <input value={newFileName} onChange={e => setNewFileName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createFile(); if (e.key === 'Escape') setShowNewFile(false); }} placeholder="new-file.tsx" className="text-[10px] px-2 py-1 rounded w-32" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
            <button onClick={createFile} className="px-2 py-1 rounded text-[10px]" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Create</button>
          </div>
        )}
        <div className="flex-1" />
        {statusText && <span className="text-[10px] font-mono-data" style={{ color: status === 'error' ? 'var(--error)' : status === 'ok' ? 'var(--success)' : 'var(--text-muted)' }}>{statusText}</span>}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* File explorer */}
        <div className="hidden md:block w-48 flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid rgba(255,255,255,0.04)', background: '#030505' }}>
          <div className="p-2 text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Files</div>
          {files.map(f => {
            const relative = f.slice(repo.srcPrefix.length + 1);
            return (
              <button key={f} onClick={() => openFile(f)} className="w-full text-left px-2 py-1 text-[10px] truncate" style={{ color: activeFile === f ? 'var(--accent-cyan)' : 'var(--text-muted)', background: activeFile === f ? 'rgba(34,211,238,0.05)' : 'transparent' }}>
                {relative}
              </button>
            );
          })}
        </div>

        {/* Editor + Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeFile ? (
            <>
              <div className="flex-1 min-h-0">
                <Editor
                  language="typescript"
                  theme="vs-dark"
                  value={content}
                  onChange={(v) => setContent(v || '')}
                  options={{ minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', wordWrap: 'on', automaticLayout: true }}
                  height="100%"
                  loading={<div className="flex items-center justify-center h-full text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading editor...</div>}
                />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: '#03090b' }}>
                <input value={commitMsg} onChange={e => setCommitMsg(e.target.value)} placeholder="Commit message..." className="flex-1 text-[11px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                <button onClick={saveFile} disabled={status === 'saving'} className="flex items-center gap-1 px-3 py-1 rounded text-[11px]" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                  {status === 'saving' ? <RefreshCw size={10} className="animate-spin" /> : <><Save size={10} /> Commit</>}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[10px]" style={{ color: 'var(--text-muted)' }}>Select a file to edit or create a new one</div>
          )}
        </div>

        {/* Chat panel */}
        <div className="hidden md:flex w-72 flex-shrink-0 flex flex-col" style={{ borderLeft: '1px solid rgba(255,255,255,0.04)', background: '#030505' }}>
          <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-1.5">
              <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>AXE CORE</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {chat.map((m, i) => (
              <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="mt-0.5 flex-shrink-0">{m.role === 'user' ? <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>U</span> : <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />}</div>
                <div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: m.role === 'user' ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: m.role === 'user' ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div>
              </div>
            ))}
            {chatBusy && <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Thinking...</div>}
          </div>
          <div className="p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex gap-1">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleChat(); }} placeholder="Ask AXE..." className="flex-1 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              <button onClick={handleChat} disabled={chatBusy} className="px-2 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Send size={10} /></button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
