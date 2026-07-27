/**
 * memoryDecayService.ts
 * ------------------------------------------------------------------
 * Weekly (or on-demand) pass over global memory:
 * - Entries never reinforced slowly lose confidence
 * - Entries that keep matching / being used get a small boost
 * - Very low-confidence stale noise can be pruned
 *
 * Designed to be called from a core_schedules cron action or manually
 * from Settings / Memory panel.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isAxeApiConfigured, sbRunSql } from '@/infrastructure/gateways/axeCoreApiService';
import { writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';

export interface DecayReport {
  scanned: number;
  decayed: number;
  reinforced: number;
  pruned: number;
  at: string;
}

const HALF_LIFE_DAYS = 30;
const PRUNE_BELOW = 0.12;
const MIN_AGE_DAYS_BEFORE_PRUNE = 14;

function decayFactor(ageDays: number): number {
  // exponential half-life
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * Run one decay/reinforce pass. Prefer axe_api SQL so service-role works.
 */
export async function runMemoryDecayPass(opts?: {
  reinforceKeys?: string[];
  dryRun?: boolean;
}): Promise<DecayReport> {
  const at = new Date().toISOString();
  const report: DecayReport = { scanned: 0, decayed: 0, reinforced: 0, pruned: 0, at };

  type Row = {
    id: string;
    key: string;
    confidence: number;
    updated_at: string;
    category: string;
  };

  let rows: Row[] = [];

  try {
    if (isAxeApiConfigured) {
      const data = await sbRunSql(`
        select id, key, confidence, updated_at, category
        from global_memory
        order by updated_at asc
        limit 500;
      `);
      rows = (Array.isArray(data) ? data : []) as Row[];
    } else {
      const sb = getSupabase();
      if (!sb) return report;
      // try both table names used historically
      let res = await sb.from('global_memory').select('id, key, confidence, updated_at, category').limit(500);
      if (res.error) {
        res = await sb.from('global_memories').select('id, key, confidence, updated_at, category').limit(500);
      }
      rows = (res.data || []) as Row[];
    }
  } catch (err) {
    console.error('[memoryDecay] load failed:', err);
    return report;
  }

  report.scanned = rows.length;
  const reinforce = new Set(opts?.reinforceKeys || []);
  const now = Date.now();

  for (const row of rows) {
    const updated = Date.parse(row.updated_at || at);
    const ageDays = Math.max(0, (now - (Number.isFinite(updated) ? updated : now)) / 86_400_000);
    let confidence = Number(row.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;

    let next = confidence;
    if (reinforce.has(row.key)) {
      next = Math.min(1, confidence + 0.08);
      report.reinforced++;
    } else if (ageDays > 3) {
      next = Math.max(0, confidence * decayFactor(ageDays));
      if (next < confidence - 0.01) report.decayed++;
    }

    const shouldPrune =
      next < PRUNE_BELOW && ageDays >= MIN_AGE_DAYS_BEFORE_PRUNE && row.category !== 'user_preference';

    if (opts?.dryRun) continue;

    try {
      if (shouldPrune) {
        if (isAxeApiConfigured) {
          await sbRunSql(`delete from global_memory where id = '${row.id}';`);
        } else {
          const sb = getSupabase();
          await sb?.from('global_memory').delete().eq('id', row.id);
        }
        report.pruned++;
      } else if (Math.abs(next - confidence) > 0.01) {
        if (isAxeApiConfigured) {
          await sbRunSql(`
            update global_memory
            set confidence = ${next.toFixed(4)}, updated_at = now()
            where id = '${row.id}';
          `);
        } else {
          const sb = getSupabase();
          await sb?.from('global_memory').update({ confidence: next, updated_at: at }).eq('id', row.id);
        }
      }
    } catch (err) {
      console.warn('[memoryDecay] row update failed', row.id, err);
    }
  }

  // Log the pass into Obsidian so the history is visible
  try {
    await writeObsidianNote({
      path: `AXE/System/memory-decay-${at.slice(0, 10)}.md`,
      title: `Memory decay ${at.slice(0, 10)}`,
      content: [
        `## Memory decay pass`,
        `**At:** ${at}`,
        `**Scanned:** ${report.scanned}`,
        `**Decayed:** ${report.decayed}`,
        `**Reinforced:** ${report.reinforced}`,
        `**Pruned:** ${report.pruned}`,
        '',
        '[[Memory]] [[System]]',
      ].join('\n'),
      tags: ['system', 'memory-decay'],
      source: 'system',
      metadata: { ...report },
    });
  } catch {
    /* non-fatal */
  }

  return report;
}
