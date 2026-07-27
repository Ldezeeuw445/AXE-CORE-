/**
 * axeBootstrap.ts — one-shot session startup helpers.
 * Safe to call from App after auth; all work is fire-and-forget / non-blocking.
 */

import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { listRecentObsidianNotes, writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { runMemoryDecayPass } from '@/infrastructure/persistence/memoryDecayService';

const LS_GREETED = 'axe_boot_greeted_day';
const LS_DECAY = 'axe_boot_last_decay';
const LS_WELCOME = 'axe_obsidian_welcome_seeded';

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

  // Prefer the same TTS path as chat; fall back to browser speech.
  const hour = new Date().getHours();
  const part =
    hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
  const line = `${part}, Luka. AXE is online.`;

  try {
    const { speakWithElevenLabs, speakWithBrowser } = await import(
      '@/infrastructure/gateways/elevenLabsService'
    );
    // Don't force speak mode if user prefers type-only
    try {
      if (localStorage.getItem('axe_response_mode') === 'type') return;
    } catch { /* continue */ }

    await new Promise<void>((resolve) => {
      speakWithElevenLabs(
        line,
        () => resolve(),
        () => speakWithBrowser(line, () => resolve()),
      );
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
  // Slight delay so the window paints before TTS
  setTimeout(() => { void maybeDailyGreeting(); }, 1200);
}
