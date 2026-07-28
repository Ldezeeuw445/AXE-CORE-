/**
 * axeBootstrap.ts — one-shot session startup helpers.
 * Safe to call from App after auth; all work is fire-and-forget / non-blocking.
 */

import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { listRecentObsidianNotes, writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { runMemoryDecayPass } from '@/infrastructure/persistence/memoryDecayService';
import { runConversationReview } from '@/infrastructure/persistence/conversationReviewService';

const LS_GREETED = 'axe_boot_greeted_day';
const LS_DECAY = 'axe_boot_last_decay';
const LS_WELCOME = 'axe_obsidian_welcome_seeded';
const LS_REVIEW = 'axe_boot_last_review';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Once per calendar day, on Tauri main window: short spoken greeting. */
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
  const line = `${part}, Luka. AXE is online.`;

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

/** If last decay pass was > 7 days ago, run one and log to Obsidian. */
export async function maybeWeeklyDecay(): Promise<void> {
  try {
    const last = localStorage.getItem(LS_DECAY);
    if (last) {
      const age = Date.now() - Date.parse(last);
      if (Number.isFinite(age) && age < 7 * 86_400_000) return;
    }
  } catch {
    return;
  }

  try {
    await runMemoryDecayPass();
    localStorage.setItem(LS_DECAY, new Date().toISOString());
  } catch (err) {
    console.warn('[axeBootstrap] weekly decay skipped:', err);
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

/** Run all bootstraps after the user is authenticated. Non-blocking. */
export function runAxeBootstrap(): void {
  void maybeSeedObsidianWelcome();
  void maybeWeeklyDecay();
  void maybeNightlyReview();
  // Slight delay so the window paints before TTS
  setTimeout(() => { void maybeDailyGreeting(); }, 1200);
}
