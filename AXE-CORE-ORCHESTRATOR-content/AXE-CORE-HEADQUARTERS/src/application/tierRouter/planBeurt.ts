/**
 * Vraagt een beurtplan op bij het eerste model dat binnen de tijd antwoordt.
 * Lukt geen enkel model, dan null: de regel-route van vóór 25 sep neemt het
 * dan over. Een plan is een verbetering, nooit een voorwaarde.
 */
import {
  PLAN_TIMEOUT_MS,
  parseBeurtPlan,
  planPrompt,
  type BeurtPlan,
} from '@/domain/tierRouter/beurtPlan';

export type PlanModel = (system: string, user: string) => Promise<string>;

export interface PlanBeurtDeps {
  /** In volgorde van voorkeur. Groq eerst; OpenAI als Groq's dagtegoed op is. */
  modellen: PlanModel[];
  /** Laatste beurten, oudste eerst, zodat "die van net" iets betekent. */
  geschiedenis?: Array<{ role: 'user' | 'axe'; text: string }>;
  /** Titels van jobs die al lopen, zodat het plan ze niet opnieuw start. */
  lopend?: string[];
  nu?: Date;
  timeoutMs?: number;
}

function binnen<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => { setTimeout(() => resolve(null), ms); }),
  ]);
}

export function planInvoer(text: string, geschiedenis: PlanBeurtDeps['geschiedenis'] = []): string {
  const recent = geschiedenis.slice(-6)
    .map((m) => `${m.role === 'user' ? 'Luka' : 'AXE'}: ${m.text.slice(0, 300)}`)
    .join('\n');
  return recent
    ? `Recent conversation:\n${recent}\n\nLuka now says: ${text}`
    : text;
}

export async function planBeurt(text: string, deps: PlanBeurtDeps): Promise<BeurtPlan | null> {
  const system = planPrompt(deps.nu ?? new Date(), deps.lopend ?? []);
  const user = planInvoer(text, deps.geschiedenis);
  const timeoutMs = deps.timeoutMs ?? PLAN_TIMEOUT_MS;
  for (const model of deps.modellen) {
    try {
      const raw = await binnen(model(system, user), timeoutMs);
      if (raw == null) continue;
      const plan = parseBeurtPlan(raw);
      if (plan) return plan;
    } catch (e) {
      console.warn('[AXE] plan model failed, trying the next:', e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }
  return null;
}
