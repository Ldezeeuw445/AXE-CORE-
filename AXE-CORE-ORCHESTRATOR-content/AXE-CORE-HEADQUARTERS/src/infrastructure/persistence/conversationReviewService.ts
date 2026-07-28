/**
 * conversationReviewService.ts
 * ------------------------------------------------------------------
 * AXE grading its own recent replies — the one genuinely new idea from
 * the external "unified self-improvement" doc that wasn't already covered
 * by the reflection loop (which reflects on tool DECISIONS, not on the
 * quality of what AXE actually said). Built on real infrastructure only:
 * the real `messages` table, the real multi-provider callProvider, and
 * the existing reflectionService (Obsidian + global_memory) for anything
 * flagged — no parallel tables, no hardcoded single provider.
 *
 * Deliberately does NOT auto-open a GitHub PR on a low score — proposing
 * unreviewed code changes from an unattended nightly pass is a bigger,
 * separate decision than scoring conversation quality. A flagged review
 * becomes a reflection AXE (and Luka) can read, same as any other lesson.
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';

// infrastructure/ may not import the presentation-layer voiceStore — read
// the same localStorage keys it persists to directly instead (mirrors
// voiceStore's own loadSlot helper).
function loadKeySlot(name: string): KeySlot | null {
  try {
    const raw = localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as KeySlot) : null;
  } catch {
    return null;
  }
}

function loadConfiguredSlots(): KeySlot[] {
  return [
    loadKeySlot('axe_slot_primary'),
    loadKeySlot('axe_slot_fallback1'),
    loadKeySlot('axe_slot_fallback2'),
    loadKeySlot('axe_slot_fallback3'),
  ].filter((s): s is KeySlot => !!s?.key);
}

interface MessageRow {
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Exchange {
  conversationId: string;
  userText: string;
  axeText: string;
  createdAt: string;
}

async function loadRecentExchanges(limit: number): Promise<Exchange[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('messages')
    .select('conversation_id,role,content,created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  const rows = (data ?? []) as MessageRow[];

  const byConv = new Map<string, MessageRow[]>();
  for (const r of rows) {
    const arr = byConv.get(r.conversation_id) ?? [];
    arr.push(r);
    byConv.set(r.conversation_id, arr);
  }

  const exchanges: Exchange[] = [];
  for (const [conversationId, msgs] of byConv) {
    const chrono = [...msgs].reverse(); // oldest first
    for (let i = 0; i < chrono.length - 1; i++) {
      if (chrono[i].role === 'user' && chrono[i + 1].role === 'assistant') {
        exchanges.push({
          conversationId,
          userText: chrono[i].content.slice(0, 1500),
          axeText: chrono[i + 1].content.slice(0, 1500),
          createdAt: chrono[i + 1].created_at,
        });
      }
    }
  }
  exchanges.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return exchanges.slice(0, limit);
}

const REVIEW_SYSTEM_PROMPT = `You are AXE's self-review process. You will be shown one real exchange — the user's actual message and AXE's actual reply. Score it honestly, without flattery:
{"clarity": 1-5, "correctness": 1-5, "proactiveness": 1-5, "flagged": true|false, "notes": "one sentence, only when flagged, describing what a better reply would have done differently"}
Flag it (flagged: true) if ANY score is 3 or lower. Respond ONLY with the JSON object, no markdown fences, no other text.`;

function parseReview(raw: string): { clarity: number; correctness: number; proactiveness: number; flagged: boolean; notes?: string } | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(cleaned);
    if ([parsed.clarity, parsed.correctness, parsed.proactiveness].every((n) => typeof n === 'number')) {
      return parsed;
    }
  } catch { /* skip malformed */ }
  return null;
}

/** Score up to `limit` recent real exchanges, log every score, and write a
 *  reflection for anything flagged. Uses whatever provider slots are
 *  already configured (Settings) — no separate API key required. */
export async function runConversationReview(limit = 6): Promise<{ reviewed: number; flagged: number }> {
  const sb = getSupabase();
  if (!sb) return { reviewed: 0, flagged: 0 };

  const slots = loadConfiguredSlots();
  if (slots.length === 0) return { reviewed: 0, flagged: 0 };

  const exchanges = await loadRecentExchanges(limit);
  let reviewed = 0;
  let flagged = 0;

  for (const ex of exchanges) {
    const messages = [
      { role: 'system' as const, content: REVIEW_SYSTEM_PROMPT },
      { role: 'user' as const, content: `User message:\n${ex.userText}\n\nAXE's reply:\n${ex.axeText}` },
    ];

    let review: ReturnType<typeof parseReview> = null;
    for (const slot of slots) {
      try {
        const raw = await callProvider(slot, messages);
        review = parseReview(raw);
        if (review) break;
      } catch { /* try next slot */ }
    }
    if (!review) continue;

    reviewed++;
    await sb.from('core_conversation_reviews').insert({
      conversation_id: ex.conversationId,
      user_excerpt: ex.userText.slice(0, 500),
      axe_excerpt: ex.axeText.slice(0, 500),
      clarity_score: review.clarity,
      correctness_score: review.correctness,
      proactiveness_score: review.proactiveness,
      flagged: review.flagged,
      notes: review.notes ?? null,
    });

    if (review.flagged) {
      flagged++;
      await writeReflection({
        title: `Self-review flagged a reply (clarity ${review.clarity}, correctness ${review.correctness}, proactiveness ${review.proactiveness})`,
        whatHappened: `User asked: "${ex.userText.slice(0, 300)}"\nAXE replied: "${ex.axeText.slice(0, 300)}"`,
        lesson: review.notes || 'Below AXE\'s own bar on at least one axis — review the exchange for what a sharper reply would have done.',
        outcome: 'failed',
        category: 'conversation_quality',
      });
    }
  }

  return { reviewed, flagged };
}
