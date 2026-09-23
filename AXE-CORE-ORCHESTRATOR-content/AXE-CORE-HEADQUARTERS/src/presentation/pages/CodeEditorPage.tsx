/**
 * CodeEditorPage.tsx — AXE Code Studio
 * Drie standen (Code / Canvas / Preview), terminal onder de editor,
 * code-agent via de AXE-composer. Monaco, echte xterm, echte motoren.
 */

import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { PlaatRail, PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { IcoonZuil, type ZuilItem } from '@/presentation/components/layout/IcoonZuil';
import { useCodeAgentKop } from '@/presentation/store/codeAgentKopStore';
import { codeSnelacties } from '@/domain/codeSnelacties';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Braces, Check, ChevronRight, Code2, Columns2, Command, Cpu, Hand, LayoutGrid, MonitorSmartphone, MousePointerClick, PanelRight, Sparkle, Sparkles, FileCode, FilePlus, Files, Folder, FolderOpen, GitBranch, Layers, Monitor, MousePointer2, Play, RefreshCw, Save, Search, Send, Smartphone, Tablet, Terminal, Trash2, X, Zap } from 'lucide-react';
import { useVoiceStore, type KeySlot } from '@/presentation/store/voiceStore';
import { Sheet, SheetContent, SheetTrigger } from '@/presentation/components/ui/sheet';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { XtermTerminal, type XtermHandle } from '@/presentation/components/axe-core/XtermTerminal';
import { hostVanDeEditor, type TerminalHost } from '@/domain/terminalHosts';
import { AGENT_LABEL, HOOFD_AGENTS, type MotorToewijzing } from '@/domain/agentMotoren';
import { leesToewijzing, kiesMotor } from '@/infrastructure/persistence/agentMotorenOpslag';
import {
  listWorkspaceDirectory, readWorkspaceFile, writeWorkspaceFile,
  createWorkspaceEntry, deleteWorkspaceEntry, searchWorkspace,
  moveWorkspaceEntry, editorBasis, zetEditorRepo,
  type SearchResult,
} from '@/infrastructure/persistence/workspaceFilesService';
import { runLocalAgent, runAgentLoop, applyPatch, type FilePatch, type AgentTurn } from '@/application/agents/localCodeAgent';
import { apiExecuteOpenHands, claudeRun, claudeRepos, type ClaudeRepoInfo } from '@/infrastructure/gateways/axeCoreApiService';
import { openLeerbeurt, metGeheugen, sluitLeerbeurt } from '@/application/agents/abonnementLeerlus';
import { classifyCodeTaskComplexity } from '@/domain/codeTaskComplexity';
import {
  agentHostVoorkeur, zetAgentHostVoorkeur, agentHostStand,
  LOKALE_AGENT_ORIGIN, type AgentHostVoorkeur,
} from '@/infrastructure/config/agentHost';
import { AgentCommitBalk } from '@/presentation/components/axe-core/AgentCommitBalk';
import { AgentActivityTrace } from '@/presentation/components/axe-core/AgentActivityTrace';
import { PreviewPanel } from '@/presentation/components/axe-core/PreviewPanel';
import { designAgentBridge } from '@/presentation/components/axe-core/designAgentBridge';
import {
  LiveGitPanel, SplitResizeHandle,
  setDragFilePath, getDragFilePath,
} from '@/presentation/components/axe-core/CodeStudioExtras';
import { toast } from '@/presentation/components/shared/toast';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { meldActiviteit } from '@/shared/axeActiviteit';

/**
 * De drie motoren waar dit paneel een taak aan kan geven, met dezelfde namen
 * als de takken van de orchestrator: 'native' is de lus in de app zelf (op de
 * ingestelde LLM-slots), 'openhands' de agent in zijn sandbox op de VPS, en
 * 'claude' de echte Claude Code CLI in een checkout die op de whitelist staat
 * van de host waar axe_api draait (Branch C — zie
 * backend/axe_api/CLAUDE_CODE_SETUP.md).
 *
 * Een lijst en niet alleen een union, zodat de opgeslagen waarde eraan getoetst
 * kan worden: de oude toggle schreef dezelfde sleutel, en een waarde die we
 * niet kennen hoort terug te vallen in plaats van een picker te tonen waarin
 * niets aan staat. */
const AGENT_ENGINES = ['native', 'openhands', 'claude', 'claude2', 'claude3', 'claude4', 'codex', 'codex2', 'codex3', 'cursor'] as const;
type AgentEngine = (typeof AGENT_ENGINES)[number];
type CliMotor = Exclude<AgentEngine, 'native' | 'openhands'>;

/**
 * De motoren die een échte CLI in een checkout zijn, op een abonnement.
 *
 * Ze delen alles behalve hun naam: dezelfde repo-whitelist, dezelfde
 * branchbescherming, dezelfde weigering om met een API-sleutel te draaien —
 * zie backend/axe_api/agent_runner.py. Daarom staan ze hier als set en niet als
 * twee losse takken in elke `if`; een derde erbij is dan één regel.
 */

const CLI_MOTOREN = new Set<AgentEngine>(['claude', 'claude2', 'claude3', 'claude4', 'codex', 'codex2', 'codex3', 'cursor']);
const MOTOR_LABEL: Record<string, string> = { claude: 'Claude Code', claude2: 'Claude 2', claude3: 'Claude 3', claude4: 'Claude 4', codex: 'Codex', codex2: 'Codex 2', codex3: 'Codex 3', cursor: 'Cursor' };

/** De knoppen in de motorkiezer, in de volgorde waarin ze op het scherm staan. */
const CLI_MOTOR_KNOPPEN: ReadonlyArray<{ id: AgentEngine; uitleg: string }> = [
  { id: 'claude', uitleg: 'Claude Code — de echte CLI in een gewhiteliste checkout, op je Anthropic-abonnement' },
  { id: 'claude2', uitleg: 'Claude Code op je tweede Claude-abonnement (eigen login in ~/.claude-tweede)' },
  { id: 'claude3', uitleg: 'Claude Code op je derde Claude-abonnement (eigen login in ~/.claude-derde)' },
  { id: 'claude4', uitleg: 'Claude Code op je vierde Claude-abonnement (eigen login in ~/.claude-vierde)' },
  { id: 'codex', uitleg: 'Codex — dezelfde opzet, op je ChatGPT-abonnement' },
  { id: 'codex2', uitleg: 'Codex op je tweede ChatGPT-abonnement (eigen login in ~/.codex-tweede)' },
  { id: 'codex3', uitleg: 'Codex op je derde ChatGPT-abonnement (eigen login in ~/.codex-derde)' },
  { id: 'cursor', uitleg: 'Cursor — dezelfde opzet, op je Cursor-abonnement' },
];

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
  /** Eén knop onder een 'status'-melding — nu alleen gebruikt om de
   *  gratis-voor-simpel-substitutie (zie classifyCodeTaskComplexity) in één
   *  klik terug te draaien naar het gepinde abonnement. */
  action?: { label: string; run: () => void };
}

