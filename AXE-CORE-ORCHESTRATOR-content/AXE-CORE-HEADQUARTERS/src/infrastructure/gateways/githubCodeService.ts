/**
 * githubCodeService.ts
 *
 * Read/write files in configured GitHub repos (AXE CORE, Companion, Trading OS, Axon).
 * Config from Settings → Developer (localStorage via repoConfigService).
 *
 * Security:
 * - Tokens stay client-side only
 * - Production branches (main/orchestrator) are never written by ThinkTank agents
 * - validateRepo() is the hard readiness gate used by BUILD / Settings
 */

import {
  loadRepoConfigs,
  resolveRepoIdFromHint,
  type RepoConfig,
} from '@/infrastructure/persistence/repoConfigService';

export interface GHFile {
  path: string;
  content: string;
  sha: string;
  repo: RepoConfig;
}

export interface RepoValidationResult {
  ok: boolean;
  tokenValid: boolean;
  canPush: boolean;
  repoExists: boolean;
  defaultBranch: string;
  configuredBranch: string;
  configuredBranchExists: boolean;
  login?: string;
  error?: string;
  checkedAt: number;
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function requireRepo(repo?: RepoConfig): RepoConfig {
  const r = repo ?? getPrimaryRepo();
  if (!r) throw new Error('No GitHub repo configured. Go to Settings → Developer.');
  if (!r.token) throw new Error(`Geen GitHub token voor ${r.label}. Stel in via Settings → Developer.`);
  return r;
}

/** Primary = AXE CORE with token, else first token-bearing repo. */
export function getPrimaryRepo(): RepoConfig | null {
  const repos = loadRepoConfigs();
  return repos.find((r) => r.id === 'axe-core' && r.token)
    ?? repos.find((r) => r.token)
    ?? repos[0]
    ?? null;
}

/** Detect which repo a file path / user message belongs to (aliases + keywords). */
export function detectRepo(hint: string): RepoConfig {
  const repos = loadRepoConfigs();
  const id = resolveRepoIdFromHint(hint);
  if (id) {
    const found = repos.find((r) => r.id === id);
    if (found) return found;
  }
  return repos.find((r) => r.id === 'axe-core') ?? repos[0];
}

/**
 * Hard readiness check used by Settings "Test connection" and ThinkTank BUILD.
 * Hits real GitHub API — never invents green status.
 */
export async function validateRepo(repo: RepoConfig): Promise<RepoValidationResult> {
  const checkedAt = Date.now();
  const base: RepoValidationResult = {
    ok: false,
    tokenValid: false,
    canPush: false,
    repoExists: false,
    defaultBranch: '',
    configuredBranch: repo.branch || 'main',
    configuredBranchExists: false,
    checkedAt,
  };

  if (!repo.token?.trim()) {
    return { ...base, error: 'Geen token ingevuld' };
  }
  if (!repo.owner?.trim() || !repo.repo?.trim()) {
    return { ...base, error: 'Owner of repo ontbreekt' };
  }

  try {
    // 1) Token validity
    const userRes = await fetch('https://api.github.com/user', {
      headers: ghHeaders(repo.token),
    });
    if (userRes.status === 401 || userRes.status === 403) {
      return { ...base, error: `Token ongeldig of geen toegang (${userRes.status})` };
    }
    if (!userRes.ok) {
      return { ...base, error: `GitHub /user failed (${userRes.status})` };
    }
    const user = await userRes.json();
    base.tokenValid = true;
    base.login = user.login as string | undefined;

    // 2) Repo exists + permissions
    const repoRes = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
      { headers: ghHeaders(repo.token) },
    );
    if (repoRes.status === 404) {
      return {
        ...base,
        error: `Repo ${repo.owner}/${repo.repo} not found (or no access)`,
      };
    }
    if (!repoRes.ok) {
      return { ...base, error: `Repo check failed (${repoRes.status})` };
    }
    const repoData = await repoRes.json();
    base.repoExists = true;
    base.defaultBranch = (repoData.default_branch as string) || 'main';
    // permissions.push is true when the token can push
    base.canPush = !!(repoData.permissions?.push || repoData.permissions?.admin);

    // 3) Configured base branch exists?
    const branch = repo.branch || base.defaultBranch;
    base.configuredBranch = branch;
    const branchRes = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/branches/${encodeURIComponent(branch)}`,
      { headers: ghHeaders(repo.token) },
    );
    base.configuredBranchExists = branchRes.ok;

    if (!base.canPush) {
      return {
        ...base,
        ok: false,
        error: 'Token has no push rights on this repo (needs collaborator + repo scope)',
      };
    }
    if (!base.configuredBranchExists) {
      return {
        ...base,
        ok: false,
        error: `Branch "${branch}" bestaat niet op ${repo.owner}/${repo.repo}`,
      };
    }

    return { ...base, ok: true };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function readFile(
  repoPath: string,
  repo?: RepoConfig,
  branchOverride?: string,
): Promise<GHFile> {
  const r = requireRepo(repo);
  const branch = branchOverride || r.branch;
  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(r.token) });
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`);
  const d = await res.json();
  return {
    path: repoPath,
    content: atob(d.content.replace(/\n/g, '')),
    sha: d.sha,
    repo: r,
  };
}

