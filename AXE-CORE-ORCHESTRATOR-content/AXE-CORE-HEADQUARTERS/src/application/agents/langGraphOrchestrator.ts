/**
 * langGraphOrchestrator.ts
 *
 * Single brain of AXE CORE routing:
 *
 *   USER → AXE CORE → Orchestrator
 *                            │
 *            ┌───────────────┴───────────────┐
 *            ▼                               ▼
 *   BRANCH A: VPS Ollama + local tools    BRANCH B: cloud keys
 *            │                               │
 *            └───────────────┬───────────────┘
 *                            ▼
 *                 AXE CORE ANSWER → USER
 *
 * For normal chat (short identity cascade) we use a plain sequential retry —
 * no LangGraph StateGraph load — so every greeting is not a "beauty race" and
 * does not pay graph import cost. StateGraph remains available for multi-step
 * specialist work when explicitly requested later.
 *
 * callFn is passed in (dependency injection) to avoid circular imports.
 */

/* ── Types ─────────────────────────────────────────────────────────────── */
export type LGMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LGSlot    = { provider: string; key: string; model?: string; baseUrl?: string };
export type LGCallFn  = (slot: LGSlot, messages: LGMessage[]) => Promise<string>;

export type Branch = 'local' | 'cloud' | 'auto';

// Branch A (VPS/local): Ollama + all VPS agent bridges.
// KiloCode is Branch B — it's the cloud-key gateway, not a local runner.
const LOCAL_PROVIDERS  = new Set(['ollama', 'openhands', 'openjarvis', 'openclaw', 'hermes', 'crewai']);
const CLOUD_PROVIDERS  = new Set(['anthropic', 'openai', 'google', 'groq', 'openrouter', 'kilocode', 'xai', 'cerebras']);

const LOCAL_HINT = /\b(lokaal|local|private|prive|password|wachtwoord|secret|geheim|credentials|code|bug|refactor|component|deploy|docker|script|terminal|server|vps)\b/i;
const CLOUD_HINT = /\b(analyse|research|strateg|vergelijk|compare|architect|roadmap|waarom|why|calculate|bereken|brainstorm|copywriting|marketing|concurrentie)\b/i;

/**
 * Decide which branch LangGraph should prefer for this request.
 *  - 'local'  → run on the VPS via Ollama / local agent tools (privacy, code, infra)
 *  - 'cloud'  → route through cloud LLM keys (deep reasoning, research)
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

/**
 * Sequential identity cascade — primary, then backups, no graph machinery.
 * This is the hot path for stable AXE chat.
 */
async function runSequentialCascade(
  messages: LGMessage[],
  slots: LGSlot[],
  callFn: LGCallFn,
  branch: Branch,
): Promise<OrchestrationResult | null> {
  for (const slot of slots) {
    try {
      const reply = await callFn(slot, messages);
      const trimmed = reply.trim();
      if (!trimmed) continue;
      console.debug(`[Orchestrator] ✓ ${slot.provider}/${slot.model}`);
      return { response: trimmed, slot, branch };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[Orchestrator] ✗ ${slot.provider}/${slot.model}: ${msg}`);
    }
  }
  return null;
}

/* ── Public API ─────────────────────────────────────────────────────────── */
/**
 * Orchestrate an LLM call across provider slots.
 * Default path is a lightweight sequential cascade (stable AXE identity).
 * Branch re-ordering still applies when query hints local vs cloud.
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

  return runSequentialCascade(messages, ordered, callFn, branch);
}
