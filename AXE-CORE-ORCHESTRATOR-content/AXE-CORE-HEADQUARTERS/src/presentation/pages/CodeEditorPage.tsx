/**
 * CodeEditorPage.tsx — AXE Code Studio (Zed-inspired)
 * - Cmd+K palette · Cmd+P quick-open · splits · live git · DnD file tree
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { PlaatPanel, PlaatRail } from '@/presentation/components/layout/PlaatSlots';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Save, FilePlus, FolderPlus, Trash2,
  Terminal, ChevronRight, FileCode, Folder,
  Copy, Check, Bot, Send, FolderOpen, RefreshCw,
  Play, Search, X, Files, Zap, Eye,
  GitBranch, Columns2, Rows2, Square, Command,
  Paperclip, Volume2,
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

/**
 * Monaco's eigen achtergrond, weg.
 *
 * `theme="vs-dark"` schildert #1e1e1e achter de code -- op een zwarte app viel
 * dat niet op, op de plaat is het een lichter vlak midden in het beeld. Dat is
 * precies wat de achtergrond niet mag doen: er komt iets OP de plaat, de plaat
 * verandert niet.
 *
 * Een thema kan alleen kleuren zetten die het kent, dus dit is vs-dark met de
 * vlakken op doorzichtig gezet -- de syntaxkleuren blijven van vs-dark. De acht
 * alfa-nullen zijn geen typefout: Monaco wil #RRGGBBAA. */
const PLAAT_THEMA = 'axe-plaat';
type MonacoApi = Parameters<NonNullable<React.ComponentProps<typeof Editor>['beforeMount']>>[0];
function definieerPlaatThema(monaco: MonacoApi) {
  monaco.editor.defineTheme(PLAAT_THEMA, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
      'editorOverviewRuler.background': '#00000000',
      'scrollbarSlider.background': '#ffffff14',
    },
  });
}

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
/**
 * Hoe de code-plaat verdeeld is.
 *
 * 'uit' is de rusttoestand, en dat is met opzet niet 'een plaat'. Zonder open
 * bestand hoort er niets op de achtergrond te liggen: de schil is de basis, en
 * de plaat is iets wat je AANZET. Pas als je een indeling kiest -- of een
 * bestand opent -- komt er mat zwart overheen te liggen.
 */
type Indeling = 'uit' | 'enkel' | 'rijen' | 'kolommen';

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

/**
 * Wat je hier kunt doen -- en verder niets.
 *
 * Op de kale achtergrond stond nergens dat je er een bestand op mag gooien, en
 * een mogelijkheid die je niet ziet bestaat niet. In cyaan omdat dat in deze
 * app de kleur is van "hier kan iets"; grijs zou als uitgezet lezen, en dan
 * heeft het geen zin om het op te schrijven.
 *
 * Dezelfde uitleg staat op een lege plaat, want daar geldt hetzelfde: leeg is
 * geen toestand om iets over te raden.
 */
function SleepUitleg({ actief }: { actief: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 pointer-events-none select-none">
      <FolderOpen size={24} style={{ color: 'var(--accent-cyan)', opacity: actief ? 0.9 : 0.4 }} />
      <div className="text-[11px]" style={{ color: 'var(--accent-cyan)', opacity: actief ? 1 : 0.75 }}>
        Sleep een bestand hierheen
      </div>
      <div className="text-[9px]" style={{ color: 'var(--accent-cyan)', opacity: 0.42 }}>
        of open er een met ⌘P · ⌘K
      </div>
    </div>
  );
}

/** Het vlak dat die uitleg draagt en het bestand aanneemt. */
function SleepVlak({ onBestand }: { onBestand: (e: React.DragEvent) => void }) {
  const [erboven, setErboven] = useState(false);
  return (
    <div className="flex-1 min-h-0 flex items-center justify-center"
      onDragOver={e => { e.preventDefault(); setErboven(true); }}
      onDragLeave={() => setErboven(false)}
      onDrop={e => { setErboven(false); onBestand(e); }}
      style={{
        borderRadius: 18,
        /* Gestippeld en alleen tijdens het slepen: een rand die er altijd
           staat is een vak, en vakken zijn precies wat hier weg moest. */
        outline: erboven ? '1px dashed var(--accent-cyan)' : '1px dashed transparent',
        outlineOffset: -10,
      }}>
      <SleepUitleg actief={erboven} />
    </div>
  );
}