/**
 * Write (create or update) a file on a specific branch.
 * For new files, pass sha as empty string / omit — GitHub accepts create without sha.
 */
export async function writeFile(
  repoPath: string,
  content: string,
  sha: string,
  message: string,
  repo?: RepoConfig,
  branchOverride?: string,
): Promise<{ commitSha?: string }> {
  const r = requireRepo(repo);
  const branch = branchOverride || r.branch;
  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${repoPath}`;
  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(r.token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`);
  const data = await res.json().catch(() => ({}));
  return { commitSha: data.commit?.sha as string | undefined };
}

/** Create a branch from the repo's configured base branch. Idempotent (422 = exists). */
export async function createBranch(newBranch: string, repo?: RepoConfig): Promise<void> {
  const r = requireRepo(repo);
  const refUrl = `https://api.github.com/repos/${r.owner}/${r.repo}/git/ref/heads/${encodeURIComponent(r.branch)}`;
  const refRes = await fetch(refUrl, { headers: ghHeaders(r.token) });
  if (!refRes.ok) throw new Error(`Cannot resolve base branch ${r.branch}: ${refRes.status}`);
  const refData = await refRes.json();
  const sha = refData.object?.sha as string;
  if (!sha) throw new Error('Base branch SHA missing');

  const createRes = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/git/refs`, {
    method: 'POST',
    headers: ghHeaders(r.token),
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
  // 422 = already exists — ok to reuse
  if (!createRes.ok && createRes.status !== 422) {
    throw new Error(`Create branch failed (${createRes.status}): ${await createRes.text()}`);
  }
}

export interface PullRequestResult {
  htmlUrl: string;
  number: number;
  draft: boolean;
}

/** Open a pull request; returns url + number. */
export async function createPullRequest(
  title: string,
  body: string,
  head: string,
  repo?: RepoConfig,
  base?: string,
  draft = true,
): Promise<PullRequestResult> {
  const r = requireRepo(repo);
  const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/pulls`, {
    method: 'POST',
    headers: ghHeaders(r.token),
    body: JSON.stringify({
      title,
      body,
      head,
      base: base || r.branch,
      draft,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 422) {
      const list = await fetch(
        `https://api.github.com/repos/${r.owner}/${r.repo}/pulls?head=${encodeURIComponent(`${r.owner}:${head}`)}&state=open`,
        { headers: ghHeaders(r.token) },
      );
      if (list.ok) {
        const prs = await list.json();
        if (Array.isArray(prs) && prs[0]?.html_url) {
          return {
            htmlUrl: prs[0].html_url as string,
            number: prs[0].number as number,
            draft: !!prs[0].draft,
          };
        }
      }
    }
    throw new Error(`Create PR failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    htmlUrl: (data.html_url as string) || '',
    number: data.number as number,
    draft: !!data.draft,
  };
}

/** Merge a pull request (requires PAT with push). method: merge | squash | rebase */
export async function mergePullRequest(
  prNumber: number,
  repo?: RepoConfig,
  method: 'merge' | 'squash' | 'rebase' = 'squash',
): Promise<{ merged: boolean; message: string }> {
  const r = requireRepo(repo);
  const res = await fetch(
    `https://api.github.com/repos/${r.owner}/${r.repo}/pulls/${prNumber}/merge`,
    {
      method: 'PUT',
      headers: ghHeaders(r.token),
      body: JSON.stringify({
        merge_method: method,
        commit_title: `Merge ThinkTank PR #${prNumber}`,
      }),
    },
  );
  if (res.status === 405) {
    return { merged: false, message: 'PR not mergeable (checks failing or conflicts)' };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Merge failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    merged: !!data.merged,
    message: (data.message as string) || (data.merged ? 'Merged' : 'Not merged'),
  };
}

/** Check whether a branch exists on the remote. */
export async function branchExists(branch: string, repo?: RepoConfig): Promise<boolean> {
  const r = requireRepo(repo);
  const res = await fetch(
    `https://api.github.com/repos/${r.owner}/${r.repo}/branches/${encodeURIComponent(branch)}`,
    { headers: ghHeaders(r.token) },
  );
  return res.ok;
}

/** Compare head branch vs base — returns files changed. */
export async function compareBranches(
  head: string,
  repo?: RepoConfig,
  base?: string,
): Promise<{ files: string[]; aheadBy: number; url: string }> {
  const r = requireRepo(repo);
  const baseBranch = base || r.branch;
  const res = await fetch(
    `https://api.github.com/repos/${r.owner}/${r.repo}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(head)}`,
    { headers: ghHeaders(r.token) },
  );
  if (!res.ok) throw new Error(`Compare failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const files = ((data.files as { filename: string }[]) || []).map((f) => f.filename);
  return {
    files,
    aheadBy: (data.ahead_by as number) || 0,
    url: (data.html_url as string) || '',
  };
}

const _treeCache = new Map<string, { files: string[]; time: number }>();

export async function listSourceFiles(repo?: RepoConfig): Promise<string[]> {
  const r = repo ?? getPrimaryRepo();
  if (!r?.token) return [];
  const key = `${r.owner}/${r.repo}:${r.branch}`;
  const cached = _treeCache.get(key);
  if (cached && Date.now() - cached.time < 5 * 60_000) return cached.files;

  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(r.branch)}?recursive=1`;
  const res = await fetch(url, { headers: ghHeaders(r.token) });
  if (!res.ok) throw new Error(`GitHub tree failed (${res.status})`);
  const d = await res.json();
  const prefix = r.srcPrefix || '';
  const files = (d.tree as { path: string; type: string }[])
    .filter((f) => {
      if (f.type !== 'blob') return false;
      if (prefix && !f.path.startsWith(prefix)) return false;
      return /\.(tsx?|jsx?|css|md|json|py)$/.test(f.path);
    })
    .map((f) => f.path);
  _treeCache.set(key, { files, time: Date.now() });
  return files;
}

export async function findFile(description: string, repo?: RepoConfig): Promise<string | null> {
  const r = repo ?? detectRepo(description);
  const files = await listSourceFiles(r);
  const q = description.toLowerCase().replace(/[^a-z0-9]/g, '');

  const scored = files.map((f) => {
    const name = f.split('/').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    for (const c of q) if (name.includes(c)) score++;
    const words = description.toLowerCase().split(/\s+/);
    for (const w of words) if (w.length > 2 && f.toLowerCase().includes(w)) score += 5;
    return { path: f, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 2 ? scored[0].path : null;
}

export function isGitHubConfigured(): boolean {
  return loadRepoConfigs().some((r) => !!r.token);
}

/** Human-readable target line for voice confirmations. */
export function formatRepoTarget(repo: RepoConfig, filePath?: string): string {
  const file = filePath ? ` · file ${filePath}` : '';
  return `${repo.label} (${repo.owner}/${repo.repo}) · branch ${repo.branch}${file}`;
}

/**
 * Push a set of path→content pairs onto a thinktank branch and open a draft PR.
 * Used by ThinkTank BUILD after local/workspace patches succeed.
 */
export async function commitFilesToBranch(opts: {
  repo: RepoConfig;
  branch: string;
  files: { path: string; content: string }[];
  message: string;
  prTitle: string;
  prBody: string;
}): Promise<{ branch: string; prUrl: string; prNumber: number; commitShas: string[]; filesWritten: string[] }> {
  const { repo, branch, files, message, prTitle, prBody } = opts;
  if (!files.length) {
    throw new Error('Geen files om te committen');
  }

  await createBranch(branch, repo);

  const commitShas: string[] = [];
  const filesWritten: string[] = [];

  for (const f of files) {
    let sha = '';
    try {
      const existing = await readFile(f.path, repo, branch);
      sha = existing.sha;
    } catch {
      // new file — sha stays empty
    }
    const result = await writeFile(f.path, f.content, sha, message, repo, branch);
    if (result.commitSha) commitShas.push(result.commitSha);
    filesWritten.push(f.path);
  }

  const pr = await createPullRequest(prTitle, prBody, branch, repo, repo.branch, true);
  return {
    branch,
    prUrl: pr.htmlUrl,
    prNumber: pr.number,
    commitShas,
    filesWritten,
  };
}
