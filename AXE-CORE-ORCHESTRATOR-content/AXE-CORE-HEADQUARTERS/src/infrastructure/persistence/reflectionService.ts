/**
 * reflectionService.ts
 * ------------------------------------------------------------------
 * After a completed/approved action, AXE writes a short reflection:
 * what worked, what Luka corrected, what to remember next time.
 * Lands in global_memory (for routing) AND core_obsidian_notes
 * (for browsable co-founder history).
 */

import { recordEvent } from '@/infrastructure/persistence/memoryRecorder';
import { writeObsidianNote, notePathFromTitle } from '@/infrastructure/persistence/obsidianMemoryService';

export interface ReflectionInput {
  /** Short title, e.g. "Approved EXEC systemctl status" */
  title: string;
  /** What AXE tried / what happened */
  whatHappened: string;
  /** Optional: what Luka corrected or preferred */
  correction?: string;
  /** Optional: lesson for next time */
  lesson?: string;
  /** Tool / category that triggered this */
  category?: string;
  /** Outcome */
  outcome: 'approved' | 'denied' | 'auto_run' | 'completed' | 'failed';
}

/**
 * Persist a reflection. Safe to fire-and-forget from the approval path.
 */
export async function writeReflection(input: ReflectionInput): Promise<void> {
  const now = new Date().toISOString();
  const body = [
    `## ${input.title}`,
    '',
    `**When:** ${now}`,
    `**Outcome:** ${input.outcome}`,
    input.category ? `**Category:** ${input.category}` : '',
    '',
    '### What happened',
    input.whatHappened.trim(),
    input.correction ? `\n### Luka's correction\n${input.correction.trim()}` : '',
    input.lesson ? `\n### Lesson\n${input.lesson.trim()}` : '',
    '',
    '[[Reflections]]',
  ].filter(Boolean).join('\n');

  const path = notePathFromTitle(`Reflection ${input.title}`, 'AXE/Reflections');

  // Obsidian (browsable history)
  try {
    await writeObsidianNote({
      path,
      title: `Reflection: ${input.title}`,
      content: body,
      tags: ['reflection', input.outcome, ...(input.category ? [input.category] : [])],
      source: 'reflection',
      metadata: { outcome: input.outcome, category: input.category, at: now },
    });
  } catch (err) {
    console.warn('[reflection] Obsidian write failed:', err);
  }

  // Global memory (routing / context) — through the recorder rather than a
  // direct save, so a failed write gets retried instead of just warned
  // about and dropped.
  recordEvent({
    kind: 'reflection',
    summary: input.title,
    details: {
      title: input.title,
      outcome: input.outcome,
      category: input.category,
      what: input.whatHappened.slice(0, 500),
      correction: input.correction?.slice(0, 300),
      lesson: input.lesson?.slice(0, 300),
      at: now,
    },
    confidence: input.outcome === 'denied' || input.outcome === 'failed' ? 0.85 : 0.7,
  });
}

/**
 * Convenience: reflection after an approval-gated tool decision.
 */
export async function reflectOnToolDecision(
  toolId: string,
  detail: string,
  outcome: 'approved' | 'denied' | 'auto_run',
): Promise<void> {
  await writeReflection({
    title: `${toolId} ${outcome}`,
    whatHappened: detail.slice(0, 800),
    outcome,
    category: toolId,
    lesson:
      outcome === 'denied'
        ? 'Do not silently retry the same action. Ask Luka explicitly if still needed.'
        : outcome === 'approved'
        ? 'This pattern of action was acceptable — prefer the same clarity next time.'
        : 'Auto-run under trust ladder — stay visible via notifications.',
  });
}
