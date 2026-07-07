/**
 * githubCodeService.ts
 *
 * Gives AXE CORE the ability to read and write files in the GitHub repository.
 * When the user says "change the X component to Y", AXE CORE:
 *   1. Finds the relevant file via fuzzy path matching
 *   2. Reads its content via GitHub API
 *   3. Asks the LLM to apply the change
 *   4. Commits the result back
 *   5. Vercel auto-deploys
 *
 * Requires: VITE_GITHUB_TOKEN env var (GitHub Personal Access Token with repo write)
 */

const OWNER  = 'Ldezeeuw445';
const REPO   = 'AXE-CORE-';
const BRANCH = 'orchestrator';
// All source files live under this prefix in the repo
const SRC_PREFIX = 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src';

function getToken(): string {
  return import.meta.env.VITE_GITHUB_TOKEN ?? '';
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

export interface GHFile {
  path: string;     // full repo path
  content: string;  // decoded content
  sha: string;      // needed for updates
}

/** Fetch a single file from the repo */
export async function readFile(repoPath: string): Promise<GHFile> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${repoPath}?ref=${BRANCH}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}): ${await r.text()}`);
  const d = await r.json();
  return { path: repoPath, content: atob(d.content.replace(/\n/g, '')), sha: d.sha };
}

/** Commit a file update to the repo */
export async function writeFile(repoPath: string, content: string, sha: string, message: string): Promise<void> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${repoPath}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(content))), sha, branch: BRANCH }),
  });
  if (!r.ok) throw new Error(`GitHub write failed (${r.status}): ${await r.text()}`);
}

/** List all source files (recursive tree) — cached for 5 min */
let _treeCache: string[] | null = null;
let _treeCacheTime = 0;

export async function listSourceFiles(): Promise<string[]> {
  const now = Date.now();
  if (_treeCache && now - _treeCacheTime < 5 * 60_000) return _treeCache;

  const url = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHub tree failed (${r.status})`);
  const d = await r.json();
  _treeCache = (d.tree as { path: string; type: string }[])
    .filter(f => f.type === 'blob' && f.path.startsWith(SRC_PREFIX) && /\.(tsx?|jsx?|css)$/.test(f.path))
    .map(f => f.path);
  _treeCacheTime = now;
  return _treeCache;
}

/**
 * Find the most likely file path for a user description.
 * e.g. "settings page" → src/pages/SettingsPage.tsx
 */
export async function findFile(description: string): Promise<string | null> {
  const files = await listSourceFiles();
  const q = description.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Score each file: how many characters of the query appear in the file name
  const scored = files.map(f => {
    const name = f.split('/').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    for (const c of q) if (name.includes(c)) score++;
    // Bonus for exact word match
    const words = description.toLowerCase().split(/\s+/);
    for (const w of words) if (f.toLowerCase().includes(w)) score += 5;
    return { path: f, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 2 ? scored[0].path : null;
}

/** True if GitHub token is configured */
export function isGitHubConfigured(): boolean {
  return !!getToken();
}
