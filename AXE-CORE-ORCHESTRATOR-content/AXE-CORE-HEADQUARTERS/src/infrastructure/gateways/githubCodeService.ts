/**
 * githubCodeService.ts
 *
 * Gives AXE CORE the ability to read and write files in any of the 3 configured
 * GitHub repositories (AXE CORE, AXE Companion, Trading OS).
 *
 * Config is read from localStorage via the Developer section in Settings.
 * No hardcoded tokens — everything is user-configurable.
 */

import { loadRepoConfigs, type RepoConfig } from '@/infrastructure/persistence/repoConfigService';

export interface GHFile {
  path: string;     // full repo path
  content: string;  // decoded content
  sha: string;      // needed for updates
  repo: RepoConfig; // which repo this came from
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/** Get the primary (AXE CORE) repo config. Falls back to first configured repo. */
export function getPrimaryRepo(): RepoConfig | null {
  const repos = loadRepoConfigs();
  // Prefer 'axe-core' repo that has a token
  return repos.find(r => r.id === 'axe-core' && r.token) ??
         repos.find(r => r.token) ??
         repos[0] ?? null;
}

/** Detect which repo a file path / user message belongs to */
export function detectRepo(hint: string): RepoConfig {
  const repos = loadRepoConfigs();
  const lower = hint.toLowerCase();
  if (/companion|companion/.test(lower)) return repos.find(r => r.id === 'axe-companion') ?? repos[0];
  if (/trading|tradingos|trading.os/.test(lower)) return repos.find(r => r.id === 'trading-os') ?? repos[0];
  // Default to AXE CORE
  return repos.find(r => r.id === 'axe-core') ?? repos[0];
}

/** Fetch a single file from the repo */
export async function readFile(repoPath: string, repo?: RepoConfig): Promise<GHFile> {
  const r = repo ?? getPrimaryRepo();
  if (!r) throw new Error('Geen GitHub repo geconfigureerd. Ga naar Settings → Developer.');
  const token = r.token || import.meta.env.VITE_GITHUB_TOKEN || '';
  if (!token) throw new Error(`Geen GitHub token voor repo ${r.label}. Stel in via Settings → Developer.`);

  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${repoPath}?ref=${r.branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`);
  const d = await res.json();
  return { path: repoPath, content: atob(d.content.replace(/\n/g, '')), sha: d.sha, repo: r };
}

/** Commit a file update to the repo */
export async function writeFile(repoPath: string, content: string, sha: string, message: string, repo?: RepoConfig): Promise<void> {
  const r = repo ?? getPrimaryRepo();
  if (!r) throw new Error('Geen GitHub repo geconfigureerd.');
  const token = r.token || import.meta.env.VITE_GITHUB_TOKEN || '';
  if (!token) throw new Error(`Geen GitHub token voor repo ${r.label}.`);

  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${repoPath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(content))), sha, branch: r.branch }),
  });
  if (!res.ok) throw new Error(`GitHub write failed (${res.status}): ${await res.text()}`);
}

/** List all source files (recursive tree) — cached per repo for 5 min */
const _treeCache = new Map<string, { files: string[]; time: number }>();

export async function listSourceFiles(repo?: RepoConfig): Promise<string[]> {
  const r = repo ?? getPrimaryRepo();
  if (!r) return [];
  const token = r.token || import.meta.env.VITE_GITHUB_TOKEN || '';
  const key = `${r.owner}/${r.repo}`;
  const cached = _treeCache.get(key);
  if (cached && Date.now() - cached.time < 5 * 60_000) return cached.files;

  const url = `https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${r.branch}?recursive=1`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`GitHub tree failed (${res.status})`);
  const d = await res.json();
  const files = (d.tree as { path: string; type: string }[])
    .filter(f => f.type === 'blob' && f.path.startsWith(r.srcPrefix) && /\.(tsx?|jsx?|css)$/.test(f.path))
    .map(f => f.path);
  _treeCache.set(key, { files, time: Date.now() });
  return files;
}

/**
 * Find the most likely file path for a user description.
 * e.g. "settings page" → src/pages/SettingsPage.tsx
 */
export async function findFile(description: string, repo?: RepoConfig): Promise<string | null> {
  const r = repo ?? detectRepo(description);
  const files = await listSourceFiles(r);
  const q = description.toLowerCase().replace(/[^a-z0-9]/g, '');

  const scored = files.map(f => {
    const name = f.split('/').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    for (const c of q) if (name.includes(c)) score++;
    const words = description.toLowerCase().split(/\s+/);
    for (const w of words) if (f.toLowerCase().includes(w)) score += 5;
    return { path: f, score, repo: r };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 2 ? scored[0].path : null;
}

/** True if at least one repo has a GitHub token configured */
export function isGitHubConfigured(): boolean {
  const repos = loadRepoConfigs();
  return repos.some(r => r.token) || !!import.meta.env.VITE_GITHUB_TOKEN;
}

