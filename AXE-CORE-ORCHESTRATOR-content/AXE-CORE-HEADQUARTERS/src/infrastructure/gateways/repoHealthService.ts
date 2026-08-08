/**
 * Hard GitHub readiness checks for Settings + ThinkTank BUILD gates.
 * Tokens stay client-side; we only call api.github.com from the browser/Tauri webview.
 */
import { loadRepoConfigs, type RepoConfig } from '@/infrastructure/persistence/repoConfigService';

export interface RepoHealth {
  id: string;
  label: string;
  tokenPresent: boolean;
  tokenValid: boolean;
  repoReachable: boolean;
  canPush: boolean;
  defaultBranch: string | null;
  error?: string;
  checkedAt: number;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function validateRepo(repo: RepoConfig): Promise<RepoHealth> {
  const base: RepoHealth = {
    id: repo.id,
    label: repo.label,
    tokenPresent: !!repo.token?.trim(),
    tokenValid: false,
    repoReachable: false,
    canPush: false,
    defaultBranch: null,
    checkedAt: Date.now(),
  };
  if (!base.tokenPresent) {
    base.error = 'No GitHub token — paste PAT in Settings → Developer';
    return base;
  }
  const token = repo.token.trim();
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: headers(token),
      signal: AbortSignal.timeout(12_000),
    });
    if (!userRes.ok) {
      base.error = `Token invalid (HTTP ${userRes.status})`;
      return base;
    }
    base.tokenValid = true;

    const repoRes = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
      headers: headers(token),
      signal: AbortSignal.timeout(12_000),
    });
    if (!repoRes.ok) {
      base.error = `Repo ${repo.owner}/${repo.repo} not reachable (${repoRes.status})`;
      return base;
    }
    const data = (await repoRes.json()) as {
      default_branch?: string;
      permissions?: { push?: boolean; admin?: boolean };
    };
    base.repoReachable = true;
    base.defaultBranch = data.default_branch ?? repo.branch;
    base.canPush = !!(data.permissions?.push || data.permissions?.admin);
    if (!base.canPush) base.error = 'Token can read but not push — need repo scope / write access';
    return base;
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    return base;
  }
}

export async function validateAllRepos(): Promise<RepoHealth[]> {
  const repos = loadRepoConfigs();
  const out: RepoHealth[] = [];
  for (const r of repos) {
    out.push(await validateRepo(r));
  }
  return out;
}

/** Gate for ThinkTank BUILD — all selected app ids must be healthy. */
export async function assertReposReadyForBuild(appIds: string[]): Promise<{ ok: boolean; failures: RepoHealth[] }> {
  const map: Record<string, string> = {
    'axe-core': 'axe-core',
    'axe-companion': 'axe-companion',
    'trading-os': 'trading-os',
    'axon-memory': 'axon',
    axon: 'axon',
  };
  const repos = loadRepoConfigs();
  const failures: RepoHealth[] = [];
  for (const appId of appIds) {
    const repoId = map[appId] ?? appId;
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) {
      failures.push({
        id: repoId,
        label: repoId,
        tokenPresent: false,
        tokenValid: false,
        repoReachable: false,
        canPush: false,
        defaultBranch: null,
        error: 'Repo not configured in Settings',
        checkedAt: Date.now(),
      });
      continue;
    }
    const h = await validateRepo(repo);
    if (!h.tokenValid || !h.repoReachable || !h.canPush) failures.push(h);
  }
  return { ok: failures.length === 0, failures };
}