type SidebarMode = 'files' | 'search' | 'git';
type StudioStand = 'code' | 'canvas' | 'preview';
type StudioDevice = 'phone' | 'tablet' | 'desktop';
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

function repoKleur(naam: string): string {
  const n = naam.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n.includes('axon')) return '#A78BFA';
  if (n.includes('companion')) return '#34D399';
  if (n.includes('trading')) return '#F5A524';
  if (n.includes('northsea')) return '#B87333';
  if (n.includes('axecore') || n.includes('axehq')) return '#22D3EE';
  return '#94A3B8';
}

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
        {patch.state === 'accepted' && <Check size={11} style={{ color: 'var(--success)' }} />}
        {patch.state === 'rejected' && <X size={11} style={{ color: '#6b7280' }} />}
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
            Accept
          </button>
          <button onClick={() => onReject(patch.id)}
            className="px-2 py-0.5 rounded text-[9px]"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            Reject
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
      <FolderOpen size={24} style={{ color: 'var(--accent-cyan)', opacity: actief ? 1 : 0.72 }} />
      <div className="text-[11px]" style={{ color: 'var(--accent-cyan)' }}>
        Drop a file here
      </div>
      <div className="text-[9px]" style={{ color: 'var(--accent-cyan)', opacity: 0.6 }}>
        or open one with ⌘P · ⌘K
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
  tab, activePendingPatch, isMobile, onChange, onAcceptPatch, onRejectPatch, focused, onFocus, onBestand, onSluit,
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
  /** De plaat wegdoen. Links boven in, want daar zit hij op elke plaat -- ook
   *  als er geen bestand open is en er dus geen kopregel met een naam staat. */
  onSluit: () => void;
}) {
  const opPlaat = useHeeftPlaat();
  const kruis = (
    <button onClick={e => { e.stopPropagation(); onSluit(); }} title="Close this pane"
      className="axe-plaatkruis" style={{ color: 'var(--accent-cyan)' }}>
      <X size={12} />
    </button>
  );
  if (!tab) {
    return (
      <div className="flex-1 flex min-h-0 relative" onClick={onFocus}>
        {kruis}
        <SleepVlak onBestand={onBestand} />
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0" onClick={onFocus}
      style={{ outline: focused ? '1px solid var(--tint-line)' : 'none' }}>
      <div className="flex items-center gap-1 px-3 py-1 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button onClick={e => { e.stopPropagation(); onSluit(); }} title="Close this pane"
          className="mr-1 rounded" style={{ color: 'var(--accent-cyan)' }}>
          <X size={11} />
        </button>
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
              style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' }}>Accept</button>
            <button onClick={() => onRejectPatch(activePendingPatch.msgIdx, activePendingPatch.patch.id)}
              className="px-2 py-0.5 rounded text-[9px]"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>Reject</button>
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
  const voice = useVoiceStore();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const activeTab = openTabs.find(t => t.path === activeTabPath) ?? null;

  const [indeling, setIndeling] = useState<Indeling>('enkel');
  const [studioStand, setStudioStand] = useState<StudioStand>('code');
  const [studioDevice, setStudioDevice] = useState<StudioDevice>('phone');
  const [showFiles, setShowFiles] = useState(true);
  const [designMode, setDesignMode] = useState(false);
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
  /* Wat je in de terminal-composer typt.
   *
   * De terminal neemt toetsen ook rechtstreeks aan als je erin klikt -- dat
   * blijft zo. Dit is er omdat de drie platen op één band liggen en de andere
   * twee een balk hebben waar je in typt: zonder die balk moet je bij de
   * terminal iets anders doen dan bij de rest, en dat is precies wat één
   * indeling moet voorkomen. */
  const [termInput, setTermInput] = useState('');
  const termRef = useRef<XtermHandle>(null);
  /* De agent hangt in de editor, niet naast de composer. Motoren in de balk;
     vragen via de AXE-composer. Het chatvak klapt open als je vraagt. */
  const [showAgent, setShowAgent] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
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
  // De abonnementen zijn verdeeld over de vijf tier-1 managers (Instellingen →
  // Motoren per agent). Het abonnement van AXE Developer komt daarvandaan;
  // Native en Hands zijn geen abonnement en blijven een keuze hier. Zie
  // domain/agentMotoren.ts.
  const [toewijzing, setToewijzing] = useState<MotorToewijzing>(() => leesToewijzing());
  useEffect(() => {
    const bij = () => setToewijzing(leesToewijzing());
    window.addEventListener('axe:agent-motoren', bij);
    window.addEventListener('storage', bij);
    return () => { window.removeEventListener('axe:agent-motoren', bij); window.removeEventListener('storage', bij); };
  }, []);
  const [agentEngine, setAgentEngineRauw] = useState<AgentEngine>(() => {
    const eigen = leesToewijzing()['developer'];
    if (eigen !== 'sleutels') return eigen;
    // Zonder abonnement: Native of Hands, zoals de vorige keer. Een opgeslagen
    // CLI telt niet meer -- die komt uit de toewijzing.
    const stored = localStorage.getItem('axe_code_agent_engine') as AgentEngine | null;
    return stored && AGENT_ENGINES.includes(stored) && !CLI_MOTOREN.has(stored) ? stored : 'native';
  });
  useEffect(() => { localStorage.setItem('axe_code_agent_engine', agentEngine); }, [agentEngine]);
  // Een CLI-knop is een toewijzing: wie een vrij abonnement kiest, geeft het aan
  // de Code Agent. Native of Hands kiezen geeft zijn abonnement weer vrij.
  const agentEngineRef = useRef(agentEngine);
  agentEngineRef.current = agentEngine;
  const setAgentEngine = useCallback((volgende: AgentEngine | ((huidig: AgentEngine) => AgentEngine)) => {
    const motor = typeof volgende === 'function' ? volgende(agentEngineRef.current) : volgende;
    setToewijzing(kiesMotor('developer', CLI_MOTOREN.has(motor) ? motor as CliMotor : 'sleutels'));
    setAgentEngineRauw(motor);
  }, []);
  // Verandert de verdeling elders (Instellingen, een ander venster), dan schuift
  // de motor hier mee -- anders draait de editor op een abonnement dat inmiddels
  // van een andere agent is.
  const eigenMotor = toewijzing['developer'];
  useEffect(() => {
    if (eigenMotor !== 'sleutels') setAgentEngineRauw(eigenMotor);
    else setAgentEngineRauw(huidig => (huidig === 'native' || huidig === 'openhands') ? huidig : 'native');
  }, [eigenMotor]);
  // Van welke andere agent dit abonnement is, of null als het vrij is.
  const eigenaarVan = (motor: string): string | null => {
    const ander = HOOFD_AGENTS.find(a => a !== 'developer' && toewijzing[a] === motor);
    return ander ? AGENT_LABEL[ander] : null;
  };

  // Branch C. The repo list comes from the host running axe_api — it is the
  // one that decides what may be touched (CLAUDE_CODE_REPOS), so asking it is
  // the only honest way to fill this picker. Never send a path: the endpoint
  // takes a whitelisted NAME, and a path in the body would be refused anyway.
  const [claudeRepoMap, setClaudeRepoMap] = useState<Record<string, ClaudeRepoInfo> | null>(null);
  const [claudeReposError, setClaudeReposError] = useState<string | null>(null);
  // Welke CLI's op de gekozen host staan. Zonder dit zagen de drie motorknoppen
  // er identiek uit, ook als het commando er niet was -- je koos er een, wachtte
  // op een heenreis naar de host, en kreeg pas dán te horen dat hij niet
  // geïnstalleerd is. Aanwezigheid is hier bekend vóór je klikt, dus hoort het
  // op de knop te staan.
  const [motoren, setMotoren] = useState<Record<string, { label: string; aanwezig: boolean; login: string }> | null>(null);
  const [claudeRepo, setClaudeRepo] = useState<string>(() => localStorage.getItem('axe_code_claude_repo') ?? '');
  // Stijgt na elke geslaagde CLI-run, zodat de commitbalk zichzelf ververst.
  // Handmatig moeten verversen om te zien of de agent iets deed, leest als
  // "er is niets gebeurd".
  const [runTeller, setRunTeller] = useState(0);
  const [hostVoorkeur, setHostVoorkeur] = useState<AgentHostVoorkeur>(() => agentHostVoorkeur());
  // Welke host de repo-lijst werkelijk beantwoordde. Pas ná die aanroep bekend,
  // dus als losse stand — anders toont het scherm een keuze in plaats van een
  // uitkomst, en dat is precies het verschil dat ertoe doet.
  const [hostStand, setHostStand] = useState<'lokaal' | 'vps' | null>(null);
  useEffect(() => { if (claudeRepo) localStorage.setItem('axe_code_claude_repo', claudeRepo); }, [claudeRepo]);

  useEffect(() => {
    // Ook zonder CLI-motor: de repo-lijst bepaalt ook in welke repo de
    // bestanden staan, en die heb je bij Native en Hands net zo goed nodig.
    let cancelled = false;
    setClaudeReposError(null);
    claudeRepos()
      .then(({ repos, engines }) => {
        if (cancelled) return;
        setClaudeRepoMap(repos);
        setMotoren(engines ?? null);
        setHostStand(agentHostStand());
        // Only auto-pick something that can actually run right now, so the
        // picker never shows a repo that the host would refuse on submit.
        // Een gekozen repo blijft staan zolang hij bestaat, ook op een beschermde
        // branch: bestanden bewerken mag daar, alleen een agent laten draaien
        // niet -- en dat zegt de host dan zelf bij het versturen.
        setClaudeRepo(prev => (prev && repos[prev]
          ? prev
          : Object.keys(repos).find(n => repos[n]?.runnable) ?? ''));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setClaudeRepoMap(null);
        setMotoren(null);
        setHostStand(agentHostStand());
        setClaudeReposError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
    // hostVoorkeur hoort erbij: een andere host heeft een andere whitelist en
    // andere branches. De lijst laten staan zou repo's tonen die op de nieuwe
    // host niet bestaan.
  }, [agentEngine, hostVoorkeur]);

  const claudeRepoInfo = claudeRepo ? claudeRepoMap?.[claudeRepo] : undefined;

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
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const isMobile = useIsMobile();

  const reloadTree = useCallback(async () => {
    zetEditorRepo(claudeRepo);
    try {
      const nodes = await listWorkspaceDirectory('');
      setFileTree(nodes.map(n => ({ ...n, expanded: false, loaded: n.type === 'file' })));
      setRootError(null);
    } catch (err) {
      setRootError(err instanceof Error ? err.message : 'Failed to load project files');
    }
  }, [claudeRepo]);

  // Herladen bij een andere hostkeuze: de boom hoort bij de machine waar de
  // agent werkt, en die kan net veranderd zijn.
  useEffect(() => {
    void (async () => {
      try {
        await reloadTree();
      } finally { setRootLoading(false); }
    })();
  }, [reloadTree, hostVoorkeur]);

  /**
   * De machine van het terminalvak onder de editor.
   *
   * Dezelfde uitkomst als de bestandsboom en de code-agent -- editorBasis() is
   * agentBasis(), dus bestanden, agent en shell staan op dezelfde machine.
   * Eerder volgde het vak het algemene API-adres, en dat is in de verpakte app
   * altijd de VPS: bestanden en shell op de VPS, de agent op deze Mac.
   */
  const [editorHost, setEditorHost] = useState<TerminalHost | null>(null);
  useEffect(() => {
    let weg = false;
    void editorBasis().then(basis => { if (!weg) setEditorHost(hostVanDeEditor(basis)); });
    return () => { weg = true; };
  }, [hostVoorkeur]);

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
    if (f.size > 2_000_000) { toast(`${f.name} is too large to open in the editor`); return; }
    let inhoud: string;
    try { inhoud = await f.text(); } catch { toast(`${f.name} could not be read`); return; }

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

  const stuurTerminal = useCallback(() => {
    const cmd = termInput.trim();
    if (!cmd) return;
    /* Staat de terminal uit, dan zet versturen hem aan -- anders typ je een
       commando en gebeurt er zichtbaar niets. */
    setShowTerminal(true);
    setTimeout(() => termRef.current?.send(cmd + '\n'), showTerminal ? 0 : 120);
    setTermInput('');
  }, [termInput, showTerminal]);

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

  const handleAgentSubmit = useCallback(async (overrideInstruction?: string, negeerClassificatie = false) => {
    const instruction = (overrideInstruction ?? agentInput).trim();
    if (!instruction || agentBusy) return;
    setAgentInput('');
    setAgentBusy(true);
    setAgentMessages(prev => [...prev, { role: 'user', text: instruction }]);

    // Simpele taken op een gepind abonnement: OpenHands is gratis en is voor
    // een typo, hernoem of ander klein ding vaak genoeg. Nooit stilzwijgend
    // -- de melding hieronder zegt wat er gebeurde, met één knop om het
    // abonnement alsnog te forceren voor precies déze beurt (negeerClassificatie
    // laat het bij een herhaalde aanroep niet weer omslaan naar OpenHands).
    // Zie domain/codeTaskComplexity.ts voor waarom dit conservatief is.
    let werkelijkeEngine = agentEngine;
    if (!negeerClassificatie && CLI_MOTOREN.has(agentEngine) && classifyCodeTaskComplexity(instruction) === 'simple') {
      werkelijkeEngine = 'openhands';
      const motorLabel = MOTOR_LABEL[agentEngine] ?? agentEngine;
      setAgentMessages(prev => [...prev, {
        role: 'status',
        text: `Dit lijkt een simpele taak — OpenHands gebruikt (gratis) in plaats van ${motorLabel}.`,
        action: { label: `Toch ${motorLabel} gebruiken`, run: () => { void handleAgentSubmit(instruction, true); } },
      }]);
    }

    meldActiviteit({
      doelen: ['editor', '/code-editor'],
      label: `${werkelijkeEngine === 'native' ? 'AXE Native' : werkelijkeEngine === 'openhands' ? 'OpenHands' : MOTOR_LABEL[werkelijkeEngine] ?? werkelijkeEngine} werkt in ${claudeRepo || 'de repo'}: ${instruction.slice(0, 48)}`,
    });

    if (werkelijkeEngine === 'openhands') {
      setAgentMessages(prev => [...prev, { role: 'status', text: 'Sending task to OpenHands…' }]);
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

    if (CLI_MOTOREN.has(werkelijkeEngine)) {
      const motorLabel = MOTOR_LABEL[werkelijkeEngine] ?? werkelijkeEngine;
      if (!claudeRepo) {
        setAgentMessages(prev => [...prev, {
          role: 'agent',
          text: claudeReposError
            ? `Could not reach the host's repo list: ${claudeReposError}`
            : `No repository selected. The host running axe_api decides which repos ${motorLabel} may touch (AGENT_REPOS) — if this list is empty, nothing is whitelisted, or every checkout is on a protected branch.`,
          patches: [],
        }]);
        setAgentBusy(false);
        return;
      }
      const target = claudeRepoMap?.[claudeRepo];
      setAgentMessages(prev => [...prev, {
        role: 'status',
        text: `${motorLabel} in ${claudeRepo}${target?.branch ? ` on ${target.branch}` : ''}…`,
      }]);
      try {
        // The active file is context, not an instruction: Claude Code reads the
        // checkout itself, so pasting the whole file would just duplicate what
        // it can already open — the path is the useful part.
        const opdracht = activeTab
          ? `${instruction}\n\n(The file currently open in the editor is ${activeTab.path}.)`
          : instruction;
        // Dezelfde leerlus als de chat: gedeeld geheugen mee, uitkomst terug.
        // Zie application/agents/abonnementLeerlus.ts.
        const leer = await openLeerbeurt(`${instruction} ${claudeRepo} ${activeTab?.path ?? ''}`, 'code-editor');
        const prompt = metGeheugen(opdracht, leer);
        const res = await claudeRun({ repo: claudeRepo, prompt, permission_mode: 'acceptEdits', engine: werkelijkeEngine as CliMotor });
        // A refusal comes back as HTTP 200 with status 'error' — reading the
        // body is the only way to tell a guarded refusal from a finished run.
        const text = res.status === 'ok'
          ? (res.result || '(no output)')
          : `Claude Code did not run: ${res.error || res.result || 'unknown error'}`;
        setAgentMessages(prev => [...prev.slice(0, -1), {
          role: 'agent',
          text: res.branch ? `${text}\n\n— ${res.repo} @ ${res.branch}` : text,
          patches: [],
        }]);
        if (res.status === 'ok') setRunTeller(n => n + 1);
        sluitLeerbeurt(leer, res.status === 'ok', {
          wie: `Code Agent · ${motorLabel} · ${claudeRepo}`, opdracht: instruction, uitkomst: text,
          metadata: { repo: claudeRepo, branch: res.branch, motor: werkelijkeEngine },
        });
        // It edited files on disk directly, so what is open here is now stale.
        if (res.status === 'ok' && activeTab) {
          void readWorkspaceFile(activeTab.path)
            .then(content => setOpenTabs(prevTabs => prevTabs.map(t =>
              t.path === activeTab.path ? { ...t, content, savedContent: content } : t)))
            .catch(() => {/* the file may live outside the workspace mount */});
        }
      } catch (err) {
        setAgentMessages(prev => [...prev.slice(0, -1), {
          role: 'agent',
          text: `Claude Code error: ${err instanceof Error ? err.message : String(err)}`,
          patches: [],
        }]);
      }
      setAgentBusy(false);
      return;
    }

    if (agentMode) {
      const controller = new AbortController();
      agentAbortRef.current = controller;
      setAgentMessages(prev => [...prev, { role: 'status', text: 'Gathering context…' }]);
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
              return [...withoutStatus, { role: 'plan' as const, text: '', planSteps: steps }, { role: 'status' as const, text: 'Thinking…' }];
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
              if (!turn.done) next.push({ role: 'status', text: turn.ranCommand ? '🔁 Reacting…' : 'Thinking…' });
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

    setAgentMessages(prev => [...prev, { role: 'status', text: 'Gathering context…' }]);
    const result = await runLocalAgent(
      instruction,
      activeTab ? { path: activeTab.path, content: activeTab.content } : null,
      getSlots(),
      (msg) => setAgentMessages(prev => [...prev.slice(0, -1), { role: 'status', text: msg }]),
    );
    const patches: PatchWithState[] = result.patches.map(p => ({ ...p, id: uid(), state: 'pending' }));
    setAgentMessages(prev => [...prev.slice(0, -1), { role: 'agent', text: result.message, patches, filesRead: result.filesRead }]);
    setAgentBusy(false);
  }, [agentInput, agentBusy, activeTab, agentMode, agentEngine, voice, claudeRepo, claudeRepoMap, claudeReposError]);

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
    meldActiviteit({ doelen: ['editor', '/code-editor'], label: `past ${patch.file.split('/').pop()} aan`, kleur: '#34d399' });
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

  const focusComposer = useCallback(() => {
    setShowAgent(true);
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.axe-composer input')?.focus();
    });
  }, []);

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
      { id: 'stand-code', label: 'Stand: Code', category: 'command', run: () => setStudioStand('code') },
      { id: 'stand-canvas', label: 'Stand: Canvas', category: 'command', run: () => setStudioStand('canvas') },
      { id: 'stand-preview', label: 'Stand: Preview', category: 'command', run: () => setStudioStand('preview') },
      { id: 'ask-agent', label: 'Ask code agent', hint: 'composer', category: 'command', run: () => focusComposer() },
      { id: 'plaat-een', label: 'One pane', category: 'command', run: () => kiesIndeling('enkel') },
      { id: 'plaat-kolommen', label: 'Two panes side by side', category: 'command', run: () => kiesIndeling('kolommen') },
      { id: 'plaat-rijen', label: 'Two panes stacked', category: 'command', run: () => kiesIndeling('rijen') },
      { id: 'plaat-uit', label: 'No pane — just the background', category: 'command', run: () => kiesIndeling('uit') },
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
  }, [allFiles, paletteQuery, paletteMode, saveActiveFile, addFile, addFolder, kiesIndeling, sendGit, runFile, openFile, focusComposer]);

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

  const treeProps = {
    selectedPath: activeTabPath,
    onSelect: (p: string) => { void openFile(p); },
    onToggleFolder: (p: string) => { void toggleFolder(p); },
    onDelete: (p: string) => { void deleteNode(p); },
    onMove: (from: string, to: string) => { void moveNode(from, to); },
  };

  /* Een andere repo kiezen. Open tabs horen bij de vorige repo: hun paden
     zouden in de nieuwe repo naar een ander (of geen) bestand wijzen, en
     opslaan zou dan in de verkeerde boom schrijven. Daarom eerst opslaan. */
  const kiesRepo = (naam: string) => {
    if (naam === claudeRepo) return;
    if (openTabs.some(t => t.content !== t.savedContent)) {
      toast.error('Sla eerst je open wijzigingen op — ze horen bij de vorige repo.');
      return;
    }
    setOpenTabs([]);
    setActiveTabPath(null);
    setSplitTabPath(null);
    setClaudeRepo(naam);
  };

  const laatsteAgent = [...agentMessages].reverse().find(m => m.role === 'agent' || m.role === 'status' || m.role === 'plan');
  const agentSpoorTekst = agentBusy
    ? 'Agent working…'
    : laatsteAgent?.role === 'plan'
      ? (laatsteAgent.planSteps?.[0] ?? 'Plan')
      : (laatsteAgent?.text ?? '').split('\n')[0] || '';

  const zetKop = useCodeAgentKop(st => st.zet);
  const motorNaam = agentEngine === 'native' ? 'AXE Native' : agentEngine === 'openhands' ? 'OpenHands' : MOTOR_LABEL[agentEngine] ?? agentEngine;
  const kopSnelacties = useMemo(
    () => codeSnelacties({ repo: claudeRepo, bestand: activeTab?.path ?? null, patchOpen: Boolean(activePendingPatch) }),
    [claudeRepo, activeTab?.path, activePendingPatch],
  );
  useEffect(() => {
    zetKop({ motor: motorNaam, repo: claudeRepo, branch: claudeRepoInfo?.branch ?? undefined, spoor: agentSpoorTekst, snelacties: kopSnelacties });
  }, [zetKop, motorNaam, claudeRepo, claudeRepoInfo?.branch, agentSpoorTekst, kopSnelacties]);
  useEffect(() => () => zetKop(null), [zetKop]);

  /* Links van de composer: wat je ziet en welke panelen er openstaan. Rechts:
     wie het werk doet. Zelfde bouwsteen en plek als de tabs op trading, zodat
     deze tab geen eigen balk bovenin nodig heeft. */
  const weergaveItems: ZuilItem[] = [
    { id: 'code', label: 'Code', icoon: <Code2 size={17} />, kleur: '#22D3EE', aan: studioStand === 'code' },
    { id: 'canvas', label: 'Canvas', icoon: <LayoutGrid size={17} />, kleur: '#A78BFA', aan: studioStand === 'canvas' },
    { id: 'preview', label: 'Preview · alle toestellen', icoon: <MonitorSmartphone size={17} />, kleur: '#F5A524', aan: studioStand === 'preview' },
    { id: 'files', label: 'Bestanden', icoon: <FolderOpen size={17} />, kleur: '#22D3EE', aan: showFiles },
    { id: 'term', label: 'Terminal', icoon: <Terminal size={17} />, kleur: '#34D399', aan: showTerminal },
    { id: 'paneel', label: 'Preview-paneel', icoon: <PanelRight size={17} />, kleur: '#F5A524', aan: showPreview },
    { id: 'design', label: 'Design mode', icoon: <MousePointer2 size={17} />, kleur: '#A78BFA', aan: designMode },
    { id: 'run', label: 'Run actief bestand', icoon: <Play size={17} />, kleur: '#34D399', aan: false, uit: !activeTab },
    { id: 'palet', label: 'Commando’s  ⌘K', icoon: <Command size={17} />, kleur: '#E5E7EB', aan: false },
  ];
  const kiesWeergave = (id: string) => {
    if (id === 'code' || id === 'canvas' || id === 'preview') setStudioStand(id);
    else if (id === 'files') setShowFiles(v => !v);
    else if (id === 'term') setShowTerminal(v => !v);
    else if (id === 'paneel') setShowPreview(v => !v);
    else if (id === 'design') { setDesignMode(v => !v); setShowPreview(true); }
    else if (id === 'run') runFile();
    else if (id === 'palet') { setPaletteMode('all'); setPaletteOpen(true); }
  };
  const MOTOR_ICOON: Record<string, React.ReactNode> = {
    native: <Cpu size={17} />, openhands: <Hand size={17} />, claude: <Sparkle size={17} />,
    claude2: <Sparkles size={17} />, claude3: <Sparkles size={17} />, claude4: <Sparkles size={17} />,
    codex: <Braces size={17} />, codex2: <Braces size={17} />, codex3: <Braces size={17} />, cursor: <MousePointerClick size={17} />,
  };
  const MOTOR_KLEUR: Record<string, string> = {
    native: '#22D3EE', openhands: '#F5A524', claude: '#D97757', claude2: '#E8A488', claude3: '#F4C7B0', claude4: '#FADCD0',
    codex: '#E5E7EB', codex2: '#C7CACE', codex3: '#A9ADB3', cursor: '#8B7CF6',
  };
  const motorItems: ZuilItem[] = (['native', 'openhands', ...CLI_MOTOR_KNOPPEN.map(k => k.id)] as AgentEngine[]).map(id => {
    const cli = CLI_MOTOR_KNOPPEN.find(k => k.id === id);
    const m = motoren?.[id];
    const eigenaar = cli ? eigenaarVan(id) : null;
    const ontbreekt = cli && m ? !m.aanwezig : false;
    return {
      id,
      label: id === 'native' ? 'AXE Native' : id === 'openhands' ? 'OpenHands' : MOTOR_LABEL[id],
      icoon: MOTOR_ICOON[id],
      kleur: MOTOR_KLEUR[id],
      uit: Boolean(eigenaar),
      uitleg: eigenaar
        ? `${MOTOR_LABEL[id]} — hoort bij ${eigenaar}. Verdeel het anders in Instellingen → Motoren per agent.`
        : ontbreekt
          ? `${MOTOR_LABEL[id]} staat niet op deze host — installeer en log in met \`${m?.login ?? ''}\`.`
          : cli?.uitleg ?? (id === 'native' ? 'AXE Native — de lus in de app, op je API-sleutels' : 'OpenHands — de agent in zijn sandbox op de VPS'),
    };
  });

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

      {/* Studio: werkbalk + drie standen in tabruimte. Terminal onder de
          editor, niet in een PlaatSlot naast de composer. */}
      {!showFiles && (
        <PlaatRail title="Files">
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
              <div className="flex-1 overflow-y-auto py-1">
                {rootLoading && (
                  <div className="flex items-center gap-1.5 px-3 py-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    <RefreshCw size={9} className="animate-spin" /> Loading…
                  </div>
                )}
                {rootError && <div className="px-3 py-2 text-[9px]" style={{ color: 'var(--error)' }}>{rootError}</div>}
                {claudeRepoMap && Object.entries(claudeRepoMap).map(([naam, info]) => {
                        const actief = naam === claudeRepo;
                        const kleur = repoKleur(naam);
                        return (
                          <div key={naam} className="axe-code-repo-root">
                            <button
                              type="button"
                              className="axe-code-repo-root__button"
                              data-open={actief ? 'ja' : 'nee'}
                              onClick={() => kiesRepo(naam)}
                              title={`${naam} · ${info.branch || 'no branch'}`}
                              style={{ '--repo-color': kleur } as CSSProperties}
                            >
                              <ChevronRight size={10} />
                              <Folder size={12} />
                              <strong>{naam}</strong>
                              <span>{info.branch || '—'}</span>
                            </button>
                            {actief && (
                              <div className="axe-code-repo-root__tree">
                                {fileTree.map(n => <FileTreeItem key={n.path} node={n} depth={1} {...treeProps} />)}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
      )}

      <div
        className="axe-studio flex-1 min-h-0"
        data-stand={studioStand}
        data-toestel={studioDevice}
        data-files={showFiles ? 'aan' : 'uit'}
        data-preview={showPreview ? 'aan' : 'uit'}
        data-term={showTerminal ? 'aan' : 'uit'}
        data-ontwerp={designMode ? 'aan' : 'uit'}
      >
        {!isMobile && (
          <>
            <PlaatSlot slot="links">
              <IcoonZuil items={weergaveItems} actief={studioStand} kies={kiesWeergave} />
            </PlaatSlot>
            <PlaatSlot slot="rechts">
              <IcoonZuil items={motorItems} actief={agentEngine} kies={id => setAgentEngine(id as AgentEngine)} kant="rechts" />
            </PlaatSlot>
          </>
        )}
        {isMobile && (
          <div className="axe-studio-balk">
            <Sheet open={mobileFilesOpen} onOpenChange={setMobileFilesOpen}>
              <SheetTrigger asChild>
                <button type="button"><FolderOpen size={10} /> Files</button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[240px] p-0 overflow-hidden"
                style={{ background: '#050505', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="py-1 overflow-y-auto h-full">
                  {fileTree.map(node => <FileTreeItem key={node.path} node={node} depth={0} {...treeProps} />)}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}

        {studioStand === 'code' && (
          <div className="axe-studio-kolommen">
            {showFiles && (
              /* Een section en GEEN aside: axe-look.css maakt van elke aside in
                 de schil een verborgen zijlade (position: fixed, buiten beeld).
                 Als aside viel deze kolom uit het rooster, schoof de editor in
                 het 220px-vak van de bestanden en bleef rechts een lege kolom. */
              <section className="axe-studio-kaart axe-studio-bestanden" data-axe-doel="bestanden">
                <div className="axe-studio-kop">
                  <label className="axe-studio-repo" title="In welke repo je werkt — bestanden én code-agent">
                    <GitBranch size={11} />
                    <select value={claudeRepo} onChange={e => kiesRepo(e.target.value)} aria-label="Repo">
                      {!claudeRepoMap && <option value={claudeRepo}>{claudeRepo || 'workspace'}</option>}
                      {claudeRepoMap && Object.entries(claudeRepoMap).map(([naam, r]) => (
                        <option key={naam} value={naam}>{naam} · {r.branch}{r.runnable ? '' : ' (alleen bestanden)'}</option>
                      ))}
                    </select>
                  </label>
                  <span className="rechts">
                    <button type="button" onClick={() => void addFile()} title="New file"><FilePlus size={11} /></button>
                    <button type="button" onClick={() => void reloadTree()} title="Reload"><RefreshCw size={11} /></button>
                  </span>
                </div>
                <div className="axe-studio-boom">
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
                      {claudeRepoMap && Object.entries(claudeRepoMap).map(([naam, info]) => {
                        const actief = naam === claudeRepo;
                        const kleur = repoKleur(naam);
                        return (
                          <div key={naam} className="axe-code-repo-root">
                            <button
                              type="button"
                              className="axe-code-repo-root__button"
                              data-open={actief ? 'ja' : 'nee'}
                              onClick={() => kiesRepo(naam)}
                              title={`${naam} · ${info.branch || 'no branch'}`}
                              style={{ '--repo-color': kleur } as React.CSSProperties}
                            >
                              <ChevronRight size={10} />
                              <Folder size={12} />
                              <strong>{naam}</strong>
                              <span>{info.branch || '—'}</span>
                            </button>
                            {actief && (
                              <div className="axe-code-repo-root__tree">
                                {fileTree.map(n => <FileTreeItem key={n.path} node={n} depth={1} {...treeProps} />)}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                            placeholder="Search files · ⌘P"
                            className="flex-1 bg-transparent outline-none text-[10px]" style={{ color: 'rgba(255,255,255,0.8)' }} />
                          {searching && <RefreshCw size={8} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />}
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {searchResults.map((hit, i) => (
                          <div key={i} className="px-2 py-1 cursor-pointer"
                            onClick={() => void openFile(hit.file)}>
                            <div className="text-[9px] truncate" style={{ color: 'var(--accent-cyan)' }}>{hit.file}</div>
                            <div className="text-[8px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{hit.text.trim().slice(0, 48)}</div>
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
              </section>
            )}

            <section className="axe-studio-kaart axe-studio-editor" data-axe-doel="editor">
              <div className="axe-studio-tabs">
                {openTabs.map(tab => {
                  const isActive = tab.path === activeTabPath || tab.path === splitTabPath;
                  const dirty = tab.content !== tab.savedContent;
                  return (
                    <span key={tab.path} className="bestandtab" data-aan={isActive ? 'ja' : undefined} role="button" tabIndex={0}
                      title={tab.path}
                      onClick={() => {
                        if (focusedPane === 'split' && gesplitst) setSplitTabPath(tab.path);
                        else setActiveTabPath(tab.path);
                      }}>
                      <FileCode size={11} /> {tab.name}
                      {dirty && <i style={{ color: 'var(--warning)' }}>•</i>}
                      <button type="button" onClick={e => { e.stopPropagation(); void closeTab(tab.path); }}
                        style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 0 }}><X size={9} /></button>
                    </span>
                  );
                })}
                <span className="axe-studio-groei" />
                {(agentBusy || agentSpoorTekst) && (
                  <div className="axe-studio-spoor" title={agentSpoorTekst}>
                    <Zap size={11} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                    <span>{agentSpoorTekst || 'Code agent'}</span>
                  </div>
                )}
                <button type="button" title="Split" onClick={() => kiesIndeling(indeling === 'kolommen' ? 'enkel' : 'kolommen')}><Columns2 size={11} /></button>
                <button type="button" title="Save" onClick={() => void saveActiveFile()}>
                  {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                </button>
              </div>
              <div className="axe-studio-kruimel">
                {activeTab
                  ? activeTab.path.split('/').map((stuk, i, all) => (
                    <span key={i}>{i > 0 && <span> › </span>}{i === all.length - 1 ? <b>{stuk}</b> : stuk}</span>
                  ))
                  : <span>Drop a file or open with ⌘P</span>}
              </div>
              <div className="axe-studio-lijf">
                <div className="axe-studio-bron">
                  {indeling === 'uit' ? (
                    <SleepVlak onBestand={neemBestandAan} />
                  ) : (
                    /* Geen eigen plaat en geen marge per paneel meer: de editorkaart
                       van de studio IS de plaat. Een tweede kaart erbinnen gaf dubbele
                       randen en 12px rondom, en liet Monaco maar 236px van 285 over
                       (gemeten 13 sep op 1440x900). */
                    <div id="axe-split-container"
                      className={`flex-1 min-h-0 flex ${indeling === 'rijen' ? 'flex-col' : 'flex-row'}`}>
                      <div style={{
                        flex: gesplitst ? `0 0 ${splitRatio * 100}%` : 1,
                        minWidth: 0, minHeight: 0, display: 'flex',
                      }}>
                        <EditorPane tab={activeTab} activePendingPatch={activePendingPatch} isMobile={isMobile}
                          onChange={updateContent}
                          onAcceptPatch={(mi, id) => { void acceptPatch(mi, id); }}
                          onRejectPatch={rejectPatch}
                          focused={focusedPane === 'main'} onFocus={() => setFocusedPane('main')}
                          onBestand={neemBestandAan}
                          onSluit={() => kiesIndeling('uit')} />
                      </div>
                      {gesplitst && (
                        <>
                          <SplitResizeHandle
                            orientation={indeling === 'kolommen' ? 'vertical' : 'horizontal'}
                            onRatioChange={setSplitRatio}
                          />
                          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
                            <EditorPane tab={splitTab} activePendingPatch={null} isMobile={isMobile}
                              onChange={updateContent}
                              onAcceptPatch={(mi, id) => { void acceptPatch(mi, id); }}
                              onRejectPatch={rejectPatch}
                              focused={focusedPane === 'split'} onFocus={() => setFocusedPane('split')}
                              onBestand={neemBestandAan}
                              onSluit={() => kiesIndeling('enkel')} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {showAgent && (
                  <section className="axe-studio-agent">
                    <div className="axe-studio-kop">
                      <span>Code agent</span>
                      <span className="rechts">
                        {agentEngine === 'native' && (
                          <button type="button" data-aan={agentMode ? 'ja' : undefined} onClick={() => setAgentMode(m => !m)}>Agent mode</button>
                        )}
                        {agentBusy && agentMode && agentEngine === 'native' && (
                          <button type="button" onClick={stopAgentLoop}>Stop</button>
                        )}
                        <button type="button" onClick={() => setAgentMessages([])} title="Clear"><Trash2 size={11} /></button>
                        <button type="button" onClick={() => setShowAgent(false)} title="Hide"><X size={11} /></button>
                      </span>
                    </div>
                    {CLI_MOTOREN.has(agentEngine) && (
                      <div className="flex flex-wrap gap-1 px-2 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {claudeRepoMap === null ? (
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{claudeReposError ? 'host unreachable' : 'loading repos…'}</span>
                        ) : Object.keys(claudeRepoMap).length === 0 ? (
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>no repos whitelisted</span>
                        ) : (
                          <select value={claudeRepo} onChange={e => setClaudeRepo(e.target.value)}
                            className="bg-transparent outline-none text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            {claudeRepo === '' && <option value="">choose a repo…</option>}
                            {Object.entries(claudeRepoMap).map(([name, info]) => (
                              <option key={name} value={name} disabled={!info.runnable}>
                                {name}{info.branch ? ` — ${info.branch}` : ' — missing'}
                              </option>
                            ))}
                          </select>
                        )}
                        <select
                          value={hostVoorkeur}
                          onChange={e => {
                            const v = e.target.value as AgentHostVoorkeur;
                            setHostVoorkeur(v);
                            zetAgentHostVoorkeur(v);
                            setHostStand(null);
                          }}
                          title={`Waar de CLI draait. Lokaal is ${LOKALE_AGENT_ORIGIN}`}
                          className="bg-transparent outline-none text-[10px]"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <option value="auto">host: auto</option>
                          <option value="lokaal">host: deze Mac</option>
                          <option value="vps">host: VPS</option>
                        </select>
                        {hostVoorkeur === 'auto' && hostStand && (
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                            → {hostStand === 'lokaal' ? 'deze Mac' : 'VPS'}
                          </span>
                        )}
                        {claudeRepoInfo && !claudeRepoInfo.runnable && (
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>on a protected branch</span>
                        )}
                      </div>
                    )}
                    <AgentActivityTrace messages={agentMessages} busy={agentBusy}
                      onSelect={i => agentMessageRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
                    {CLI_MOTOREN.has(agentEngine) && claudeRepo && (
                      <div className="px-2 pt-2">
                        <AgentCommitBalk repo={claudeRepo} runTeller={runTeller} />
                      </div>
                    )}
                    <div ref={agentChatRef} className="flex-1 overflow-y-auto p-2 space-y-2">
                      {agentMessages.length === 0 && (
                        <div className="text-[9px] text-center py-6 space-y-1" style={{ color: 'var(--text-muted)' }}>
                          <Bot size={20} style={{ margin: '0 auto 6px', opacity: 0.3 }} />
                          <div>Ask in the AXE composer</div>
                        </div>
                      )}
                      {agentMessages.map((msg, i) => (
                        <div key={i} ref={el => { agentMessageRefs.current[i] = el; }}>
                          {msg.role === 'plan' && msg.planSteps && (
                            <ol className="px-2 py-1.5 space-y-1">
                              {msg.planSteps.map((step, si) => (
                                <li key={si} className="text-[10px]" style={{ color: 'rgba(255,255,255,0.65)' }}>{si + 1}. {step}</li>
                              ))}
                            </ol>
                          )}
                          {msg.role === 'status' && (
                            <div className="flex items-center gap-1.5 text-[9px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
                              {/* Een melding met een knop is een blijvende notitie
                                  (bijv. "simpele taak, OpenHands gebruikt"), geen
                                  "bezig"-regel die zo verdwijnt -- die krijgt dus
                                  geen draaiend icoon. */}
                              {!msg.action && <RefreshCw size={8} className="animate-spin flex-shrink-0" />}
                              <span>{msg.text}</span>
                              {msg.action && (
                                <button
                                  type="button"
                                  onClick={msg.action.run}
                                  className="rounded-full px-1.5 py-0.5"
                                  style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}
                                >
                                  {msg.action.label}
                                </button>
                              )}
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
                              <div className="text-[10px] leading-snug" style={{ color: 'rgba(165,243,252,0.85)' }}>{msg.text}</div>
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
                  </section>
                )}
              </div>
              <div className="axe-studio-term" data-axe-doel="terminal">
                <button type="button" className="axe-studio-termkop" onClick={() => setShowTerminal(v => !v)}
                  title={showTerminal ? 'Fold terminal' : 'Open terminal'}>
                  <span>Terminal</span>
                  {/* De NAAM van de machine, niet de belofte "this worktree".
                      Dat stond er, terwijl het vak zonder wsBasis op de VPS
                      uitkwam -- een label dat iets zegt wat niet zo was. */}
                  <span className="axe-studio-chip">{editorHost?.naam ?? '…'}</span>
                  <span className="rechts">{showTerminal ? 'Fold' : 'Terminal · zsh'}</span>
                </button>
                <div className="axe-studio-termbody">
                  {/* Expliciet dezelfde machine als waar de code-agent draait.
                      Zonder wsBasis valt XtermTerminal terug op de VPS -- zie
                      hostVanDeEditor() in domain/terminalHosts.ts. */}
                  {editorHost && <XtermTerminal key={editorHost.wsUrl} ref={termRef} wsBasis={editorHost.wsUrl} style={{ height: '100%' }} />}
                </div>
                <div className="axe-studio-termregel">
                  <input value={termInput} onChange={e => setTermInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); stuurTerminal(); } }}
                    placeholder="Run a command" spellCheck={false} aria-label="Run a command" />
                  <button type="button" onClick={stuurTerminal} disabled={!termInput.trim()} title="Run">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </section>

            {showPreview && (
              <section className="axe-studio-kaart">
                <div className="axe-studio-kop">
                  <span>Preview</span>
                  <span className="rechts">
                    <span className="axe-studio-toestellen">
                      <button type="button" data-aan={studioDevice === 'phone' ? 'ja' : undefined} title="iPhone 15 Pro" onClick={() => setStudioDevice('phone')}><Smartphone size={12} /></button>
                      <button type="button" data-aan={studioDevice === 'tablet' ? 'ja' : undefined} title="iPad Pro 11" onClick={() => setStudioDevice('tablet')}><Tablet size={12} /></button>
                      <button type="button" data-aan={studioDevice === 'desktop' ? 'ja' : undefined} title="Desktop" onClick={() => setStudioDevice('desktop')}><Monitor size={12} /></button>
                    </span>
                  </span>
                </div>
                <PreviewPanel
                  isMobile={isMobile}
                  embed
                  kader={studioDevice}
                  layout="podium"
                  designMode={designMode}
                  onDesignModeChange={setDesignMode}
                  onClose={() => setShowPreview(false)}
                />
              </section>
            )}
          </div>
        )}

        {studioStand === 'canvas' && (
          <div className="axe-studio-canvas">
            <section className="axe-studio-kaart">
              <div className="axe-studio-kop"><span>Layers</span></div>
              <div className="axe-studio-lagen">
                {flattenFiles(fileTree).slice(0, 24).map(n => (
                  <div key={n.path} className="r" data-aan={n.path === activeTabPath ? 'ja' : undefined}
                    onClick={() => { void openFile(n.path); }}>
                    <Layers size={11} /> {n.name}
                  </div>
                ))}
                {fileTree.length === 0 && <div className="r">No files yet</div>}
              </div>
            </section>
            <section className="axe-studio-kaart axe-studio-artboard">
              <div className="axe-studio-kop">
                <span>Canvas</span>
                <span className="axe-studio-chip">Artboard · {studioDevice}</span>
                <span className="rechts">
                  <span className="axe-studio-toestellen">
                    <button type="button" data-aan={studioDevice === 'phone' ? 'ja' : undefined} onClick={() => setStudioDevice('phone')}><Smartphone size={12} /></button>
                    <button type="button" data-aan={studioDevice === 'tablet' ? 'ja' : undefined} onClick={() => setStudioDevice('tablet')}><Tablet size={12} /></button>
                    <button type="button" data-aan={studioDevice === 'desktop' ? 'ja' : undefined} onClick={() => setStudioDevice('desktop')}><Monitor size={12} /></button>
                  </span>
                </span>
              </div>
              <div className="axe-studio-kader">
                <PreviewPanel
                  isMobile={isMobile}
                  embed
                  kader={studioDevice}
                  layout="raster"
                  designMode={designMode}
                  onDesignModeChange={setDesignMode}
                  onClose={() => setStudioStand('code')}
                />
              </div>
            </section>
            <section className="axe-studio-kaart">
              <div className="axe-studio-kop"><span>Inspect</span></div>
              <div className="p-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Design mode lives on the live preview. Apply writes the iframe; To agent sends a diff to the code agent.
              </div>
            </section>
          </div>
        )}

        {studioStand === 'preview' && (
          <div className="axe-studio-preview">
            <div className="axe-studio-kaart">
              <div className="axe-studio-kop">
                <span>Preview · this page on every device</span>
              </div>
              <PreviewPanel
                isMobile={isMobile}
                embed
                layout="devices"
                designMode={designMode}
                onDesignModeChange={setDesignMode}
                onClose={() => setStudioStand('code')}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
