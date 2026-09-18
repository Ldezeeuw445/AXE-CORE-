/**
 * Waar de pin van een tier-2/tier-3 agent staat.
 *
 * Anders dan de tier-1 abonnementen (agentMotoren.ts) is hier geen
 * wederzijdse uitsluiting nodig: twee agents mogen prima dezelfde
 * Gemini-sleutel gebruiken, die raken elkaar niet in de weg zoals een
 * ingelogde CLI-sessie dat wel doet. Dit is dus gewoon "welk provider:model
 * staat vast voor deze agent, of niets (tier 2: races zelf; tier 3: geen
 * keuze zonder pin, zie AgentMotorenSection)".
 */
import type { ProviderId } from '@/domain/providers';

export interface EngineOverride {
  provider: ProviderId;
  model: string;
}

export type OverrideMap = Partial<Record<string, EngineOverride>>;

const SLEUTEL = 'axe_agent_engine_overrides_v1';

export function leesOverrides(): OverrideMap {
  try {
    const raw = localStorage.getItem(SLEUTEL);
    return raw ? (JSON.parse(raw) as OverrideMap) : {};
  } catch {
    return {};
  }
}

export function zetOverride(agentId: string, override: EngineOverride | null): OverrideMap {
  const huidig = leesOverrides();
  const volgende: OverrideMap = { ...huidig };
  if (override) volgende[agentId] = override;
  else delete volgende[agentId];
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(volgende));
    window.dispatchEvent(new CustomEvent('axe:agent-motoren', { detail: volgende }));
  } catch { /* privémodus: geldt dan alleen voor deze sessie */ }
  return volgende;
}
