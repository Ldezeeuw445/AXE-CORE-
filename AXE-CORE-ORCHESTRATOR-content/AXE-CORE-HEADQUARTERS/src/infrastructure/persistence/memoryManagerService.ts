/**
 * memoryManagerService.ts
 * ------------------------------------------------------------------
 * AXE Memory Manager — the self-improving loop.
 *
 * Responsibilities:
 *  - Read recent conversations / reflections
 *  - Extract durable facts into RAG + global memory
 *  - Consolidate noisy entries
 *  - Write co-founder notes into Obsidian with [[wikilinks]]
 *  - Record a consolidation report so the UI can show growth
 *
 * Safe to run fire-and-forget from bootstrap or after sessions.
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { AXE_USER_ID, APP_SOURCE } from '@/infrastructure/persistence/chatPersistence';
import { saveRagMemory, loadRagMemories } from '@/infrastructure/persistence/ragMemoryService';
import { saveGlobalMemory, loadGlobalMemories } from '@/infrastructure/persistence/globalMemoryService';
import {
  writeObsidianNote,
  listRecentObsidianNotes,
  notePathFromTitle,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';
import { vaultSyncAvailable, getVaultPath } from '@/infrastructure/persistence/obsidianVaultSyncService';

const LS_LAST_RUN = 'axe_memory_manager_last_run';
const LS_STATS = 'axe_memory_manager_stats';
const LS_OBSIDIAN_SYNC = 'axe_boot_last_obsidian_sync';

export type MemoryHealth = 'ok' | 'warning' | 'error';

export interface MemoryManagerReport {
  ranAt: string;
  factsExtracted: number;
  notesWritten: number;
  reflections: number;
  message: string;
  health: MemoryHealth;
  issues: string[];
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStats(): MemoryManagerReport | null {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS) || 'null');
  } catch {
    return null;
  }
}

function saveStats(report: MemoryManagerReport): void {
  try {
    localStorage.setItem(LS_STATS, JSON.stringify(report));
    localStorage.setItem(LS_LAST_RUN, report.ranAt);
  } catch {
    /* */
  }
}

export function getLastMemoryManagerReport(): MemoryManagerReport | null {
  return loadStats();
}

/** Heuristic fact extraction from recent chat rows — both roles now, not
 *  just the user's half of the conversation (an AXE reply can just as well
 *  contain a decision or a project fact worth remembering). */
