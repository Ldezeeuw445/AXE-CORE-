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

import { 
  buildGlobalMemoryContext,
  recordAgentPerformance,
  recordProviderPerformance,
  recordSpecialistMatch,
  getBestSpecialist,
  logSystemEvent,
} from '@/services/globalMemoryService';
import { AXE_USER_ID } from '@/services/chatPersistence';

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
 * Uses global memory to learn which agents/providers work best for which tasks.
 */
export async function orchestrate(
  messages: LGMessage[],
  slots: LGSlot[],
  callFn: LGCallFn,
  opts: { branch?: Branch; query?: string } = {},
): Promise<OrchestrationResult | null> {
  if (slots.length === 0) return null;

  const query = opts.query || messages[messages.length - 1]?.content || '';
  
  // Try to use global memory to find best specialist first
  const capability = extractCapability(query);
  const bestSpecialist = await getBestSpecialist(AXE_USER_ID, capability).catch(() => null);
  
  if (bestSpecialist) {
    console.log(`[LangGraph] Global memory suggests specialist: ${bestSpecialist}`);
  }

  const branch: Branch = opts.branch ?? (query ? classifyBranch(query, slots) : 'auto');
  const ordered = orderSlotsForBranch(slots, branch);

  // If global memory has a preferred specialist, prioritize it
  let finalSlots = ordered;
  if (bestSpecialist) {
    const specialistSlot = ordered.find(s => s.provider === bestSpecialist || s.model?.includes(bestSpecialist));
    if (specialistSlot) {
      finalSlots = [specialistSlot, ...ordered.filter(s => s !== specialistSlot)];
    }
  }

  _callFn = callFn;
  const startTime = Date.now();
  
  try {
    await logSystemEvent(AXE_USER_ID, 'orchestration_start', { 
      branch, 
      capability,
      slots_count: finalSlots.length,
      query_preview: query.slice(0, 100)
    });
    
    const result = await graph.invoke({ messages, slots: finalSlots, slotIndex: 0, branch });
    const latency = Date.now() - startTime;
    
    if (result.response && result.activeSlot) {
      // Record success in global memory
      await recordProviderPerformance(AXE_USER_ID, result.activeSlot.provider, capability, true, latency);
      await recordSpecialistMatch(AXE_USER_ID, capability, result.activeSlot.provider, 0.8);
      await logSystemEvent(AXE_USER_ID, 'orchestration_success', { 
        provider: result.activeSlot.provider,
        model: result.activeSlot.model,
        latency,
        capability
      });
      
      return { response: result.response, slot: result.activeSlot, branch };
    }
    
    // All failed - record failures
    for (const slot of finalSlots) {
      await recordProviderPerformance(AXE_USER_ID, slot.provider, capability, false, latency);
    }
    await logSystemEvent(AXE_USER_ID, 'orchestration_failure', { 
      capability,
      latency,
      error: 'All providers exhausted'
    });
    
    return null;
  } finally {
    _callFn = null;
  }
}

/** Extract capability type from query for global memory matching */
function extractCapability(query: string): string {
  const t = query.toLowerCase();
  if (/\bcode\b|debug|function|typescript|javascript|python|react|bug|implement|refactor|component|endpoint|sql/.test(t)) return 'code';
  if (/\banalys|research|strateg|vergelijk|compare|architect|plan\b|roadmap/.test(t)) return 'analysis';
  if (/\bwhy|calculate|bereken|redeneer|pro\b|cons|voor- en nadelen/.test(t)) return 'reasoning';
  if (/\bschrijf|write|brainstorm|idee|creative|campaign|copywriting/.test(t)) return 'creative';
  if (/\bstatus|health|check|controleer|monitor|alert/.test(t)) return 'monitoring';
  if (/\bdeploy|build|docker|infra|server|vps| railway|vercel/.test(t)) return 'infra';
  if (/\btrade|buy|sell|price|market|crypto|stock|forex/.test(t)) return 'trading';
  if (/\bworkflow|automation|n8n|zapier|integratie/.test(t)) return 'automation';
  return 'general';
}
