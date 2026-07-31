/**
 * Thin bridge so agentic tools use the confirm-before-write code editor agent.
 */
import type { KeySlot } from '@/domain/providers';
import {
  executeCodeEdit,
  applyPendingCodeEdit,
  loadPendingEdit,
} from '@/application/agents/codeEditorAgent';

export async function runEditCodeTool(
  args: Record<string, unknown>,
  slot: KeySlot,
): Promise<{ success: boolean; output: string; error?: string }> {
  const instruction = String(args.instruction || '');
  const filePath = args.filePath ? String(args.filePath) : undefined;
  const repoHint = args.repoHint ? String(args.repoHint) : undefined;
  const confirmed = args.confirmed === true || args.confirmed === 'true';

  // Short confirm phrases with a pending plan → apply
  if (!instruction && loadPendingEdit()) {
    const result = await applyPendingCodeEdit(slot);
    if (result.success) {
      return {
        success: true,
        output:
          `Applied edit to ${result.filePath} in ${result.repo}` +
          (result.branch ? ` on ${result.branch}` : '') +
          (result.prUrl ? `\nPR: ${result.prUrl}` : '') +
          (result.diff ? `\n\nDiff:\n${result.diff.slice(0, 1500)}` : ''),
      };
    }
    return { success: false, output: '', error: result.error || 'Apply failed' };
  }

  const result = await executeCodeEdit(
    { instruction, filePath, repoHint, confirmed },
    slot,
  );

  if (result.needsConfirm && result.confirmSummary) {
    return {
      success: true,
      output:
        `NEEDS_CONFIRM — do NOT write yet. Speak this plan to Luka and wait for "ja":\n\n${result.confirmSummary}`,
    };
  }

  if (result.success) {
    return {
      success: true,
      output:
        `Edited ${result.filePath} in ${result.repo}\n` +
        `Commit: ${result.commitMessage}` +
        (result.prUrl ? `\nPR: ${result.prUrl}` : '') +
        `\n\nDiff preview:\n${result.diff?.slice(0, 2000) || '(no diff)'}`,
    };
  }

  return { success: false, output: '', error: result.error || 'Code edit failed.' };
}
