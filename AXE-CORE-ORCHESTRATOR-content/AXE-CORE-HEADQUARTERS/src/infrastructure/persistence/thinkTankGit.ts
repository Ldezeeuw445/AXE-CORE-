/**
 * Per-app ThinkTank branches — never commit agent work directly to main/orchestrator.
 * Convention: thinktank/<repo-id>/<slug>-<shortid>
 */
import type { RepoConfig } from '@/infrastructure/persistence/repoConfigService';

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
}

export function evaluateIntegrateHardChecks(opts: {
  patchesApplied: number;
  branch?: string | null;
  prUrl?: string | null;
  filesTouched?: string[];
}): IntegrateHardCheck[] {
  const checks: IntegrateHardCheck[] = [];
  checks.push({
    name: 'Code patches',
    pass: (opts.patchesApplied ?? 0) > 0,
    detail:
      (opts.patchesApplied ?? 0) > 0
        ? `${opts.patchesApplied} file patch(es) applied`
        : '0 patches — BUILD did not write code (check workspace / GitHub token)',
  });
  checks.push({
    name: 'ThinkTank branch',
    pass: !!(opts.branch && opts.branch.startsWith('thinktank/')),
    detail: opts.branch ? `Branch: ${opts.branch}` : 'No thinktank branch recorded',
  });
  checks.push({
    name: 'Files touched',
    pass: (opts.filesTouched?.length ?? 0) > 0,
    detail:
      (opts.filesTouched?.length ?? 0) > 0
        ? opts.filesTouched!.slice(0, 8).join(', ')
        : 'No files listed',
  });
  checks.push({
    name: 'Pull request',
    pass: !!opts.prUrl,
    detail: opts.prUrl ? opts.prUrl : 'No PR yet — open PR from ThinkTank or Merge flow',
  });
  return checks;
}
