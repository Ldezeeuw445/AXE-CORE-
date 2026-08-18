/**
 * continuousMemoryService — single intake so every real interaction makes AXE smarter.
 *
 * Layers (right place for each kind of fact):
 *   1. memoryRecorder / global_memory  — stream of events (chat, tools, session)
 *   2. core_memory                     — what the Memory tab shows (durable, human-readable)
 *   3. RAG                             — semantic recall for next answers
 *   4. agent_memory                    — per-capability scratch (already in writeConversationMemory)
 *   5. preferences                     — standing user prefs (deduped keys)
 *
 * Design rules:
 *   - Never break the caller (all errors swallowed + logged)
 *   - Prefer signal over noise: every chat turn is kept, but classified
 *   - Preferences upsert; conversations append
 */

import { recordEvent } from '@/infrastructure/persistence/memoryRecorder';
import { saveMemory } from '@/infrastructure/persistence/coreDB';
import { saveRagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { saveGlobalMemory } from '@/infrastructure/persistence/globalMemoryService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

const DAY = () => new Date().toISOString().slice(0, 10);

/** Avoid flooding core_memory with near-identical lines in one session. */
const recentCoreHashes = new Set<string>();
const MAX_RECENT = 80;

function hashLine(s: string): string {
  const t = s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return String(h);
}

function rememberCoreOnce(content: string, tags: string[], importance: number, source: string): void {
  const h = hashLine(content);
  if (recentCoreHashes.has(h)) return;
  recentCoreHashes.add(h);
  if (recentCoreHashes.size > MAX_RECENT) {
    const first = recentCoreHashes.values().next().value;
    if (first) recentCoreHashes.delete(first);
  }
  void saveMemory(content, tags, importance, source).catch(() => {});
}

function isPreference(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(ik wil|ik wil graag|liever|liever niet|nooit|altijd|voorkeur|prefer|please always|don't ever|niet meer|voortaan|from now on)\b/.test(t) ||
    /\b(ik hou van|i like|i love|i prefer|i hate|ik haat)\b/.test(t)
  );
}

function isCorrection(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(nee dat klopt niet|fout|wrong|incorrect|juist is|bedoelde|i meant|niet zo|stop daarmee)\b/.test(t);
}

function isDecision(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(besloten|we doen|gaan we|decision|besluit|voortaan gebruiken we)\b/.test(t);
}

function isProjectSignal(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(axe|thinktank|trading|companion|axon|repo|branch|merge|deploy|widget|settings|memory)\b/.test(t);
}

/**
 * Every user↔AXE exchange. Call after a successful reply.
 * Lands in: event stream + core_memory + RAG (+ preference upsert when detected).
 */
export async function rememberChatTurn(opts: {
  userText: string;
  axeText: string;
  provider?: string;
  capability?: string;
}): Promise<void> {
  const q = (opts.userText || '').trim();
  const a = (opts.axeText || '').trim();
  if (!q && !a) return;

  const provider = opts.provider || 'unknown';
  const capability = opts.capability || 'all';
  const summary = q.slice(0, 160) || a.slice(0, 160);

  // 1) Append-only event stream (global_memory via recorder)
  recordEvent({
    kind: 'conversation',
    summary,
    details: {
      q: q.slice(0, 2000),
      a: a.slice(0, 3000),
      provider,
      capability,
      day: DAY(),
    },
    confidence: 0.85,
  });

  // 2) Always a readable core_memory line (Memory tab)
  const coreLine = [
    `Chat (${DAY()})`,
    q ? `Luka: ${q.slice(0, 280)}` : null,
    a ? `AXE: ${a.slice(0, 320)}` : null,
    provider !== 'unknown' ? `[${provider}]` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  let importance = 5;
  if (isPreference(q) || isPreference(a)) importance = 8;
  if (isCorrection(q)) importance = 9;
  if (isDecision(q) || isDecision(a)) importance = 8;
  if (isProjectSignal(q) || isProjectSignal(a)) importance = Math.max(importance, 6);

  rememberCoreOnce(
    coreLine,
    ['auto', 'conversation', capability !== 'all' ? capability : 'general', DAY()],
    importance,
    'conversation',
  );

  // 3) RAG for semantic recall on next turns
  try {
    if (q.length >= 12) {
      await saveRagMemory({
        category: 'conversation',
        content: `User said (${DAY()}): ${q.slice(0, 400)}`,
        importance: Math.min(10, importance),
        metadata: { provider, capability, role: 'user' },
      });
    }
    if (a.length >= 40) {
      await saveRagMemory({
        category: 'conversation',
        content: `AXE replied (${DAY()}): ${a.slice(0, 500)}`,
        importance: Math.min(9, importance),
        metadata: { provider, capability, role: 'axe' },
      });
    }
  } catch {
    /* */
  }

  // 4) Standing preferences → upsert global + strong core
  if (isPreference(q)) {
    const pref = q.slice(0, 240);
    recordEvent({
      kind: 'preference',
      summary: pref,
      details: { raw: q.slice(0, 1000), day: DAY() },
      confidence: 0.95,
      dedupeKey: hashLine(pref),
    });
    rememberCoreOnce(`Preference: ${pref}`, ['auto', 'preference', 'user'], 9, 'preference');
    try {
      await saveGlobalMemory({
        user_id: AXE_USER_ID,
        category: 'user_preference',
        key: `pref:${hashLine(pref)}`,
        value: pref,
        confidence: 0.95,
        metadata: { day: DAY(), source: 'chat' },
      });
    } catch {
      /* */
    }
  }

  if (isCorrection(q)) {
    recordEvent({
      kind: 'reflection',
      summary: `Correction: ${q.slice(0, 160)}`,
      details: { q: q.slice(0, 800), a: a.slice(0, 800) },
      confidence: 0.9,
    });
    rememberCoreOnce(`Correction from Luka: ${q.slice(0, 300)}`, ['auto', 'correction'], 9, 'reflection');
  }
}

/** Tool / agent / ThinkTank / code actions */
export function rememberAction(opts: {
  kind: 'tool_call' | 'agent_run' | 'insight' | 'error' | 'resource';
  summary: string;
  details?: Record<string, unknown>;
  toCore?: boolean;
  importance?: number;
}): void {
  const summary = (opts.summary || '').trim();
  if (!summary) return;
  recordEvent({
    kind: opts.kind,
    summary: summary.slice(0, 200),
    details: { ...(opts.details || {}), day: DAY() },
    confidence: opts.kind === 'error' ? 0.7 : 0.85,
  });
  if (opts.toCore !== false) {
    rememberCoreOnce(
      `${opts.kind}: ${summary.slice(0, 400)}`,
      ['auto', opts.kind, DAY()],
      opts.importance ?? (opts.kind === 'error' ? 6 : 5),
      opts.kind,
    );
  }
}

/** Once per calendar day when the app is opened / focused */
export function rememberSessionOpen(): void {
  const day = DAY();
  recordEvent({
    kind: 'session',
    summary: `Session open ${day}`,
    details: {
      day,
      href: typeof location !== 'undefined' ? location.href : '',
      ts: Date.now(),
    },
    confidence: 1,
    dedupeKey: `open:${day}`,
  });
  // Durable guard, not the in-memory one. rememberCoreOnce dedupes against a
  // Set that lives in the JS context, so every reload -- every app launch,
  // every WebView refresh on the phone -- started with an empty cache and
  // wrote this line again. That is how 995 of 1000 memories on the VPS ended
  // up being "Session started ... AXE present": 99.5% of the store was one
  // sentence, and real memories were being pushed out by it.
  const guardKey = 'axe:session-memo-day';
  try {
    if (localStorage.getItem(guardKey) === day) return;
    localStorage.setItem(guardKey, day);
  } catch {
    // Private mode / storage disabled: fall through and write. One line a
    // session is still better than losing the signal entirely.
  }

  rememberCoreOnce(
    `Session started ${day} — AXE present`,
    ['auto', 'session', day],
    4,
    'session',
  );
}

/** Install visibility / first-load hooks */
export function installContinuousMemory(): void {
  if (typeof window === 'undefined') return;
  try {
    rememberSessionOpen();
  } catch {
    /* */
  }
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      try {
        rememberSessionOpen();
      } catch {
        /* */
      }
    }
  };
  document.addEventListener('visibilitychange', onVis);
}
