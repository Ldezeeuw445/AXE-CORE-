/**
 * GitHub repo configuration — which repos the code agents may read/write,
 * stored in localStorage with best-effort Supabase sync.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

export interface RepoConfig {
  id: string;       // 'axe-core' | 'axe-companion' | 'trading-os' | 'axon'
  label: string;
  owner: string;
  repo: string;
  branch: string;
  srcPrefix: string; // path inside repo where src/ lives
  token: string;     // GitHub PAT — stored locally, never sent to backend
}

/** Spoken / typed aliases → repo id */
export const REPO_ALIASES: Record<string, string> = {
  'axe-core': 'axe-core',
  'axe core': 'axe-core',
  axecore: 'axe-core',
  core: 'axe-core',
  headquarters: 'axe-core',
  'axe-companion': 'axe-companion',
  'axe companion': 'axe-companion',
  companion: 'axe-companion',
  'companion os': 'axe-companion',
  'trading-os': 'trading-os',
  'trading os': 'trading-os',
  trading: 'trading-os',
  tradingos: 'trading-os',
  axon: 'axon',
  'axon-memory': 'axon',
  'axon memory': 'axon',
};

export const DEFAULT_REPOS: RepoConfig[] = [
  {
    id: 'axe-core',
    label: 'AXE CORE',
    owner: 'Ldezeeuw445',
    repo: 'AXE-CORE-',
    branch: 'orchestrator',
    srcPrefix: 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src',
    token: '',
  },
  {
    id: 'axe-companion',
    label: 'AXE Companion OS',
    owner: 'Ldezeeuw445',
    repo: 'AXE-COMPANION-OS-',
    branch: 'main',
    srcPrefix: 'src',
    token: '',
  },
  {
    id: 'trading-os',
    label: 'Trading OS',
    owner: 'TRADING-AXE-OS-APPS',
    repo: 'TRADING-OS',
    branch: 'main',
    srcPrefix: 'src',
    token: '',
  },
  {
    id: 'axon',
    label: 'AXON Memory',
    owner: 'Ldezeeuw445',
    repo: 'axon-memory',
    branch: 'main',
    srcPrefix: '',
    token: '',
  },
];

/** direct = commit on configured branch; pr = feature branch + open PR (safer for CORE). */
export type CodeWriteMode = 'direct' | 'pr';

export function getCodeWriteMode(): CodeWriteMode {
  try {
    const v = localStorage.getItem('axe_code_write_mode');
    if (v === 'pr' || v === 'direct') return v;
  } catch { /* ignore */ }
  // Safer default for production edits from Home
  return 'pr';
}

export function setCodeWriteMode(mode: CodeWriteMode): void {
  try {
    localStorage.setItem('axe_code_write_mode', mode);
  } catch { /* ignore */ }
}

export function resolveRepoIdFromHint(hint: string): string | null {
  const lower = hint.toLowerCase().trim();
  if (!lower) return null;
  if (REPO_ALIASES[lower]) return REPO_ALIASES[lower];
  for (const [alias, id] of Object.entries(REPO_ALIASES)) {
    if (lower.includes(alias)) return id;
  }
  return null;
}

/** Merge stored configs with DEFAULT_REPOS so new entries (e.g. Axon) appear. */
export function loadRepoConfigs(): RepoConfig[] {
  let stored: RepoConfig[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem('axe_github_repos') ?? 'null');
    if (Array.isArray(raw) && raw.length > 0) stored = raw as RepoConfig[];
  } catch { /* */ }

  if (stored.length === 0) return DEFAULT_REPOS.map((r) => ({ ...r }));

  const byId = new Map(stored.map((r) => [r.id, r]));
  const merged: RepoConfig[] = DEFAULT_REPOS.map((def) => {
    const existing = byId.get(def.id);
    if (!existing) return { ...def };
    return {
      ...def,
      ...existing,
      // Keep user token/branch overrides; fill empty structural fields from defaults
      owner: existing.owner || def.owner,
      repo: existing.repo || def.repo,
      branch: existing.branch || def.branch,
      srcPrefix: existing.srcPrefix ?? def.srcPrefix,
      label: existing.label || def.label,
    };
  });

  // Keep any custom repos the user added that are not in defaults
  for (const r of stored) {
    if (!merged.some((m) => m.id === r.id)) merged.push(r);
  }
  return merged;
}

export function saveRepoConfigs(repos: RepoConfig[]) {
  localStorage.setItem('axe_github_repos', JSON.stringify(repos));
  void saveSetting('axe_github_repos', repos);
}

export function getRepoById(id: string): RepoConfig | null {
  return loadRepoConfigs().find((r) => r.id === id) ?? null;
}
