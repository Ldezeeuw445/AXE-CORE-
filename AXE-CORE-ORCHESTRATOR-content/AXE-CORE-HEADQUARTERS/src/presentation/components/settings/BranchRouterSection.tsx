import { useEffect, useState } from 'react';
import { RefreshCw, Zap, GitBranch, CheckCircle2, XCircle } from 'lucide-react';
import { getSystemState, checkAllServices, type ServiceState } from '@/application/system/systemService';
import { claudeRepos, type ClaudeRepoInfo } from '@/infrastructure/gateways/axeCoreApiService';

// ═══════════════════════════════════════════════════════════════════════
// AXE Branches — read-only status of the three routes AXE Core's LangGraph
// orchestrator can take: Branch A (CrewAI on local/VPS Ollama), Branch B
// (cloud provider keys — OpenRouter/Gemini/Grok/Groq/KiloCode), Branch C
// (headless Claude Code against a whitelisted repo). This is a monitor, not
// a router editor — same convention as CapabilityRouterSection.
// ══════════════════════════════════════════════════════════════════════════

type BranchId = 'a' | 'b' | 'c';

const BRANCH_COLORS: Record<BranchId, string> = {
  a: '#3B82F6',
  b: '#8B5CF6',
  c: 'var(--accent-cyan)',
};

interface BranchDef {
  id: BranchId;
  name: string;
  subtitle: string;
  trigger: string;
  runsOn: string;
  serviceKeys: string[];
}

const BRANCHES: BranchDef[] = [
  {
    id: 'a',
    name: 'Branch A — CrewAI',
    subtitle: '9 specialist agents on Ollama',
    trigger: 'Auto-classified from chat (local/private/code-ish keywords), or /crew/run directly',
    runsOn: 'VPS — isolated Python venv, no API key',
    serviceKeys: ['crewai', 'ollama'],
  },
  {
    id: 'b',
    name: 'Branch B — Cloud',
    subtitle: 'OpenRouter / Gemini / Grok / Groq / KiloCode',
    trigger: 'Auto-classified from chat (analysis/research/strategy keywords), or a provider slot set to Primary',
    runsOn: 'Cloud provider APIs, keys held in Settings → Providers',
    serviceKeys: ['kilocode', 'openrouter', 'gemini', 'xai', 'groq'],
  },
  {
    id: 'c',
    name: 'Branch C — Claude Code',
    subtitle: 'Headless Claude Code CLI on a whitelisted repo',
    trigger: 'Only the Code Studio engine picker (native/openhands/claude) — not auto-classified from chat yet',
    runsOn: 'VPS — real CLI in a git checkout, subscription auth (never ANTHROPIC_API_KEY)',
    serviceKeys: ['claude_code'],
  },
];

function statusOf(services: ServiceState[], keys: string[]): { online: number; total: number; label: string } {
  const found = keys.map(k => services.find(s => s.service === k)).filter((s): s is ServiceState => !!s);
  const online = found.filter(s => s.status === 'online').length;
  if (found.length === 0) return { online: 0, total: keys.length, label: 'not tracked' };
  return { online, total: found.length, label: `${online}/${found.length} online` };
}

function RepoRow({ name, info }: { name: string; info: ClaudeRepoInfo }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <GitBranch size={11} style={{ color: info.runnable ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{name}</span>
        <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
          {info.branch ?? '—'}
        </span>
      </div>
      {info.runnable
        ? <CheckCircle2 size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
        : <XCircle size={11} style={{ color: info.exists ? 'var(--warning)' : 'var(--error)', flexShrink: 0 }} />}
    </div>
  );
}

function BranchCard({ branch, services, claudeRepoInfo, claudeRepoError }: {
  branch: BranchDef;
  services: ServiceState[];
  claudeRepoInfo: Record<string, ClaudeRepoInfo> | null;
  claudeRepoError: string | null;
}) {
  const color = BRANCH_COLORS[branch.id];
  const status = statusOf(services, branch.serviceKeys);
  const healthy = status.total > 0 && status.online === status.total;
  const degraded = status.online > 0 && status.online < status.total;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${color}25`, background: 'var(--surface-bg)' }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-full shrink-0" style={{
            width: 8, height: 8,
            background: healthy ? 'var(--success)' : degraded ? 'var(--warning)' : 'var(--error)',
            boxShadow: healthy ? '0 0 8px var(--success)' : 'none',
          }} />
          <div className="min-w-0">
            <span className="text-sm font-medium" style={{ color }}>{branch.name}</span>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{branch.subtitle}</p>
          </div>
        </div>
        <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{status.label}</span>
      </div>

      <div className="px-4 pb-4 space-y-2" style={{ borderTop: `1px solid ${color}15` }}>
        <div className="pt-3 space-y-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <p><span style={{ color: 'var(--text-secondary)' }}>Triggered by: </span>{branch.trigger}</p>
          <p><span style={{ color: 'var(--text-secondary)' }}>Runs on: </span>{branch.runsOn}</p>
        </div>

        {branch.id === 'c' && (
          <div className="space-y-1.5 pt-1">
            {claudeRepoError ? (
              <p className="text-[10px]" style={{ color: 'var(--warning)' }}>{claudeRepoError}</p>
            ) : claudeRepoInfo && Object.keys(claudeRepoInfo).length > 0 ? (
              Object.entries(claudeRepoInfo).map(([name, info]) => <RepoRow key={name} name={name} info={info} />)
            ) : (
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No whitelisted repos configured (CLAUDE_CODE_REPOS).</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)' }}>
          <Zap size={12} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Read-only monitor. Putting a provider on Primary in Settings does not switch AXE to that branch for everything — LangGraph still classifies each message.
          </p>
        </div>
      </div>
    </div>
  );
}

export function BranchRouterSection() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [claudeRepoInfo, setClaudeRepoInfo] = useState<Record<string, ClaudeRepoInfo> | null>(null);
  const [claudeRepoError, setClaudeRepoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRepos = async () => {
    try {
      const res = await claudeRepos();
      setClaudeRepoInfo(res.repos ?? {});
      setClaudeRepoError(null);
    } catch (e) {
      setClaudeRepoInfo(null);
      setClaudeRepoError(e instanceof Error ? e.message : 'Could not reach /claude/repos (check AXE_API_KEY)');
    }
  };

  const load = async () => {
    const [state] = await Promise.all([getSystemState(), loadRepos()]);
    setServices(state);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await checkAllServices();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AXE Branches</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            The three routes LangGraph can send a task down — what's live, and what each one is actually using right now.
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
          style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={13} className="animate-spin" />
          <span className="text-xs">Loading branch status…</span>
        </div>
      ) : (
        <div className="space-y-2">
          {BRANCHES.map(branch => (
            <BranchCard
              key={branch.id}
              branch={branch}
              services={services}
              claudeRepoInfo={claudeRepoInfo}
              claudeRepoError={claudeRepoError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
