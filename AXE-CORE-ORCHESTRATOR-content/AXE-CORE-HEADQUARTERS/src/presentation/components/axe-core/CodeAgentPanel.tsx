import { useState } from 'react';
import { Play, Copy, Check, Code2, Terminal, Bug, Wand2, FolderGit2, Loader2 } from 'lucide-react';
import { loadRepoConfigs, type RepoConfig } from '@/infrastructure/persistence/repoConfigService';
import { execCommand } from '@/infrastructure/gateways/axeCoreApiService';

interface CodeAction {
  id: string;
  label: string;
  icon: typeof Code2;
  prompt: string;
}

const CODE_ACTIONS: CodeAction[] = [
  { id: 'explain', label: 'Explain', icon: Code2, prompt: 'Explain this code in detail:' },
  { id: 'debug', label: 'Debug', icon: Bug, prompt: 'Find and fix bugs in this code:' },
  { id: 'optimize', label: 'Optimize', icon: Wand2, prompt: 'Optimize this code for performance:' },
  { id: 'test', label: 'Tests', icon: Terminal, prompt: 'Write unit tests for this code:' },
];

function workspaceFolderName(repo: RepoConfig): string {
  return repo.repo.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function cloneUrl(repo: RepoConfig): string {
  if (repo.token) {
    return `https://x-access-token:${repo.token}@github.com/${repo.owner}/${repo.repo}.git`;
  }
  return `https://github.com/${repo.owner}/${repo.repo}.git`;
}

export function CodeAgentPanel() {
  const [code, setCode] = useState('');
  const [action, setAction] = useState<string>('explain');
  const [copied, setCopied] = useState(false);
  const [cloneStatus, setCloneStatus] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const repos = loadRepoConfigs();

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAction = (actionId: string) => {
    setAction(actionId);
    const selected = CODE_ACTIONS.find(a => a.id === actionId);
    if (!selected || !code.trim()) return;
    const event = new CustomEvent('axe-code-action', {
      detail: { prompt: `${selected.prompt}\n\n\`\`\`\n${code}\n\`\`\`` },
    });
    window.dispatchEvent(event);
  };

  const openRepo = async (repo: RepoConfig) => {
    setCloningId(repo.id);
    setCloneStatus(`Cloning ${repo.label}…`);
    const folder = workspaceFolderName(repo);
    const url = cloneUrl(repo);
    // Clone if missing; otherwise fetch + checkout configured branch
    const cmd =
      `if [ -d "${folder}/.git" ]; then ` +
      `cd "${folder}" && git fetch origin && git checkout ${repo.branch} && git pull --ff-only origin ${repo.branch}; ` +
      `else ` +
      `git clone --branch ${repo.branch} --single-branch "${url}" "${folder}"; ` +
      `fi`;
    try {
      const result = await execCommand(cmd, 120);
      if (result.timed_out) {
        setCloneStatus(`${repo.label}: timeout`);
      } else if ((result.exit_code ?? 1) !== 0) {
        setCloneStatus(`${repo.label}: ${(result.stderr || result.stdout || 'failed').slice(0, 120)}`);
      } else {
        setCloneStatus(`✓ ${repo.label} → workspace/${folder} (${repo.branch})`);
        window.dispatchEvent(
          new CustomEvent('axe-workspace-open', { detail: { path: folder, repoId: repo.id } }),
        );
      }
    } catch (e) {
      setCloneStatus(`${repo.label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[8px] font-mono uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Open repo in workspace
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {repos.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={cloningId !== null}
            onClick={() => void openRepo(r)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium disabled:opacity-40"
            style={{
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.22)',
              color: '#67e8f9',
            }}
            title={`${r.owner}/${r.repo} @ ${r.branch}`}
          >
            {cloningId === r.id
              ? <Loader2 size={9} className="animate-spin" />
              : <FolderGit2 size={9} />}
            {r.label.replace(/^AXE\s+/i, '').slice(0, 12)}
          </button>
        ))}
      </div>
      {cloneStatus && (
        <div className="text-[8px] font-mono leading-snug" style={{ color: 'var(--text-muted)' }}>
          {cloneStatus}
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap mt-0.5">
        {CODE_ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              onClick={() => handleAction(a.id)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium"
              style={{
                background: action === a.id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${action === a.id ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: action === a.id ? '#10B981' : 'var(--text-muted)',
              }}
            >
              <Icon size={9} />{a.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={handleCopy} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
          {copied ? <Check size={9} style={{ color: 'var(--success)' }} /> : <Copy size={9} />}
        </button>
      </div>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Paste code here..."
        className="w-full text-[9px] px-2 py-1.5 rounded font-mono-data resize-none outline-none"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', minHeight: 48, maxHeight: 100 }}
        spellCheck={false}
      />
      <button
        onClick={() => handleAction(action)}
        disabled={!code.trim()}
        className="flex items-center justify-center gap-1 text-[9px] py-1 rounded font-medium disabled:opacity-30"
        style={{ background: '#10B981', color: '#000' }}
      >
        <Play size={9} /> Send to Code Agent
      </button>
    </div>
  );
}
