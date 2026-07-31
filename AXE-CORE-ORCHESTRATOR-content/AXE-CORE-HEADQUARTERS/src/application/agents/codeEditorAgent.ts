/**
 * codeEditorAgent.ts — surgical edits across configured GitHub repos.
 * Flow: resolve repo/path → (optional) confirm plan → write (direct or PR branch).
 */

import {
  readFile,
  writeFile,
  findFile,
  detectRepo,
  listSourceFiles,
  createBranch,
  createPullRequest,
  formatRepoTarget,
} from '@/infrastructure/gateways/githubCodeService';
import type { RepoConfig } from '@/infrastructure/persistence/repoConfigService';
import { getCodeWriteMode } from '@/infrastructure/persistence/repoConfigService';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

export interface CodeEditRequest {
  instruction: string;
  filePath?: string;
  repoHint?: string;
  /** Skip the confirmation gate (user already said yes / second turn). */
  confirmed?: boolean;
}

export interface CodeEditResult {
  success: boolean;
  repo: string;
  filePath: string;
  commitMessage: string;
  diff?: string;
  error?: string;
  needsConfirm?: boolean;
  confirmSummary?: string;
  prUrl?: string;
  branch?: string;
}

export interface EditHistory {
  timestamp: string;
  filePath: string;
  repo: string;
  instruction: string;
  success: boolean;
}

const EDIT_HISTORY_KEY = 'axe_code_edit_history';
const PENDING_EDIT_KEY = 'axe_pending_code_edit';

interface PendingEdit {
  instruction: string;
  filePath: string;
  repoId: string;
  repoLabel: string;
  branch: string;
  ownerRepo: string;
  createdAt: number;
}

async function loadEditHistory(): Promise<EditHistory[]> {
  return await loadSetting<EditHistory[]>(EDIT_HISTORY_KEY, []);
}

async function saveEditHistory(history: EditHistory[]) {
  localStorage.setItem(EDIT_HISTORY_KEY, JSON.stringify(history.slice(-100)));
  await saveSetting(EDIT_HISTORY_KEY, history.slice(-100));
}

function savePending(p: PendingEdit) {
  try {
    localStorage.setItem(PENDING_EDIT_KEY, JSON.stringify(p));
  } catch { /* ignore */ }
}

