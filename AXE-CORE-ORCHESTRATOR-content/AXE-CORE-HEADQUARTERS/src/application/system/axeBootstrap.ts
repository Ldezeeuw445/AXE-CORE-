/**
 * axeBootstrap.ts — one-shot session startup helpers.
 * Safe to call from App after auth; all work is fire-and-forget / non-blocking.
 */

import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { listRecentObsidianNotes, writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { runConversationReview } from '@/infrastructure/persistence/conversationReviewService';
import { maybeRunMemoryManager } from '@/infrastructure/persistence/memoryManagerService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { PROVIDERS, type ProviderId } from '@/domain/providers';

const LS_GREETED = 'axe_boot_greeted_day';
const LS_SELF_HEAL = 'axe_boot_last_self_heal';
const SELF_HEAL_INTERVAL_MS = 30 * 60_000;
const LS_WELCOME = 'axe_obsidian_welcome_seeded';
const LS_REVIEW = 'axe_boot_last_review';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fetches today's Daily Briefing content (written by the VPS cron job,
 *  core_schedules "Daily Briefing" + notify:true) if one landed today —
 *  real data, not fabricated. Returns null if none exists yet (e.g. app
 *  opened before the 08:00 run, or the job hasn't fired today). */
export async function loadTodaysBriefing(): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data } = await sb
      .from('core_notifications')
      .select('message, created_at')
      .gte('created_at', since.toISOString())
      .ilike('message', 'Daily Briefing:%')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.message) return null;
    // Strip the "Daily Briefing: " prefix _run_schedule_action's generic
    // notify wrapper adds — the greeting already implies what this is.
    return data.message.replace(/^Daily Briefing:\s*/i, '').trim() || null;
  } catch {
    return null;
  }
}

/** Once per calendar day, on Tauri main window: spoken greeting — the real
 *  Daily Briefing content when one landed today, a generic line otherwise. */
export async function maybeDailyGreeting(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    if (localStorage.getItem(LS_GREETED) === todayKey()) return;
    localStorage.setItem(LS_GREETED, todayKey());
  } catch {
    return;
  }

  // Same provider choice as chat (Settings → Voice) — Fish Audio by default
  // (no paid ElevenLabs account), straight to browser speech otherwise.
  const hour = new Date().getHours();
  const part =
    hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  const briefing = await loadTodaysBriefing();
  const line = briefing ? `${part}, Luka. ${briefing}` : `${part}, Luka. AXE is online.`;

  try {
    // Don't force speak mode if user prefers type-only
    try {
      if (localStorage.getItem('axe_response_mode') === 'type') return;
    } catch { /* continue */ }

    let ttsProvider: 'fish' | 'elevenlabs' | 'browser' = 'fish';
    try { ttsProvider = (localStorage.getItem('axe_tts_provider') as typeof ttsProvider) || 'fish'; } catch { /* continue */ }

    const { speakWithBrowser } = await import('@/infrastructure/gateways/elevenLabsService');

    await new Promise<void>((resolve) => {
      if (ttsProvider === 'fish') {
        void import('@/infrastructure/gateways/fishAudioService').then(({ speakWithFishAudio, isFishAudioConfigured }) => {
          if (isFishAudioConfigured()) { void speakWithFishAudio(line, resolve, () => speakWithBrowser(line, resolve)); return; }
          speakWithBrowser(line, resolve);
        });
        return;
      }
      if (ttsProvider === 'elevenlabs') {
        void import('@/infrastructure/gateways/elevenLabsService').then(({ speakWithElevenLabs }) => {
          speakWithElevenLabs(line, resolve, () => speakWithBrowser(line, resolve));
        });
        return;
      }
      speakWithBrowser(line, resolve);
    });
  } catch {
    /* non-fatal */
  }
}

/** Once per calendar day: AXE scores a handful of its own recent replies
 *  (real messages, real multi-provider call) and writes a reflection for
 *  anything it flags. Honest limitation, same as the greeting/decay above:
 *  only runs while the app is actually open — no server-side cron for this
 *  yet, so a day with the app never opened just skips silently. */
export async function maybeNightlyReview(): Promise<void> {
  try {
    if (localStorage.getItem(LS_REVIEW) === todayKey()) return;
    localStorage.setItem(LS_REVIEW, todayKey());
  } catch {
    return;
  }

  try {
    await runConversationReview(6);
  } catch (err) {
    console.warn('[axeBootstrap] nightly review skipped:', err);
  }
}

/** Seed a single welcome note the first time the Obsidian store is empty. */
export async function maybeSeedObsidianWelcome(): Promise<void> {
  try {
    if (localStorage.getItem(LS_WELCOME) === '1') return;
  } catch { /* continue */ }

  try {
    const existing = await listRecentObsidianNotes(5);
    if (existing.length > 0) {
      try { localStorage.setItem(LS_WELCOME, '1'); } catch { /* */ }
      return;
    }

    await writeObsidianNote({
      path: 'AXE/System/welcome.md',
      title: 'Welcome — co-founder memory',
      content: [
        '## AXE co-founder memory is live',
        '',
        'This store is **session-agnostic**: every chat, approval, and reflection',
        'can write here via Supabase (`core_obsidian_notes`).',
        '',
        '### Folders',
        '- **Reflections** — auto after approve / deny / auto-run',
        '- **Decisions** — important choices you (or AXE) record',
        '- **Preferences** — how you like things done',
        '- **Projects** — ongoing context',
        '- **System** — decay reports, boot notes',
        '',
        '### Tips',
        '- Open **Obsidian** in the nav, or ask chat to open it',
        '- Use tags and `[[wikilinks]]` to connect notes',
        '- Chat already injects matching notes into context',
        '',
        '[[Memory]] [[System]]',
      ].join('\n'),
      tags: ['system', 'welcome'],
      source: 'system',
    });
    try { localStorage.setItem(LS_WELCOME, '1'); } catch { /* */ }
  } catch (err) {
    console.warn('[axeBootstrap] welcome seed skipped (table missing?):', err);
  }
}

