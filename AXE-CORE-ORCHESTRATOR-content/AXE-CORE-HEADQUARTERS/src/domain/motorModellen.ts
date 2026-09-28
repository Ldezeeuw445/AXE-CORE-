/**
 * Welk model elke motor draait.
 *
 * ## Waarom per MOTOR en niet per agent
 *
 * Een abonnement hoort bij één agent (agentMotoren.ts), maar het model hoort
 * bij het abonnement: Claude Code draait op een Claude-model, Codex op een
 * OpenAI-model. Zet je het per agent, dan kun je een agent een model geven dat
 * zijn motor niet kent -- en dat merk je pas als de run faalt met een fout uit
 * de CLI die niemand leest.
 *
 * ## Waarom leeg betekent "wat de CLI zelf kiest"
 *
 * Elke CLI heeft een eigen standaard die met een update meebeweegt. Een lege
 * keuze laat die staan; een ingevulde keuze wint. Zo bevriest dit scherm je
 * niet op een model dat over een maand verouderd is.
 *
 * ## Waarom vrije tekst naast suggesties
 *
 * De modelnamen veranderen sneller dan deze lijst. De suggesties zijn wat de
 * CLI's zelf in hun `--help` noemen (gemeten 16 september 2026); alles anders
 * mag je gewoon intikken.
 */
import { ALLE_MOTOREN, type AgentEngine } from './abonnementChat';

export const MODELLEN_SLEUTEL = 'axe_motor_modellen_v1';

export type MotorModellen = Partial<Record<AgentEngine, string>>;

/** Wat de CLI's zelf als voorbeeld geven. Aliassen mogen: `claude --model opus`. */
export const MODEL_SUGGESTIES: Record<AgentEngine, readonly string[]> = {
  claude: ['fable', 'opus', 'sonnet', 'haiku'],
  claude2: ['fable', 'opus', 'sonnet', 'haiku'],
  claude3: ['fable', 'opus', 'sonnet', 'haiku'],
  claude4: ['fable', 'opus', 'sonnet', 'haiku'],
  codex: ['gpt-5-codex', 'o3'],
  codex2: ['gpt-5-codex', 'o3'],
  codex3: ['gpt-5-codex', 'o3'],
  cursor: ['gpt-5', 'sonnet-4-thinking'],
};

/** De vlag waarmee deze motor zijn model aanneemt. Alleen ter uitleg in de UI. */
export const MODEL_VLAG: Record<AgentEngine, string> = {
  claude: '--model', claude2: '--model', claude3: '--model', claude4: '--model',
  codex: '-m', codex2: '-m', codex3: '-m', cursor: '--model',
};

const schoon = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : undefined;
};

/** Leest wat er opgeslagen staat; onbekende motoren en lege waarden vallen weg. */
export function normaliseerModellen(ruw: unknown): MotorModellen {
  if (!ruw || typeof ruw !== 'object') return {};
  const bron = ruw as Record<string, unknown>;
  const uit: MotorModellen = {};
  for (const motor of ALLE_MOTOREN) {
    const waarde = schoon(bron[motor]);
    if (waarde) uit[motor] = waarde;
  }
  return uit;
}

/** Het gekozen model, of undefined als de CLI zijn eigen standaard mag houden. */
export function modelVoor(modellen: MotorModellen, motor: AgentEngine | 'sleutels'): string | undefined {
  return motor === 'sleutels' ? undefined : modellen[motor];
}

export function kiesModel(modellen: MotorModellen, motor: AgentEngine, model: string): MotorModellen {
  const waarde = schoon(model);
  const volgende = { ...modellen };
  if (waarde) volgende[motor] = waarde;
  else delete volgende[motor];
  return volgende;
}
