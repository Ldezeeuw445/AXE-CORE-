/**
 * langGraphOrchestrator.ts
 *
 * LangGraph StateGraph that orchestrates multi-provider LLM calls with automatic
 * retry logic. This is the active AXE CORE orchestrator.
 *
 * Architecture:
 *   START → callNode → (response?) → END
 *               ↑___________| (on error: slotIndex++ and retry)
 *
 * callFn is passed in (dependency injection) to avoid circular imports with voiceStore.
 */

import { StateGraph, Annotation } from '@langchain/langgraph';

/* ── Types ─────────────────────────────────────────────────────────────── */
export type LGMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LGSlot    = { provider: string; key: string; model?: string; baseUrl?: string };
export type LGCallFn  = (slot: LGSlot, messages: LGMessage[]) => Promise<string>;

export interface OrchestrationResult {
  response: string;
  slot: LGSlot;
}

/* ── State definition ───────────────────────────────────────────────────── */
const State = Annotation.Root({
  messages:    Annotation<LGMessage[]>({ default: () => [],   reducer: (_c, n: LGMessage[]) => n }),
  slots:       Annotation<LGSlot[]>({ default: () => [],      reducer: (_c, n: LGSlot[]) => n }),
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
 * Orchestrate an LLM call across multiple provider slots using LangGraph.
 * Automatically retries with the next slot on failure.
 * Falls back gracefully (returns null) if all slots fail.
 */
export async function orchestrate(
  messages: LGMessage[],
  slots: LGSlot[],
  callFn: LGCallFn,
): Promise<OrchestrationResult | null> {
  if (slots.length === 0) return null;

  _callFn = callFn;
  try {
    const result = await graph.invoke({ messages, slots, slotIndex: 0 });
    if (result.response && result.activeSlot) {
      return { response: result.response, slot: result.activeSlot };
    }
    return null;
  } finally {
    _callFn = null;
  }
}
