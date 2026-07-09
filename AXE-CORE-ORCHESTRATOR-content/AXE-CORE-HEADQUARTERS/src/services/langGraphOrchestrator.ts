/**
 * langGraphOrchestrator.ts
 *
 * LangGraph StateGraph that is the single brain of AXE CORE, matching the
 * architecture diagram:
 *
 *   USER → AXE CORE → LangGraph Orchestrator
 *                              │
 *              ┌───────────────┴───────────────┐
 *              ▼                               ▼
 *   BRANCH A: VPS Ollama + local tools    BRANCH B: Kilo Code → cloud keys
 *   (OpenHands/OpenJarvis/OpenClaw/        (Anthropic/OpenAI/Gemini/
 *    Open Interpreter/n8n/Hermes)          OpenRouter/Groq)
 *              │                               │
 *              └───────────────┬───────────────┘
 *                              ▼
 *                   AXE CORE ANSWER & APPROVAL → USER
 *
 * The orchestrator is the ONLY decider: it classifies the request, picks the
 * branch (local-first for privacy/code, cloud-first for deep reasoning), then
 * runs the provider retry loop. All results flow back through it.
 *
 * callFn is passed in (dependency injection) to avoid circular imports.
 */

import { StateGraph, Annotation } from '@langchain/langgraph';

/* ── Types ─────────────────────────────────────────────────────────────── */
export type LGMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LGSlot    = { provider: string; key: string; model?: string; baseUrl?: string };
export type LGCallFn  = (slot: LGSlot, messages: LGMessage[]) => Promise<string>;

export type Branch = 'local' | 'cloud' | 'auto';

const LOCAL_PROVIDERS  = new Set(['ollama', 'openhandss']);
const CLOUD_PROVIDERS  = new Set(['anthropic', 'openai', 'google', 'groq', 'openrouter']);

const LOCAL_HINT = /\b(lokaal|local|private|prive|password|wachtwoord|secret|geheim|credentials|code|bug|refactor|component|deploy|docker|script|terminal|server|vps)\b/i;
const CLOUD_HINT = /\b(analyse|research|strateg|vergelijk|compare|architect|roadmap|waarom|why|calculate|bereken|brainstorm|copywriting|marketing|concurrentie)\b/i;

/**
 * Decide which branch LangGraph should prefer for this request.
 *  - 'local'  → run on the VPS via Ollama / local agent tools (privacy, code, infra)
 *  - 'cloud'  → route through Kilo Code to cloud LLM keys (deep reasoning, research)
 *  - 'auto'   → no strong signal; keep the caller's slot ordering
 */
export function classifyBranch(query: string, slots: LGSlot[]): Branch {
  const hasLocal  = slots.some((s) => LOCAL_PROVIDERS.has(s.provider));
  const hasCloud  = slots.some((s) => CLOUD_PROVIDERS.has(s.provider));
  if (!hasLocal)  return 'cloud';
  if (!hasCloud)  return 'local';

  // Privacy / local-execution keywords always force the local branch.
  if (LOCAL_HINT.test(query)) return 'local';
  if (CLOUD_HINT.test(query)) return 'cloud';
  return 'auto';
}

/** Re-order slots so the chosen branch is tried first. */
export function orderSlotsForBranch(slots: LGSlot[], branch: Branch): LGSlot[] {
  if (branch === 'auto') return slots;
  const want = branch === 'local' ? LOCAL_PROVIDERS : CLOUD_PROVIDERS;
  const preferred = slots.filter((s) => want.has(s.provider));
  const rest = slots.filter((s) => !want.has(s.provider));
  return [...preferred, ...rest];
}

export interface OrchestrationResult {
  response: string;
  slot: LGSlot;
  branch: Branch;
}

/* ── State definition ───────────────────────────────────────────────────── */
const State = Annotation.Root({
  messages:    Annotation<LGMessage[]>({ default: () => [],   reducer: (_c, n: LGMessage[]) => n }),
  slots:       Annotation<LGSlot[]>({ default: () => [],      reducer: (_c, n: LGSlot[]) => n }),
  branch:      Annotation<Branch>({ default: () => 'auto',    reducer: (_c, n: Branch) => n }),
  slotIndex:   Annotation<number>({ default: () => 0,         reducer: (_c, n: number) => n }),
  response:    Annotation<string | null>({ default: () => null, reducer: (_c, n: string | null) => n }),
  activeSlot:  Annotation<LGSlot | null>({ default: () => null, reducer: (_c, n: LGSlot | null) => n }),
  lastError:   Annotation<string>({ default: () => '',        reducer: (_c, n: string) => n }),
});

/* ── Module-level callFn ref (safe for single-user browser) ─────────────── */
let _callFn: LGCallFn | null = null;

/* ── Node: call one provider slot ───────────────────────────────────────── */
async function callNode(state: typeof State.State): Promise<Partial<typeof State.State>> {
  if (!_callFn) return { lastError: 'callFn not set' };

  const slot = state.slots[state.slotIndex];
  if (!slot) return { lastError: 'All providers exhausted', response: null };

  try {
    const reply = await _callFn(slot, state.messages);
    console.debug(`[LangGraph] ✓ ${slot.provider}/${slot.model}`);
    return { response: reply.trim(), activeSlot: slot };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[LangGraph] ✗ ${slot.provider}/${slot.model}: ${msg}`);
    return { slotIndex: state.slotIndex + 1, lastError: msg };
  }
}

/* ── Conditional edge: retry or end ─────────────────────────────────────── */
function shouldRetry(state: typeof State.State): 'retry' | 'done' {
  if (state.response !== null) return 'done';
  if (state.slotIndex >= state.slots.length) return 'done';
  return 'retry';
}

/* ── Compiled graph (module-level, created once) ────────────────────────── */
const graph = new StateGraph(State)
  .addNode('call', callNode)
  .addEdge('__start__', 'call')
  .addConditionalEdges('call', shouldRetry, { retry: 'call', done: '__end__' })
  .compile();

/* ── Public API ─────────────────────────────────────────────────────────── */
/**
 * Orchestrate an LLM call across provider slots using LangGraph.
 * The branch is decided up-front (classifyBranch) and slots are re-ordered so
 * the chosen branch is tried first — keeping LangGraph as the single decider.
 * Falls back gracefully (returns null) if all slots fail.
 */
export async function orchestrate(
  messages: LGMessage[],
  slots: LGSlot[],
  callFn: LGCallFn,
  opts: { branch?: Branch; query?: string } = {},
): Promise<OrchestrationResult | null> {
  if (slots.length === 0) return null;

  const branch: Branch = opts.branch
    ?? (opts.query ? classifyBranch(opts.query, slots) : 'auto');
  const ordered = orderSlotsForBranch(slots, branch);

  _callFn = callFn;
  try {
    const result = await graph.invoke({ messages, slots: ordered, slotIndex: 0, branch });
    if (result.response && result.activeSlot) {
      return { response: result.response, slot: result.activeSlot, branch };
    }
    return null;
  } finally {
    _callFn = null;
  }
}