async function loadRecentMessages(limit = 40): Promise<Array<{ role: string; content: string; created_at: string }>> {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data } = await sb
      .from('messages')
      .select('content, role, created_at, metadata')
      .eq('user_id', AXE_USER_ID)
      .order('created_at', { ascending: false })
      .limit(limit * 2);

    const rows = (data || []) as Array<{
      content: string;
      role: string;
      created_at: string;
      metadata?: Record<string, unknown> | null;
    }>;

    return rows
      .filter((r) => {
        const app = r.metadata?.app_source;
        if (app && app !== APP_SOURCE) return false;
        const minLen = r.role === 'user' ? 40 : 100;
        return (r.content || '').length > minLen;
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}

const PREFERENCE_RE =
  /\b(ik (hou van|wil|gebruik|prefer|prefereer|werk met|code in)|i (love|prefer|use|want|work with))\b/i;
const PROJECT_RE =
  /\b(project|app|website|repo|deploy|vercel|railway|obsidian|crewai|langgraph)\b/i;
const DECISION_RE =
  /\b(besluit|decision|voortaan|from now on|always|nooit meer|never again)\b/i;

async function extractFactsFromMessages(messages: Array<{ role: string; content: string }>): Promise<number> {
  let count = 0;
  const existing = await loadRagMemories(undefined, 1, 100).catch(() => []);
  const existingTexts = new Set(existing.map((m) => m.content.slice(0, 100).toLowerCase()));

  for (const { role, content: msg } of messages) {
    const slice = msg.slice(0, 280).trim();
    if (slice.length < 30) continue;
    const key = slice.slice(0, 100).toLowerCase();
    if (existingTexts.has(key)) continue;
    const who = role === 'user' ? 'Luka' : 'AXE';

    if (PREFERENCE_RE.test(msg)) {
      await saveRagMemory({
        category: 'user',
        content: `Preference signal (${who}): ${slice}`,
        importance: 7,
        metadata: { source: 'memory_manager', role },
      });
      existingTexts.add(key);
      count++;
      continue;
    }

    if (DECISION_RE.test(msg)) {
      await saveRagMemory({
        category: 'conversation',
        content: `Decision signal (${who}): ${slice}`,
        importance: 8,
        metadata: { source: 'memory_manager', role },
      });
      existingTexts.add(key);
      count++;
      continue;
    }

    if (PROJECT_RE.test(msg) && msg.length > 80) {
      await saveRagMemory({
        category: 'system',
        content: `Project/context (${who}): ${slice}`,
        importance: 6,
        metadata: { source: 'memory_manager', role },
      });
      existingTexts.add(key);
      count++;
    }
  }

  return count;
}

async function writeConsolidationNote(
  facts: number,
  notes: number,
): Promise<void> {
  const path = notePathFromTitle(`Memory consolidation ${todayKey()}`, 'AXE/System');
  await writeObsidianNote({
    path,
    title: `Memory consolidation — ${todayKey()}`,
    content: [
      `## Memory Manager report`,
      '',
      `**When:** ${new Date().toISOString()}`,
      `**Facts extracted:** ${facts}`,
      `**Notes touched:** ${notes}`,
      '',
      'AXE reviewed recent sessions, promoted durable signals into RAG,',
      'and kept Obsidian as the co-founder library.',
      '',
      '[[Memory]] [[System]] [[Reflections]]',
    ].join('\n'),
    tags: ['system', 'memory-manager', 'consolidation'],
    source: 'system',
    metadata: { type: 'memory_manager', facts, notes },
  });
}

/**
 * Real health signal, not the fixed "library healthy" string this used to
 * always show regardless of what actually happened. Checks the exact class
 * of bug this whole memory pipeline just got fixed for — a write path that
 * looks connected in code but produces zero rows — so a future regression
 * shows up here instead of silently recurring.
 */
async function checkMemoryHealth(): Promise<{ health: MemoryHealth; issues: string[] }> {
  const issues: string[] = [];
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const sinceIso = new Date(since).toISOString();

  const [globals, rag, notes] = await Promise.all([
    loadGlobalMemories(AXE_USER_ID, undefined, 300).catch(() => []),
    loadRagMemories(undefined, 1, 300).catch(() => []),
    listRecentObsidianNotes(100).catch(() => []),
  ]);

  let recentChatCount = 0;
  try {
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb
        .from('messages')
        .select('id')
        .eq('user_id', AXE_USER_ID)
        .gte('created_at', sinceIso)
        .limit(100);
      recentChatCount = data?.length ?? 0;
    }
  } catch {
    /* can't tell — don't flag on missing data */
  }

  const recentConversationMemories = globals.filter(
    (g) => g.category === 'conversation_context' && g.created_at && Date.parse(g.created_at) > since,
  ).length;
  if (recentChatCount >= 4 && recentConversationMemories === 0) {
    issues.push(
      `${recentChatCount} chatberichten in de laatste 24u, maar 0 nieuwe conversation_context-entries in global_memory — de chat→memory-koppeling lijkt weer stuk.`,
    );
  }

  if (globals.length === 0 && rag.length === 0 && notes.length === 0) {
    issues.push('global_memory, rag_memories en Obsidian-notes zijn alle drie leeg — de schrijf-funnel lijkt volledig stil te liggen.');
  }

  if (vaultSyncAvailable() && getVaultPath()) {
    try {
      const last = localStorage.getItem(LS_OBSIDIAN_SYNC);
      const ageMin = last ? (Date.now() - Date.parse(last)) / 60_000 : null;
      if (ageMin === null || ageMin > 90) {
        issues.push(
          ageMin === null
            ? 'Obsidian-vault is geconfigureerd maar is nog nooit automatisch gesynchroniseerd.'
            : `Obsidian-vault-sync is ${Math.round(ageMin)} minuten oud (verwacht elke ~15 min terwijl de app open is).`,
        );
      }
    } catch {
      /* */
    }
  }

  const health: MemoryHealth = issues.length === 0 ? 'ok' : issues.length === 1 ? 'warning' : 'error';
  return { health, issues };
}

