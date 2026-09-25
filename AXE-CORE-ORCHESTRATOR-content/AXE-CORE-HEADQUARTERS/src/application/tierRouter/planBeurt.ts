/**
 * Vraagt een beurtplan op bij het eerste model dat binnen de tijd antwoordt.
 * Lukt geen enkel model, dan null: dan praat AXE gewoon terug en start hij
 * niets (installTierRouter). Nooit meer knippen tot losse taken.
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

export function planInvoer(text: string, geschiedenis: PlanBeurtDeps['geschiedenis'] = []): string {
  const recent = geschiedenis.slice(-6)
    .map((m) => `${m.role === 'user' ? 'Luka' : 'AXE'}: ${m.text.slice(0, 300)}`)
    .join('\n');
  return recent
    ? `Recent conversation:\n${recent}\n\nLuka now says: ${text}`
    : text;
}

/**
 * Alle modellen tegelijk; het eerste geldige plan wint. Na elkaar vragen kostte
 * bij een trage Groq of een lange beurt de hele tijdslimiet, en dan viel AXE
 * terug op knippen -- zo werd een gewoon gesprek op 25 sep 25 agent-taken.
 */
export async function planBeurt(text: string, deps: PlanBeurtDeps): Promise<BeurtPlan | null> {
  if (!deps.modellen.length) return null;
  const system = planPrompt(deps.nu ?? new Date(), deps.lopend ?? []);
  const user = planInvoer(text, deps.geschiedenis);
  const timeoutMs = deps.timeoutMs ?? PLAN_TIMEOUT_MS;
  return new Promise<BeurtPlan | null>((resolve) => {
    let open = deps.modellen.length;
    let klaar = false;
    const einde = (plan: BeurtPlan | null) => {
      if (klaar) return;
      if (plan) { klaar = true; resolve(plan); return; }
      open -= 1;
      if (open === 0) { klaar = true; resolve(null); }
    };
    setTimeout(() => { if (!klaar) { klaar = true; resolve(null); } }, timeoutMs);
    for (const model of deps.modellen) {
      Promise.resolve()
        .then(() => model(system, user))
        .then((raw) => einde(parseBeurtPlan(raw)))
        .catch((e) => {
          console.warn('[AXE] plan model failed:', e instanceof Error ? e.message.slice(0, 120) : e);
          einde(null);
        });
    }
  });
}