/**
 * Quiet health probe for AXE's ★ Primary only — not every OK key in the grid.
 * Re-testing all working providers every 30 min was burning API calls and
 * flipping Settings cards red on transient 502s. Primary is the only one that
 * must stay healthy for chat; everything else is manual Test or fail-retry.
 */
export async function maybeSelfHealCheck(): Promise<void> {
  try {
    const last = localStorage.getItem(LS_SELF_HEAL);
    if (last && Date.now() - Date.parse(last) < SELF_HEAL_INTERVAL_MS) return;
    localStorage.setItem(LS_SELF_HEAL, new Date().toISOString());
  } catch {
    return;
  }

  let primary: { provider?: string; key?: string; model?: string; baseUrl?: string } | null = null;
  try {
    primary = JSON.parse(localStorage.getItem('axe_slot_primary') ?? 'null');
  } catch {
    return;
  }
  if (!primary?.provider) return;

  let conns: Record<string, { key?: string; model?: string; baseUrl?: string; lastTest?: string }>;
  try {
    conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}');
  } catch {
    return;
  }

  const id = primary.provider;
  const conn = conns[id] ?? {};
  const key = primary.key || conn.key;
  // Only re-probe if this provider was known working — already-fail stays fail
  // until Luka hits Test manually (or we recover below for fail→ok).
  if (!key) return;
  if (conn.lastTest === 'fail') {
    // Optional recovery probe for a previously failed primary
  } else if (conn.lastTest !== 'ok') {
    return; // never tested — leave it to Settings first open
  }

  const cfg = PROVIDERS.find(p => p.id === id);
  if (!cfg) return;

  const { useVoiceStore } = await import('@/presentation/store/voiceStore');
  const testSlot = useVoiceStore.getState().testSlot;

  let ok = false;
  try {
    ok = await testSlot({
      provider: id as ProviderId,
      key,
      model: primary.model || conn.model || cfg.defaultModel,
      baseUrl: primary.baseUrl || conn.baseUrl || cfg.baseUrl,
    });
  } catch {
    ok = false;
  }

  if (ok) {
    if (conn.lastTest !== 'ok') {
      conns[id] = { ...conn, lastTest: 'ok' };
      try { localStorage.setItem('axe_llm_connections', JSON.stringify(conns)); } catch { /* */ }
    }
    return;
  }

  // Primary went down
  conns[id] = { ...conn, lastTest: 'fail' };
  try { localStorage.setItem('axe_llm_connections', JSON.stringify(conns)); } catch { /* */ }

  const title = `${cfg.name} (Primair) is niet meer bereikbaar`;
  const detail = `AXE's chat-provider faalt bij de stille achtergrondcheck. Check de key in Settings of kies een andere Primair.`;

  try {
    const sb = getSupabase();
    await sb?.from('core_notifications').insert({
      type: 'warning',
      message: `${title}: ${detail}`,
    });
  } catch { /* non-fatal */ }

  try {
    await writeObsidianNote({
      path: `AXE/Reflections/self-heal-${id}-${Date.now()}.md`,
      title: `Reflection: ${title}`,
      content: [
        `## ${title}`,
        '',
        `**When:** ${new Date().toISOString()}`,
        '**Outcome:** failed',
        '**Category:** self_heal',
        '',
        '### What happened',
        detail,
        '',
        '[[Reflections]]',
      ].join('\n'),
      tags: ['reflection', 'failed', 'self_heal'],
      source: 'reflection',
      metadata: { outcome: 'failed', category: 'self_heal', provider: id },
    });
  } catch { /* non-fatal */ }
}

/** Run all bootstraps after the user is authenticated. Non-blocking. */
export function runAxeBootstrap(): void {
  void maybeSeedObsidianWelcome();
  void maybeNightlyReview();
  void maybeSelfHealCheck();
  // Memory Manager: extract durable facts, consolidate library, write report
  maybeRunMemoryManager();
  // maybeSelfHealCheck is itself interval-gated (SELF_HEAL_INTERVAL_MS via
  // LS_SELF_HEAL), but runAxeBootstrap only fires once per app launch — this
  // is the difference between "checked every 30 min" and "checked once,
  // then never again until you restart the app". A long-running session
  // (the whole point of leaving the app open) needs the repeat trigger.
  setInterval(() => { void maybeSelfHealCheck(); }, SELF_HEAL_INTERVAL_MS);
  // Slight delay so the window paints before TTS
  setTimeout(() => { void maybeDailyGreeting(); }, 1200);
}
