import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import type { ApprovalKind } from '@/domain/tools/toolCatalog';
import { reflectOnToolDecision } from '@/infrastructure/persistence/reflectionService';

export interface TrustLevel {
  category: ApprovalKind;
  auto_approve: boolean;
  approved_count: number;
  denied_count: number;
  auto_run_count: number;
  last_decision_at: string | null;
}

/** Load the current trust levels for every approval-gated category. */
export async function loadTrustLevels(): Promise<TrustLevel[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('core_trust_levels').select('*').order('category');
  if (error) { console.warn('[trustLevelsService] loadTrustLevels:', error.message); return []; }
  return (data ?? []) as TrustLevel[];
}

/** Load a single category's current auto_approve flag — the only thing the
 *  approval gate needs to decide whether to skip the prompt. */
export async function isAutoApproved(category: ApprovalKind): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.from('core_trust_levels').select('auto_approve').eq('category', category).maybeSingle();
  return Boolean(data?.auto_approve);
}

/** Luka (only) flips this — never called from anywhere AXE itself drives. */
export async function setAutoApprove(category: ApprovalKind, autoApprove: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('core_trust_levels').update({ auto_approve: autoApprove, updated_at: new Date().toISOString() }).eq('category', category);
}

/** Every auto-run under a promoted category still posts a real notification
 *  — "auto" never means "invisible". */
export async function notifyAutoRun(category: ApprovalKind, title: string, detail: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('core_notifications').insert({
    type: 'info',
    title: `AXE deed dit automatisch: ${title}`,
    message: detail.slice(0, 500),
    source: `trust_auto_${category}`,
  });
}

/** Record the real outcome of an approval-gated action — manual decision or
 *  an auto-run under a promoted category. Powers the track record shown in
 *  Settings, which is what actually informs whether a category deserves to
 *  be promoted next. Also writes an Obsidian + global_memory reflection. */
export async function recordTrustDecision(category: ApprovalKind, outcome: 'approved' | 'denied' | 'auto_run'): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const column = outcome === 'approved' ? 'approved_count' : outcome === 'denied' ? 'denied_count' : 'auto_run_count';
    const { data } = await sb.from('core_trust_levels').select(column).eq('category', category).maybeSingle();
    const current = (data as Record<string, number> | null)?.[column] ?? 0;
    await sb.from('core_trust_levels')
      .update({ [column]: current + 1, last_decision_at: new Date().toISOString() })
      .eq('category', category);
  }

  // Durable co-founder history — fire-and-forget
  void reflectOnToolDecision(
    category,
    `Trust decision on category "${category}" → ${outcome}`,
    outcome,
  );
}
