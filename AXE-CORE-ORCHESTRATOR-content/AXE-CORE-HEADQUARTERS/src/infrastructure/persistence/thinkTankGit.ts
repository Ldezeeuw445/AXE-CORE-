/**
 * Per-app ThinkTank branches — never commit agent work directly to main/orchestrator.
 * Convention: thinktank/<repo-id>/<slug>-<shortid>
 */
import type { RepoConfig } from '@/infrastructure/persistence/repoConfigService';
import { getRepoForApp, repoIdForApp } from '@/infrastructure/persistence/repoConfigService';
import {
  validateRepo,
  commitFilesToBranch,
  branchExists,
  compareBranches,
  mergePullRequest,
  type RepoValidationResult,
} from '@/infrastructure/gateways/githubCodeService';

const PROTECTED = new Set(['main', 'master', 'orchestrator', 'production', 'prod']);

export function thinkTankBranchName(repoId: string, itemTitle: string, itemId: string): string {
  const slug = (itemTitle || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36) || 'item';
  const short = (itemId || 'x').replace(/[^a-z0-9]/gi, '').slice(-6) || 'x';
  return `thinktank/${repoId}/${slug}-${short}`;
}

export function isProtectedBranch(branch: string): boolean {
  return PROTECTED.has((branch || '').toLowerCase());
}

/** Target branch for agent writes: always a thinktank branch, never the repo default if protected. */
export function resolveWriteBranch(repo: RepoConfig, itemTitle: string, itemId: string): string {
  if (repo.branch && !isProtectedBranch(repo.branch) && repo.branch.startsWith('thinktank/')) {
    return repo.branch;
  }
  return thinkTankBranchName(repo.id, itemTitle, itemId);
}

export interface IntegrateHardCheck {
  name: string;
  pass: boolean;
  detail: string;
  /** soft = informational; hard = blocks "fully integrated" claim */
  severity: 'hard' | 'soft';
}

export function evaluateIntegrateHardChecks(opts: {
  patchesApplied: number;
  branch?: string | null;
  prUrl?: string | null;
  filesTouched?: string[];
  branchExistsOnRemote?: boolean;
  filesOnBranch?: number;
}): IntegrateHardCheck[] {
  const checks: IntegrateHardCheck[] = [];
  checks.push({
    name: 'Code patches',
    pass: (opts.patchesApplied ?? 0) > 0,
    severity: 'hard',
    detail:
      (opts.patchesApplied ?? 0) > 0
        ? `${opts.patchesApplied} file patch(es) applied`
        : '0 patches — BUILD did not write code (check AI provider + GitHub token + workspace)',
  });
  checks.push({
    name: 'Files touched',
    pass: (opts.filesTouched?.length ?? 0) > 0,
    severity: 'hard',
    detail:
      (opts.filesTouched?.length ?? 0) > 0
        ? opts.filesTouched!.slice(0, 8).join(', ')
        : 'No files listed',
  });
  checks.push({
    name: 'ThinkTank branch',
    pass: !!(opts.branch && opts.branch.startsWith('thinktank/')),
    severity: 'hard',
    detail: opts.branch
      ? `Branch: ${opts.branch}`
      : 'No thinktank/* branch — BUILD must create one before INTEGRATE can claim success',
  });
  if (opts.branchExistsOnRemote !== undefined) {
    checks.push({
      name: 'Branch on GitHub',
      pass: !!opts.branchExistsOnRemote,
      severity: 'hard',
      detail: opts.branchExistsOnRemote
        ? 'Branch exists on remote'
        : 'Branch not found on GitHub — push failed or never ran',
    });
  }
  if (opts.filesOnBranch !== undefined) {
    checks.push({
      name: 'Files on branch',
      pass: opts.filesOnBranch > 0,
      severity: 'hard',
      detail:
        opts.filesOnBranch > 0
          ? `${opts.filesOnBranch} file(s) differ from base`
          : 'Branch has no diff vs base — nothing to merge',
    });
  }
  checks.push({
    name: 'Pull request',
    pass: !!opts.prUrl,
    severity: 'soft',
    detail: opts.prUrl ? opts.prUrl : 'No PR yet — open from ThinkTank after BUILD',
  });
  return checks;
}

export interface AppReadiness {
  appId: string;
  repoId: string;
  repo: RepoConfig | null;
  validation: RepoValidationResult | null;
  ok: boolean;
  error?: string;
}

/**
 * Hard gate before BUILD: every selected app must have a valid token + push rights.
 * Returns per-app status so the UI can show exactly which app is blocking.
 */
