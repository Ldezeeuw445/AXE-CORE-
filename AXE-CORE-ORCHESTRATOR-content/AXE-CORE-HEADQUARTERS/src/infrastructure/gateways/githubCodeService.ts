/**
 * githubCodeService.ts
 *
 * Read/write files in configured GitHub repos (AXE CORE, Companion, Trading OS, Axon).
 * Config from Settings → Developer (localStorage via repoConfigService).
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
  if (!r) throw new Error('Geen GitHub repo geconfigureerd. Ga naar Settings → Developer.');
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

export async function readFile(repoPath: string, repo?: RepoConfig): Promise<GHFile> {
  const r = requireRepo(repo);
  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${repoPath}?ref=${r.branch}`;
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

export async function writeFile(
  repoPath: string,
  content: string,
  sha: string,
  message: string,
  repo?: RepoConfig,
  branchOverride?: string,
): Promise<void> {
  const r = requireRepo(repo);
  const branch = branchOverride || r.branch;
  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${repoPath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(r.token),
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha,
      branch,
    }),
  });
  if (!res.ok) throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`);
}

/** Create a branch from the repo's configured base branch. */
export async function createBranch(newBranch: string, repo?: RepoConfig): Promise<void> {
  const r = requireRepo(repo);
  const refUrl = `https://api.github.com/repos/${r.owner}/${r.repo}/git/ref/heads/${r.branch}`;
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

/** Open a pull request; returns html_url. */
export async function createPullRequest(
  title: string,
  body: string,
  head: string,
  repo?: RepoConfig,
  base?: string,
): Promise<string> {
  const r = requireRepo(repo);
  const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/pulls`, {
    method: 'POST',
    headers: ghHeaders(r.token),
    body: JSON.stringify({
      title,
      body,
      head,
      base: base || r.branch,
    }),
  });
  if (!res.ok) throw new Error(`Create PR failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.html_url as string) || '';
}

const _treeCache = new Map<string, { files: string[]; time: number }>();

export async function listSourceFiles(repo?: RepoConfig): Promise<string[]> {
  const r = repo ?? getPrimaryRepo();
  if (!r?.token) return [];
  const key = `${r.owner}/${r.repo}`;
  const cached = _treeCache.get(key);
  if (cached && Date.now() - cached.time < 5 * 60_000) return cached.files;

  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${r.branch}?recursive=1`;
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
