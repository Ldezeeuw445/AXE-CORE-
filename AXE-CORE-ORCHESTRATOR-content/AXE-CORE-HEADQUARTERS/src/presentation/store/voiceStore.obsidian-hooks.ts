/**
 * Drop-in helpers for voiceStore approval + memory context.
 * voiceStore imports these so the approval path always writes reflections
 * and every message gets Obsidian + global memory context.
 */
import { reflectOnToolDecision } from '@/infrastructure/persistence/reflectionService';
import { buildDurableMemoryContext } from '@/infrastructure/persistence/buildDurableMemoryContext';
import type { ApprovalKind } from '@/domain/tools/toolCatalog';

/** Fire-and-forget reflection after any approval decision. */
export function autoReflectApproval(
  kind: ApprovalKind,
  title: string,
  detail: string,
  outcome: 'approved' | 'denied' | 'auto_run',
): void {
  void reflectOnToolDecision(kind, `${title}\n${detail.slice(0, 600)}`, outcome);
}

/** System-prompt memory block (global + Obsidian). */
export async function durableContextForQuery(userId: string, query: string): Promise<string> {
  return buildDurableMemoryContext(userId, query, 2800);
}
