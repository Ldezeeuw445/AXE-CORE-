/**
 * CodeStudioExtras.tsx — Zed/Cursor-like helpers for CodeEditorPage
 * - SplitResizeHandle: drag-to-resize editor splits
 * - LiveGitPanel: git status via VPS execCommand (porcelain)
 * - DnD helpers for file-tree moves
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GitBranch, GitCommit, RefreshCw, FileCode,
} from 'lucide-react';
import { execCommand } from '@/infrastructure/gateways/axeCoreApiService';

/* ─── Split resize handle ────────────────────────────────────────────────── */
export function SplitResizeHandle({
  orientation,
  onRatioChange,
}: {
  orientation: 'horizontal' | 'vertical';
  /** 0..1 fraction for the primary pane */
  onRatioChange: (ratio: number) => void;
}) {
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startRatio = useRef(0.5);
  const ratioRef = useRef(0.5);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startPos.current = orientation === 'vertical' ? e.clientX : e.clientY;
    startRatio.current = ratioRef.current;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const parent = document.getElementById('axe-split-container');
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const delta = orientation === 'vertical'
        ? (e.clientX - startPos.current) / rect.width
        : (e.clientY - startPos.current) / rect.height;
      const next = Math.min(0.85, Math.max(0.15, startRatio.current + delta));
      ratioRef.current = next;
      onRatioChange(next);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [orientation, onRatioChange]);

  return (
    <div
      onPointerDown={onPointerDown}
      className="flex-shrink-0 group relative"
      style={{
        width: orientation === 'vertical' ? 5 : '100%',
        height: orientation === 'horizontal' ? 5 : '100%',
        cursor: orientation === 'vertical' ? 'col-resize' : 'row-resize',
        background: 'var(--tint)',
      }}
      title="Drag to resize"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--tint-hi)' }}
      />
    </div>
  );
}

/* ─── Live Git panel ─────────────────────────────────────────────────────── */
export interface GitFileEntry {
  path: string;
  code: string; // XY porcelain codes
  staged: boolean;
  unstaged: boolean;
}

function parsePorcelain(stdout: string): { branch: string; entries: GitFileEntry[] } {
  const lines = stdout.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
  let branch = 'unknown';
  const entries: GitFileEntry[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      // ## main...origin/main [ahead 1]
      branch = line.slice(3).split('...')[0].trim() || 'unknown';
      continue;
    }
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    const path = line.slice(3).trim();
    if (!path) continue;
    entries.push({
      path: path.includes(' -> ') ? path.split(' -> ').pop()! : path,
      code,
      staged: code[0] !== ' ' && code[0] !== '?',
      unstaged: code[1] !== ' ' || code.startsWith('?'),
    });
  }
  return { branch, entries };
}

export function LiveGitPanel({
  onRunInTerminal,
}: {
  onRunInTerminal?: (cmd: string) => void;
}) {
  const [branch, setBranch] = useState('—');
  const [entries, setEntries] = useState<GitFileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [rawHint, setRawHint] = useState('Click Refresh for live status');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await execCommand('git status --porcelain=v1 -b', 20);
      if (r.exit_code !== 0 && !r.stdout) {
        setError(r.stderr || `git exit ${r.exit_code}`);
        setEntries([]);
        setRawHint(r.stderr || 'Not a git repo?');
      } else {
        const parsed = parsePorcelain(r.stdout || '');
        setBranch(parsed.branch);
        setEntries(parsed.entries);
        setRawHint(parsed.entries.length === 0 ? 'Clean working tree' : `${parsed.entries.length} change(s)`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (cmd: string, thenRefresh = true) => {
    setBusy(true);
    try {
      onRunInTerminal?.(cmd);
      await execCommand(cmd, 30);
      if (thenRefresh) await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stageAll = () => void run('git add -A');
  const unstageAll = () => void run('git reset HEAD');
  const commit = () => {
    const msg = commitMsg.trim();
    if (!msg) return;
    const safe = msg.replace(/'/g, `'"'"'`);
    void run(`git commit -m '${safe}'`).then(() => setCommitMsg(''));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-2 gap-2">
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--accent-cyan)' }}>
        <GitBranch size={11} />
        <span className="truncate flex-1">{branch}</span>
        <button onClick={() => void refresh()} className="p-0.5 rounded hover:brightness-125" title="Refresh">
          <RefreshCw size={10} className={busy ? 'animate-spin' : ''} style={{ color: 'rgba(255,255,255,0.45)' }} />
        </button>
      </div>

      <div className="text-[9px] rounded px-2 py-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
        {error ? <span style={{ color: 'var(--error)' }}>{error}</span> : rawHint}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
        {entries.map(e => (
          <div key={e.path} className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px]"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="font-mono w-5 flex-shrink-0" style={{
              color: e.code.includes('?') ? '#a78bfa' : e.staged ? 'var(--success)' : 'var(--warning)',
            }}>{e.code.replace(/ /g, '·')}</span>
            <FileCode size={9} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            <span className="truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{e.path}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        <button onClick={stageAll} className="px-2 py-1 rounded text-[9px] hover:brightness-125"
          style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
          Stage All
        </button>
        <button onClick={unstageAll} className="px-2 py-1 rounded text-[9px] hover:brightness-125"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          Unstage
        </button>
        <button onClick={() => void run('git diff', false)} className="px-2 py-1 rounded text-[9px] hover:brightness-125"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          Diff
        </button>
        <button onClick={() => void run('git log --oneline -12', false)} className="px-2 py-1 rounded text-[9px] hover:brightness-125"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          Log
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <GitCommit size={9} /> Commit
        </div>
        <input
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          className="w-full text-[10px] px-2 py-1 rounded outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        />
        <button
          disabled={!commitMsg.trim() || busy}
          onClick={commit}
          className="w-full px-2 py-1 rounded text-[9px] font-medium disabled:opacity-30"
          style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' }}
        >
          Commit
        </button>
      </div>

      <p className="text-[8px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.22)' }}>
        Live status via VPS exec. Stage / commit also echo to the terminal when open.
      </p>
    </div>
  );
}

/* ─── DnD data helper ────────────────────────────────────────────────────── */
export const AXE_DND_TYPE = 'application/x-axe-filepath';

export function setDragFilePath(e: React.DragEvent, path: string) {
  e.dataTransfer.setData(AXE_DND_TYPE, path);
  e.dataTransfer.setData('text/plain', path);
  e.dataTransfer.effectAllowed = 'move';
}

export function getDragFilePath(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(AXE_DND_TYPE) || e.dataTransfer.getData('text/plain') || null;
}