export function loadPendingEdit(): PendingEdit | null {
  try {
    const raw = localStorage.getItem(PENDING_EDIT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingEdit;
  } catch {
    return null;
  }
}

export function clearPendingEdit() {
  try {
    localStorage.removeItem(PENDING_EDIT_KEY);
  } catch { /* ignore */ }
}

function buildCodeEditorPrompt(
  repo: RepoConfig,
  filePath: string,
  instruction: string,
  history: EditHistory[],
): string {
  return `You are AXE CORE's Code Editor Specialist. You edit code with surgical precision.\n\nRULES:\n1. Apply ONLY the requested change\n2. Preserve existing code style\n3. Maintain TypeScript types\n4. Keep imports organized\n5. Follow existing styling patterns in the file\n\nREPO: ${repo.label} (${repo.owner}/${repo.repo}:${repo.branch})\nFILE: ${filePath}\n\nRECENT EDITS:\n${history.filter((h) => h.repo === repo.id).slice(-5).map((h) => `- ${h.filePath}: "${h.instruction}" (${h.success ? 'OK' : 'FAIL'})`).join('\n') || 'None yet'}\n\nINSTRUCTION: "${instruction}"\n\nReturn ONLY the complete modified file content. No markdown fences, no explanations.`;
}

async function resolveTarget(request: CodeEditRequest): Promise<{ repo: RepoConfig; filePath: string }> {
  const repo = detectRepo(request.repoHint || request.instruction);
  let filePath = request.filePath;
  if (!filePath) {
    filePath = (await findFile(request.instruction, repo)) ?? undefined;
    if (!filePath) {
      const files = await listSourceFiles(repo);
      const keywords = request.instruction.toLowerCase().split(/\s+/);
      const scored = files
        .map((f) => {
          const name = f.split('/').pop()?.toLowerCase() ?? '';
          let score = 0;
          for (const kw of keywords) {
            if (kw.length < 3) continue;
            if (name.includes(kw)) score += 10;
            if (f.toLowerCase().includes(kw)) score += 5;
          }
          return { path: f, score };
        })
        .sort((a, b) => b.score - a.score);

      if (scored[0]?.score > 5) filePath = scored[0].path;
      else {
        throw new Error(
          `Kan geen bestand vinden voor: "${request.instruction}". Wees specifieker, bv. "verander de header in SettingsPage.tsx".`,
        );
      }
    }
  }
  return { repo, filePath };
}

export async function executeCodeEdit(
  request: CodeEditRequest,
  llmSlot: KeySlot,
): Promise<CodeEditResult> {
  const history = await loadEditHistory();

  try {
    const { repo, filePath } = await resolveTarget(request);
    const targetLine = formatRepoTarget(repo, filePath);
    const writeMode = getCodeWriteMode();

    if (!request.confirmed) {
      const summary =
        `Ik ga dit wijzigen:\n` +
        `• Repo: ${repo.label} (${repo.owner}/${repo.repo})\n` +
        `• Branch: ${repo.branch}` +
        (writeMode === 'pr' ? ` → feature branch + PR naar ${repo.branch}` : ' (direct commit)') +
        `\n• File: ${filePath}\n` +
        `• Change: ${request.instruction}\n\n` +
        `Zeg "ja" of "doe maar" om door te gaan.`;

      savePending({
        instruction: request.instruction,
        filePath,
        repoId: repo.id,
        repoLabel: repo.label,
        branch: repo.branch,
        ownerRepo: `${repo.owner}/${repo.repo}`,
        createdAt: Date.now(),
      });

      // Fill fields so legacy agentic toolEditCode prints the plan clearly
      return {
        success: true,
        repo: repo.label,
        filePath,
        commitMessage: 'NEEDS_CONFIRM — wacht op ja van Luka',
        diff: summary,
        needsConfirm: true,
        confirmSummary: summary,
        branch: repo.branch,
      };
    }

    clearPendingEdit();

    const ghFile = await readFile(filePath, repo);
    const prompt = buildCodeEditorPrompt(repo, filePath, request.instruction, history);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content:
          `Current file content:\n\n${ghFile.content}\n\nApply this change: "${request.instruction}"\n\nReturn the COMPLETE modified file. No explanations, no markdown code fences.`,
      },
    ];

    let newContent = '';
    let attempts = 0;
    while (attempts < 3 && !newContent) {
      attempts++;
      try {
        const response = await callProvider(llmSlot, messages);
        newContent = response
          .replace(/^```[a-z]*\n?/im, '')
          .replace(/\n?```$/m, '')
          .trim();

        if (!newContent || newContent.length < 10) {
          newContent = '';
          continue;
        }

        const originalLines = ghFile.content.split('\n').slice(0, 5).join('\n');
        if (
          !newContent.includes(originalLines.slice(0, 50))
          && newContent.length < ghFile.content.length * 0.3
        ) {
          messages.push({ role: 'assistant', content: response });
          messages.push({
            role: 'user',
            content: 'You must return the COMPLETE file, not just the changed part.',
          });
          newContent = '';
        }
      } catch {
        /* retry */
      }
    }

    if (!newContent) throw new Error('AI kon de wijziging niet genereren na 3 pogingen.');

    const commitMsg = `AXE CORE: ${request.instruction.slice(0, 72)}`;
    let prUrl: string | undefined;
    let usedBranch = repo.branch;

    if (writeMode === 'pr') {
      const feature =
        `axe/edit-${Date.now().toString(36)}`.replace(/[^a-z0-9/_-]/gi, '-').slice(0, 60);
      await createBranch(feature, repo);
      const onFeature = await readFile(filePath, { ...repo, branch: feature });
      await writeFile(filePath, newContent, onFeature.sha, commitMsg, repo, feature);
      prUrl = await createPullRequest(
        commitMsg,
        `Automated edit via AXE.\n\n**Target:** ${targetLine}\n\n**Instruction:** ${request.instruction}`,
        feature,
        repo,
        repo.branch,
      );
      usedBranch = feature;
    } else {
      await writeFile(filePath, newContent, ghFile.sha, commitMsg, repo);
    }

    history.push({
      timestamp: new Date().toISOString(),
      filePath,
      repo: repo.id,
      instruction: request.instruction,
      success: true,
    });
    await saveEditHistory(history);

    return {
      success: true,
      repo: repo.label,
      filePath,
      commitMessage: commitMsg,
      diff: generateDiff(ghFile.content, newContent),
      prUrl,
      branch: usedBranch,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    history.push({
      timestamp: new Date().toISOString(),
      filePath: request.filePath || 'unknown',
      repo: request.repoHint || 'unknown',
      instruction: request.instruction,
      success: false,
    });
    await saveEditHistory(history);

    return {
      success: false,
      repo: request.repoHint || 'AXE CORE',
      filePath: request.filePath || 'unknown',
      commitMessage: '',
      error: errMsg,
    };
  }
}

export async function applyPendingCodeEdit(llmSlot: KeySlot): Promise<CodeEditResult> {
  const pending = loadPendingEdit();
  if (!pending) {
    return {
      success: false,
      repo: '—',
      filePath: '—',
      commitMessage: '',
      error: 'Geen openstaande wijziging om te bevestigen.',
    };
  }
  return executeCodeEdit(
    {
      instruction: pending.instruction,
      filePath: pending.filePath,
      repoHint: pending.repoId,
      confirmed: true,
    },
    llmSlot,
  );
}

function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff: string[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) {
      diff.push(`+ ${newLines[j]}`);
      j++;
    } else {
      diff.push(`- ${oldLines[i]}`);
      i++;
    }
  }
  return diff.slice(0, 50).join('\n');
}

export async function getRecentEdits(limit = 10): Promise<EditHistory[]> {
  const history = await loadEditHistory();
  return history.slice(-limit).reverse();
}

export async function getEditStats(): Promise<Record<string, { total: number; successful: number }>> {
  const history = await loadEditHistory();
  const stats: Record<string, { total: number; successful: number }> = {};
  for (const edit of history) {
    if (!stats[edit.repo]) stats[edit.repo] = { total: 0, successful: 0 };
    stats[edit.repo].total++;
    if (edit.success) stats[edit.repo].successful++;
  }
  return stats;
}
