/**
 * codeEditorAgent.ts
 *
 * AXE CORE Code Editor Specialist
 * -----------------------------
 * A dedicated agent for code editing across all 3 repos:
 * - AXE CORE (orchestrator branch)
 * - AXE Companion OS
 * - Trading OS
 *
 * This agent maintains context across edits, learns patterns,
 * and ensures consistency in code style.
 */

import { readFile, writeFile, findFile, detectRepo, listSourceFiles } from '@/services/githubCodeService';
import type { RepoConfig } from '@/pages/SettingsPage';
import { callProvider } from '@/infrastructure/llm/providerGateway';
import type { KeySlot } from '@/core/llm/types';
import { loadSetting, saveSetting } from '@/services/userSettingsService';

export interface CodeEditRequest {
  instruction: string;
  filePath?: string;
  repoHint?: string;
}

export interface CodeEditResult {
  success: boolean;
  repo: string;
  filePath: string;
  commitMessage: string;
  diff?: string;
  error?: string;
}

export interface EditHistory {
  timestamp: string;
  filePath: string;
  repo: string;
  instruction: string;
  success: boolean;
}

const EDIT_HISTORY_KEY = 'axe_code_edit_history';
const CODE_STYLE_KEY = 'axe_code_style_preferences';

/** Load edit history from localStorage/Supabase */
async function loadEditHistory(): Promise<EditHistory[]> {
  return await loadSetting<EditHistory[]>(EDIT_HISTORY_KEY, []);
}

/** Save edit history */
async function saveEditHistory(history: EditHistory[]) {
  localStorage.setItem(EDIT_HISTORY_KEY, JSON.stringify(history.slice(-100)));
  await saveSetting(EDIT_HISTORY_KEY, history.slice(-100));
}

/** Load learned code style preferences */
async function loadCodeStyle(): Promise<Record<string, string>> {
  return await loadSetting<Record<string, string>>(CODE_STYLE_KEY, {});
}

/** Build system prompt for the code editor agent */
function buildCodeEditorPrompt(repo: RepoConfig, filePath: string, currentContent: string, instruction: string, history: EditHistory[]): string {
  return `You are AXE CORE's Code Editor Specialist. You edit code with surgical precision.

RULES:
1. Apply ONLY the requested change — nothing more, nothing less
2. Preserve existing code style (indentation, quotes, formatting)
3. Maintain TypeScript types — never remove or weaken types
4. Keep imports organized — group by external/internal
5. Use Tailwind classes for styling — never inline styles unless necessary
6. Follow React best practices — hooks at top, handlers below
7. Add comments only when logic is complex

REPO: ${repo.label} (${repo.owner}/${repo.repo}:${repo.branch})
FILE: ${filePath}

RECENT EDITS IN THIS REPO:
${history.filter(h => h.repo === repo.id).slice(-5).map(h => `- ${h.filePath}: "${h.instruction}" (${h.success ? 'OK' : 'FAIL'})`).join('\n') || 'None yet'}

INSTRUCTION: "${instruction}"

Return ONLY the complete modified file content. No markdown fences, no explanations.`;
}

/** Execute a code edit across any of the 3 repos */
export async function executeCodeEdit(
  request: CodeEditRequest,
  llmSlot: KeySlot
): Promise<CodeEditResult> {
  const history = await loadEditHistory();

  try {
    // 1. Detect which repo to use
    const repo = detectRepo(request.repoHint || request.instruction);

    // 2. Find the file if path not given
    let filePath = request.filePath;
    if (!filePath) {
      filePath = await findFile(request.instruction, repo) ?? undefined;
      if (!filePath) {
        // Try to list files and find best match
        const files = await listSourceFiles(repo);
        const keywords = request.instruction.toLowerCase().split(/\s+/);
        const scored = files.map(f => {
          const name = f.split('/').pop()?.toLowerCase() ?? '';
          let score = 0;
          for (const kw of keywords) {
            if (name.includes(kw)) score += 10;
            if (f.toLowerCase().includes(kw)) score += 5;
          }
          return { path: f, score };
        }).sort((a, b) => b.score - a.score);

        if (scored[0]?.score > 5) {
          filePath = scored[0].path;
        } else {
          throw new Error(`Kan geen bestand vinden voor: "${request.instruction}". Wees specifieker, bv. "verander de kleur van de SettingsPage header".`);
        }
      }
    }

    // 3. Read current file
    const ghFile = await readFile(filePath, repo);

    // 4. Build prompt and call LLM
    const prompt = buildCodeEditorPrompt(repo, filePath, ghFile.content, request.instruction, history);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: prompt },
      { role: 'user', content: `Current file content:\n\n${ghFile.content}\n\nApply this change: "${request.instruction}"\n\nReturn the COMPLETE modified file. No explanations, no markdown code fences.` },
    ];

    let newContent = '';
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !newContent) {
      attempts++;
      try {
        const response = await callProvider(llmSlot, messages);
        // Clean up response
        newContent = response
          .replace(/^```[a-z]*\n?/im, '')
          .replace(/\n?```$/m, '')
          .trim();

        // Validate: must not be empty and should be reasonable length
        if (!newContent || newContent.length < 10) {
          newContent = '';
          continue;
        }

        // Validate: should contain some of the original content
        const originalLines = ghFile.content.split('\n').slice(0, 5).join('\n');
        if (!newContent.includes(originalLines.slice(0, 50)) && newContent.length < ghFile.content.length * 0.3) {
          // LLM might have returned only the changed part, not full file
          // Try again with stronger instruction
          messages.push({ role: 'assistant', content: response });
          messages.push({ role: 'user', content: 'You must return the COMPLETE file, not just the changed part. Return the full file content now.' });
          newContent = '';
          continue;
        }
      } catch {
        // Try next attempt
      }
    }

    if (!newContent) {
      throw new Error('AI kon de wijziging niet genereren na 3 pogingen.');
    }

    // 5. Generate commit message
    const commitMsg = `AXE CORE: ${request.instruction.slice(0, 72)}`;

    // 6. Write to GitHub
    await writeFile(filePath, newContent, ghFile.sha, commitMsg, repo);

    // 7. Record in history
    history.push({
      timestamp: new Date().toISOString(),
      filePath,
      repo: repo.id,
      instruction: request.instruction,
      success: true,
    });
    await saveEditHistory(history);

    // Generate diff
    const diff = generateDiff(ghFile.content, newContent);

    return {
      success: true,
      repo: repo.label,
      filePath,
      commitMessage: commitMsg,
      diff,
    };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // Record failure
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

/** Generate a simple diff for display */
function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff: string[] = [];

  // Simple LCS-based diff
  let i = 0, j = 0;
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

/** Get recent edit history for display */
export async function getRecentEdits(limit = 10): Promise<EditHistory[]> {
  const history = await loadEditHistory();
  return history.slice(-limit).reverse();
}

/** Get edit stats per repo */
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