export async function checkAppsReadiness(appIds: string[]): Promise<{
  ok: boolean;
  apps: AppReadiness[];
  errors: string[];
}> {
  const apps: AppReadiness[] = [];
  const errors: string[] = [];

  for (const appId of appIds) {
    const repoId = repoIdForApp(appId);
    const repo = getRepoForApp(appId);
    if (!repo) {
      const entry: AppReadiness = {
        appId,
        repoId,
        repo: null,
        validation: null,
        ok: false,
        error: `Geen repo-config voor ${appId}`,
      };
      apps.push(entry);
      errors.push(entry.error!);
      continue;
    }
    if (!repo.token?.trim()) {
      const entry: AppReadiness = {
        appId,
        repoId,
        repo,
        validation: null,
        ok: false,
        error: `${repo.label}: geen GitHub token in Settings`,
      };
      apps.push(entry);
      errors.push(entry.error!);
      continue;
    }
    const validation = await validateRepo(repo);
    const entry: AppReadiness = {
      appId,
      repoId,
      repo,
      validation,
      ok: validation.ok,
      error: validation.ok ? undefined : `${repo.label}: ${validation.error || 'niet klaar'}`,
    };
    apps.push(entry);
    if (!entry.ok && entry.error) errors.push(entry.error);
  }

  return { ok: errors.length === 0, apps, errors };
}

/**
 * After workspace patches succeed: push the touched file contents to a
 * thinktank/* branch on each target app's GitHub repo and open a draft PR.
 */
export async function publishThinkTankBranch(opts: {
  appId: string;
  itemId: string;
  itemTitle: string;
  files: { path: string; content: string }[];
  summary: string;
}): Promise<{
  appId: string;
  branch: string;
  prUrl: string;
  prNumber: number;
  commitShas: string[];
  filesWritten: string[];
} | null> {
  const repo = getRepoForApp(opts.appId);
  if (!repo?.token) return null;
  if (!opts.files.length) return null;

  const branch = resolveWriteBranch(repo, opts.itemTitle, opts.itemId);
  const result = await commitFilesToBranch({
    repo,
    branch,
    files: opts.files,
    message: `thinktank: ${opts.itemTitle}`.slice(0, 72),
    prTitle: `[ThinkTank] ${opts.itemTitle}`.slice(0, 80),
    prBody: [
      `## ThinkTank BUILD`,
      '',
      opts.summary,
      '',
      `**Branch:** \`${branch}\``,
      `**Item:** \`${opts.itemId}\``,
      '',
      'Draft PR — merge only after review (via AXE Core Integrate → Merge, or GitHub).',
      '',
      'Never merge blindly onto production without smoke-check.',
    ].join('\n'),
  });

  return {
    appId: opts.appId,
    branch: result.branch,
    prUrl: result.prUrl,
    prNumber: result.prNumber,
    commitShas: result.commitShas,
    filesWritten: result.filesWritten,
  };
}

/**
 * Merge a ThinkTank PR into the app's base branch after explicit user confirmation.
 * Call only after window.confirm / approval UI — this hits GitHub for real.
 */
export async function mergeThinkTankPullRequest(opts: {
  appId: string;
  prNumber: number;
  method?: 'merge' | 'squash' | 'rebase';
}): Promise<{ merged: boolean; message: string; appId: string; prNumber: number }> {
  const repo = getRepoForApp(opts.appId);
  if (!repo?.token) {
    throw new Error(`Geen GitHub token voor app ${opts.appId}`);
  }
  if (!opts.prNumber || opts.prNumber < 1) {
    throw new Error('Ongeldig PR-nummer');
  }
  const result = await mergePullRequest(opts.prNumber, repo, opts.method || 'squash');
  return {
    merged: result.merged,
    message: result.message,
    appId: opts.appId,
    prNumber: opts.prNumber,
  };
}

/** Live remote checks used by INTEGRATE. */
export async function verifyThinkTankBranchOnRemote(opts: {
  appId: string;
  branch: string;
}): Promise<{ exists: boolean; filesOnBranch: number; compareUrl?: string; error?: string }> {
  const repo = getRepoForApp(opts.appId);
  if (!repo?.token) {
    return { exists: false, filesOnBranch: 0, error: 'Geen token' };
  }
  try {
    const exists = await branchExists(opts.branch, repo);
    if (!exists) return { exists: false, filesOnBranch: 0 };
    const cmp = await compareBranches(opts.branch, repo, repo.branch);
    return {
      exists: true,
      filesOnBranch: cmp.files.length,
      compareUrl: cmp.url,
    };
  } catch (e) {
    return {
      exists: false,
      filesOnBranch: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
