/**
 * GitHub repo configuration — which repos the code agents may read/write,
 * stored in localStorage with best-effort Supabase sync.
 * Extracted from SettingsPage so application/infrastructure code no longer
 * imports from a presentation page.
 */
import { saveSetting } from '@/infrastructure/persistence/userSettingsService';

export interface RepoConfig {
  id: string;       // 'axe-core' | 'axe-companion' | 'trading-os'
  label: string;
  owner: string;
  repo: string;
  branch: string;
  srcPrefix: string; // path inside repo where src/ lives
  token: string;     // GitHub PAT — stored locally, never sent to backend
}

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
];

export function loadRepoConfigs(): RepoConfig[] {
  try {
    const stored = JSON.parse(localStorage.getItem('axe_github_repos') ?? 'null');
    if (Array.isArray(stored) && stored.length > 0) return stored as RepoConfig[];
  } catch { /* */ }
  return DEFAULT_REPOS;
}

export function saveRepoConfigs(repos: RepoConfig[]) {
  localStorage.setItem('axe_github_repos', JSON.stringify(repos));
  void saveSetting('axe_github_repos', repos);
}