/**
 * Run the Memory Manager once (idempotent per day unless force=true).
 */
export async function runMemoryManager(opts?: {
  force?: boolean;
}): Promise<MemoryManagerReport> {
  const force = opts?.force === true;
  try {
    const lastDay = localStorage.getItem(LS_LAST_RUN)?.slice(0, 10);
    if (!force && lastDay === todayKey()) {
      const prev = loadStats();
      if (prev) return prev;
    }
  } catch {
    /* continue */
  }

  let factsExtracted = 0;
  let notesWritten = 0;
  let reflections = 0;

  try {
    const messages = await loadRecentMessages(50);
    factsExtracted = await extractFactsFromMessages(messages);
  } catch (err) {
    console.warn('[memoryManager] fact extraction failed:', err);
  }

  try {
    // Promote high-confidence preferences into global_memory keys
    const prefs = await loadGlobalMemories(AXE_USER_ID, 'user_preference', 20);
    if (prefs.length === 0) {
      await saveGlobalMemory({
        user_id: AXE_USER_ID,
        category: 'user_preference',
        key: 'language',
        value: 'Dutch/English',
        confidence: 0.9,
      });
    }
  } catch {
    /* */
  }

  try {
    const recentNotes = await listRecentObsidianNotes(5);
    notesWritten = recentNotes.length;
    await writeConsolidationNote(factsExtracted, notesWritten);
    notesWritten += 1;
  } catch (err) {
    console.warn('[memoryManager] consolidation note failed:', err);
  }

  let health: MemoryHealth = 'ok';
  let issues: string[] = [];
  try {
    const checked = await checkMemoryHealth();
    health = checked.health;
    issues = checked.issues;
  } catch (err) {
    console.warn('[memoryManager] health check failed:', err);
  }

  try {
    await writeReflection({
      title: health === 'ok' ? 'Memory Manager cycle' : `Memory Manager cycle — ${health}`,
      whatHappened: `Extracted ${factsExtracted} durable signals from recent sessions and updated the co-founder library.`,
      correction: issues.length ? issues.join('\n') : undefined,
      lesson:
        health !== 'ok'
          ? 'Check the memory write funnel — a healthy day should not show these issues.'
          : factsExtracted > 0
          ? 'Keep promoting explicit preferences and decisions into RAG + Obsidian.'
          : 'Low signal day — wait for richer user messages before aggressive extraction.',
      outcome: health === 'ok' ? 'completed' : 'failed',
      category: 'memory_manager',
    });
    reflections = 1;
  } catch {
    /* */
  }

  // Same channel maybeSelfHealCheck already uses for provider outages — a
  // sick memory pipeline deserves the same visibility, not a number buried
  // in a panel nobody opened today.
  if (health !== 'ok') {
    try {
      const sb = getSupabase();
      await sb?.from('core_notifications').insert({
        type: health === 'error' ? 'error' : 'warning',
        message: `Memory health ${health}: ${issues.join(' · ')}`,
      });
    } catch {
      /* non-fatal */
    }
  }

  const report: MemoryManagerReport = {
    ranAt: new Date().toISOString(),
    factsExtracted,
    notesWritten,
    reflections,
    health,
    issues,
    message:
      health !== 'ok'
        ? `Memory health ${health}: ${issues[0]}`
        : factsExtracted > 0
        ? `Brain grew: +${factsExtracted} facts, library updated`
        : 'Brain reviewed — library healthy',
  };
  saveStats(report);
  return report;
}

/** Fire-and-forget daily run for bootstrap */
export function maybeRunMemoryManager(): void {
  void runMemoryManager({ force: false }).catch((err) =>
    console.warn('[memoryManager] skipped:', err),
  );
}