function EditorPane({
  tab, activePendingPatch, isMobile, onChange, onAcceptPatch, onRejectPatch, focused, onFocus, onBestand,
}: {
  tab: OpenTab | null;
  activePendingPatch: { msgIdx: number; patch: PatchWithState } | null;
  isMobile: boolean;
  onChange: (path: string, content: string) => void;
  onAcceptPatch: (msgIdx: number, id: string) => void;
  onRejectPatch: (msgIdx: number, id: string) => void;
  focused?: boolean;
  onFocus?: () => void;
  onBestand: (e: React.DragEvent) => void;
}) {
  const opPlaat = useHeeftPlaat();
  if (!tab) {
    return (
      <div className="flex-1 flex min-h-0" onClick={onFocus}>
        <SleepVlak onBestand={onBestand} />
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
                <DiffEditor language={tab.language} theme={opPlaat ? PLAAT_THEMA : "vs-dark"} beforeMount={definieerPlaatThema} original={tab.content} modified={modified}
                  options={{ readOnly: true, fontSize: 13, renderSideBySide: !isMobile, minimap: { enabled: false }, automaticLayout: true }} />
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Editor key={tab.path} language={tab.language} theme={opPlaat ? PLAAT_THEMA : "vs-dark"} beforeMount={definieerPlaatThema} value={tab.content}
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
  /* Of de plaat-schil eronder ligt. Zonder plaat blijft deze pagina zich
     gedragen zoals hij altijd deed -- dat is wat 'de schil is de basis'
     betekent: de pagina hangt ervan af, niet andersom. */
  const opPlaat = useHeeftPlaat();
  const voice = useVoiceStore();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const activeTab = openTabs.find(t => t.path === activeTabPath) ?? null;

  const [indeling, setIndeling] = useState<Indeling>('uit');
  /* Twee panelen betekent gesplitst; een plaat en geen plaat allebei niet. */
  const gesplitst = indeling === 'rijen' || indeling === 'kolommen';
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
  /* De agent staat er gewoon. Hij zat achter een knop, maar in de nieuwe
     indeling hangt hij in het rechterslot naast de chatplaat -- daar staat hij
     niets in de weg, en een paneel dat je eerst moet aanzetten vergeet je. */
  const [showAgent, setShowAgent] = useState(true);
  const agentBestandRef = useRef<HTMLInputElement>(null);
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
    /* Een bestand openen zet de plaat aan. Anders open je iets en gebeurt er
       niets zichtbaars -- de code zou dan achter de knop 'een plaat' liggen. */
    setIndeling(v => (v === 'uit' ? 'enkel' : v));
    if (openTabs.some(t => t.path === path)) {
      if (targetPane === 'split' || (gesplitst && focusedPane === 'split')) {
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
    if (targetPane === 'split' || (gesplitst && focusedPane === 'split')) {
      setSplitTabPath(path); setFocusedPane('split');
    } else {
      setActiveTabPath(path); setFocusedPane('main');
    }
    setMobileFilesOpen(false);
  }, [openTabs, gesplitst, focusedPane]);

  const closeTab = useCallback(async (path: string) => {
    const tab = openTabs.find(t => t.path === path);
    if (tab && tab.content !== tab.savedContent) {
      if (!(await askConfirm(`Close "${tab.name}" with unsaved changes?`))) return;
    }
    const remaining = openTabs.filter(t => t.path !== path);
    setOpenTabs(remaining);
    /* Niets meer open, dus niets meer om een plaat voor neer te leggen. */
    if (remaining.length === 0) setIndeling('uit');
    if (activeTabPath === path) setActiveTabPath(remaining.at(-1)?.path ?? null);
    if (splitTabPath === path) setSplitTabPath(remaining.find(t => t.path !== activeTabPath)?.path ?? null);
  }, [openTabs, activeTabPath, splitTabPath, askConfirm]);

  /* Een bestand dat je op de achtergrond of op een lege plaat laat vallen.
   *
   * Twee soorten sleep komen hier samen. Uit de bestandsboom komt een pad --
   * dan openen we gewoon dat bestand uit de werkmap. Van buiten de app komt
   * een File zonder pad: het besturingssysteem geeft de inhoud, niet de plek.
   * Die openen we als tabblad met de bestandsnaam; opslaan zou hem dus in de
   * wortel van de werkmap zetten, en dat is ook wat je van "hier neergelegd"
   * verwacht.
   *
   * De grens van 2 MB is er tegen het per ongeluk binnenslepen van een video:
   * die zou als tekst worden gelezen en de editor laten vastlopen. */
  const neemBestandAan = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const uitDeBoom = getDragFilePath(e);
    if (uitDeBoom) { void openFile(uitDeBoom); return; }

    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) { toast(`${f.name} is te groot om in de editor te openen`); return; }
    let inhoud: string;
    try { inhoud = await f.text(); } catch { toast(`${f.name} kon niet gelezen worden`); return; }

    setOpenTabs(prev => prev.some(t => t.path === f.name)
      ? prev
      : [...prev, { path: f.name, name: f.name, language: detectLanguage(f.name), content: inhoud, savedContent: inhoud }]);
    setActiveTabPath(f.name);
    setFocusedPane('main');
    setIndeling(v => (v === 'uit' ? 'enkel' : v));
  }, [openFile]);

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

  /* Dezelfde knop nog eens indrukken zet de plaat weer uit. Dat is wat de
     iconen betekenen: je kiest hoe het scherm verdeeld is, en 'niet verdeeld'
     hoort daar ook bij -- dan zie je gewoon de achtergrond weer. */
  const kiesIndeling = useCallback((mode: Indeling) => {
    if (indeling === mode) {
      setIndeling('uit'); setSplitTabPath(null); setFocusedPane('main');
      return;
    }
    setIndeling(mode);
    setSplitRatio(0.5);
    if (mode !== 'enkel' && !splitTabPath && activeTabPath) {
      const other = openTabs.find(t => t.path !== activeTabPath);
      setSplitTabPath(other?.path ?? activeTabPath);
    }
  }, [indeling, splitTabPath, activeTabPath, openTabs]);

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
      { id: 'plaat-een', label: 'Een plaat', category: 'command', run: () => kiesIndeling('enkel') },
      { id: 'plaat-kolommen', label: 'Twee platen naast elkaar', category: 'command', run: () => kiesIndeling('kolommen') },
      { id: 'plaat-rijen', label: 'Twee platen boven elkaar', category: 'command', run: () => kiesIndeling('rijen') },
      { id: 'plaat-uit', label: 'Plaat weg — alleen de achtergrond', category: 'command', run: () => kiesIndeling('uit') },
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
  }, [allFiles, paletteQuery, paletteMode, saveActiveFile, addFile, addFolder, kiesIndeling, sendGit, runFile, openFile]);

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

      {/* Wat deze tab te bedienen heeft, in het dock.

          Je vroeg om de rechterknoppen in de kop van de agent-plaat. Dat heb ik
          niet gedaan, om één reden: de Agent-knop zit daar dan in zijn eigen
          paneel, dus zet je hem uit, dan verdwijnt de knop waarmee je hem weer
          aan zet. Het dock is er precies voor dit soort knoppen -- ze horen bij
          wat je ziet, staan op elke tab op dezelfde plek en verdwijnen niet met
          het paneel dat ze bedienen. De bestandsknoppen staan links in de kop
          van het terminal-paneel, zoals je vroeg. */}
      <div className="axe-pagina-werkbalk flex items-center gap-1 px-3 py-1.5 flex-shrink-0 flex-wrap"
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
        <button onClick={() => kiesIndeling('enkel')} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: indeling === 'enkel' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)' }} title="Een plaat"><Square size={10} /></button>
        <button onClick={() => kiesIndeling('kolommen')} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: indeling === 'kolommen' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)' }} title="Twee naast elkaar"><Columns2 size={10} /></button>
        <button onClick={() => kiesIndeling('rijen')} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] hover:brightness-125"
          style={{ color: indeling === 'rijen' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)' }} title="Twee boven elkaar"><Rows2 size={10} /></button>
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
                  if (focusedPane === 'split' && gesplitst) setSplitTabPath(tab.path);
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
        {/* De bestandsboom is hier de uitschuivende linkerrail.
            Hij stond als vaste kolom van 220px naast de editor: altijd zichtbaar,
            altijd ruimte kwijt, ook als je gewoon aan het lezen bent. Als rail komt
            hij met hetzelfde gebaar als overal -- muis naar de rand -- en houdt de
            editor zijn volle breedte. De standaardwidgets wijken hier; twee dingen
            die op dezelfde plek uitschuiven is een botsing, geen keuze. */}
        <PlaatRail title="Bestanden">
          {/* Geen eigen vak meer. In de rail IS de rail al de plaat, dus een
              kolom met zijn eigen zwart en een streep ernaast leest daarop als
              een doos in een doos -- dat zwarte vlak om de bestanden. Wat
              overblijft is de inhoud, op de plaat die er al ligt. */}
          <div className="flex flex-col w-full min-h-0 flex-1">
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
        </PlaatRail>

        {/* Hier lag een vlak van rgba(255,255,255,0.035) over de volle hoogte
            -- dat was de witte waas. Een achtergrond hoort de achtergrond te
            laten zien; wat licht moet zijn is de PLAAT die erop komt, en die
            komt er alleen als je hem aanzet. */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Niets open: dan is de schil zelf het vlak waar je iets op legt.
              De uitleg staat er omdat een lege achtergrond anders niet vertelt
              dat er iets kan -- en neerleggen zet de plaat meteen aan. */}
          {indeling === 'uit' && (
            <div className="flex-1 min-h-0 flex p-3">
              <SleepVlak onBestand={neemBestandAan} />
            </div>
          )}
          {indeling !== 'uit' && (
          <div id="axe-split-container"
            className={`flex-1 min-h-0 flex ${opPlaat ? 'gap-3 p-3' : ''} ${indeling === 'rijen' ? 'flex-col' : 'flex-row'}`}>
            <div className={opPlaat ? 'axe-codeplaat axe-dekkend' : undefined} style={{
              flex: gesplitst ? `0 0 calc(${splitRatio * 100}% - ${opPlaat ? 12 : 0}px)` : 1,
              minWidth: 0, minHeight: 0, display: 'flex',
            }}>
              <EditorPane tab={activeTab} activePendingPatch={activePendingPatch} isMobile={isMobile}
                onChange={updateContent}
                onAcceptPatch={(mi, id) => { void acceptPatch(mi, id); }}
                onRejectPatch={rejectPatch}
                focused={focusedPane === 'main'} onFocus={() => setFocusedPane('main')}
                onBestand={neemBestandAan} />
            </div>
            {gesplitst && (
              <>
                <SplitResizeHandle
                  orientation={indeling === 'kolommen' ? 'vertical' : 'horizontal'}
                  onRatioChange={setSplitRatio}
                />
                <div className={opPlaat ? 'axe-codeplaat axe-dekkend' : undefined}
                  style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
                  <EditorPane tab={splitTab} activePendingPatch={null} isMobile={isMobile}
                    onChange={updateContent}
                    onAcceptPatch={(mi, id) => { void acceptPatch(mi, id); }}
                    onRejectPatch={rejectPatch}
                    focused={focusedPane === 'split'} onFocus={() => setFocusedPane('split')}
                    onBestand={neemBestandAan} />
                </div>
              </>
            )}
          </div>
          )}

          {/* De terminal was een strook van 200px onder de editor. Die at de
              hoogte op waar je juist code wilt zien, en verdween achter de
              chatplaat zodra de plaat aanstond. Nu een zwevend paneel links,
              over de volle hoogte: de editor houdt zijn ruimte, en de terminal
              staat waar je hem verwacht. */}
          {/* Het terminal-paneel staat ALTIJD, ook als de terminal zelf uit is.

              De weergaveknoppen (Preview / Agent / Terminal) horen hier volgens
              jouw indeling, en dan mag het paneel niet met de terminal mee
              verdwijnen -- anders zet je de terminal uit en is de knop weg
              waarmee je hem weer aan zet. De knoppen zitten dus in de kop, en de
              terminal zelf is wat eronder staat of niet. */}
          <PlaatPanel
            side="left"
            title="Terminal"
            fill
            actions={
              <>
                <button onClick={() => setShowPreview(v => !v)} data-actief={showPreview ? 'ja' : undefined} title="Voorbeeld"><Eye size={11} /> Preview</button>
                <button onClick={() => setShowAgent(v => !v)} data-actief={showAgent ? 'ja' : undefined} title="Code agent"><Zap size={11} /> Agent</button>
                <button onClick={() => setShowTerminal(v => !v)} data-actief={showTerminal ? 'ja' : undefined} title="Terminal"><Terminal size={11} /> Terminal</button>
                <span className="axe-paneel-scheiding" aria-hidden="true" />
                {/* Hoe het scherm verdeeld is. Ze staan bij Preview, Agent en
                    Terminal omdat het dezelfde soort knop is: wat ligt er op de
                    achtergrond. Nog een keer op de actieve drukken haalt de
                    plaat weer weg. */}
                <button onClick={() => kiesIndeling('enkel')} data-actief={indeling === 'enkel' ? 'ja' : undefined} title="Een plaat"><Square size={11} /></button>
                <button onClick={() => kiesIndeling('kolommen')} data-actief={indeling === 'kolommen' ? 'ja' : undefined} title="Twee naast elkaar"><Columns2 size={11} /></button>
                <button onClick={() => kiesIndeling('rijen')} data-actief={indeling === 'rijen' ? 'ja' : undefined} title="Twee boven elkaar"><Rows2 size={11} /></button>
                <span className="axe-paneel-scheiding" aria-hidden="true" />
                <button onClick={() => void addFile()} title="Nieuw bestand">Nieuw</button>
                <button onClick={() => void addFolder()} title="Nieuwe map">Map</button>
                <button onClick={() => void saveActiveFile()} title="Opslaan">{saving ? 'Bezig' : 'Opslaan'}</button>
                <span className="axe-paneel-scheiding" aria-hidden="true" />
                <button onClick={() => termRef.current?.clear()} title="Leegmaken"><Trash2 size={11} /></button>
              </>
            }
          >
            {showTerminal
              ? <XtermTerminal ref={termRef} style={{ height: '100%' }} />
              : <div className="text-[10px] pt-2" style={{ color: 'var(--text-muted)' }}>Terminal staat uit</div>}
          </PlaatPanel>
        </div>

        <AnimatePresence>
          {showAgent && (
            /* De agent-chat was een kolom van 300px die de editor smaller
               maakte zodra je hem opende. Nu een zwevend paneel rechts: de
               editor houdt zijn volle breedte, en de chat ligt op de plaat
               naast de gewone AXE-chat onderin -- daar praat je met AXE, hier
               met de agent die in deze map werkt. */
            <PlaatPanel
              side="right"
              title="Code agent"
              fill
              /* Alles wat de agent te kiezen heeft staat in de bovenrand, net
                 als bij de chatplaat van AXE: welke motor, of hij zelfstandig
                 mag werken, welk bestand hij als context heeft. Geen gekleurde
                 blokjes -- de letter zelf kleurt cyaan als hij aan staat, en
                 een haarstreepje scheidt de groepen. Een pil met een rand en
                 een vulling is een knop uit een andere app. */
              actions={
                <>
                  <button onClick={() => setAgentEngine('native')} data-actief={agentEngine === 'native' ? 'ja' : undefined} title="AXE Native">AXE Native</button>
                  <button onClick={() => setAgentEngine('openhands')} data-actief={agentEngine === 'openhands' ? 'ja' : undefined} title="OpenHands">OpenHands</button>
                  {agentEngine === 'native' && (
                    <>
                      <span className="axe-paneel-scheiding" aria-hidden="true" />
                      <button onClick={() => setAgentMode(m => !m)} data-actief={agentMode ? 'ja' : undefined} title="Agent mode">Agent mode</button>
                    </>
                  )}
                  {agentBusy && agentMode && agentEngine === 'native' && (
                    <button onClick={stopAgentLoop} data-stop="ja" title="Stoppen">Stop</button>
                  )}
                  {activeTab && (
                    <>
                      <span className="axe-paneel-scheiding" aria-hidden="true" />
                      <span className="axe-paneel-context" title={activeTab.path}>{activeTab.name}</span>
                    </>
                  )}
                  <span className="axe-paneel-scheiding" aria-hidden="true" />
                  <button onClick={() => setAgentMessages([])} title="Gesprek leegmaken"><Trash2 size={11} /></button>
                </>
              }
              composer={
                <>
                  {/* Dezelfde iconen als in de AXE-composer. Het is hetzelfde
                      gebaar op dezelfde regel; twee verschillende invoerbalken
                      naast elkaar dwingen je elke keer opnieuw te kijken welke
                      welke is. */}
                  <span className="axe-composer-vonk" aria-hidden="true" />
                  <button type="button" onClick={() => agentBestandRef.current?.click()} title="Bijlage"><Paperclip size={16} /></button>
                  <button type="button" onClick={() => setAgentEngine(e => e === 'native' ? 'openhands' : 'native')} data-actief={agentEngine === 'openhands' ? 'ja' : undefined} title="Motor wisselen"><Volume2 size={16} /></button>
                  <input ref={agentBestandRef} type="file" className="hidden" multiple
                    onChange={e => { const f = e.target.files?.[0]; if (f) setAgentInput(v => `${v}${v ? ' ' : ''}${f.name}`); }} />
                  <textarea value={agentInput} onChange={e => setAgentInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAgentSubmit(); } }}
                    placeholder="Beschrijf een wijziging" rows={1}
                    className="text-[13px] outline-none" />
                  <button onClick={() => void handleAgentSubmit()} disabled={agentBusy || !agentInput.trim()}
                    className="disabled:opacity-40" title="Versturen">
                    <Send size={14} />
                  </button>
                </>
              }
            >
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

            </PlaatPanel>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPreview && <PreviewPanel isMobile={isMobile} onClose={() => setShowPreview(false)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
