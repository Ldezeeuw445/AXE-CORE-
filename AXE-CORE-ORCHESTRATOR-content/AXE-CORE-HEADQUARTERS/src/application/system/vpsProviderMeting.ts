/**
 * De VPS-regels in "Models & Tests", live gemeten.
 *
 * Tot 30 okt las het paneel alleen de laatste uitslag die Instellingen had
 * opgeslagen. Voor Ollama, OpenHands, OpenClaw en CrewAI was dat 20 okt, toen
 * de VPS even weg was -- en zo bleven ze tien dagen rood terwijl ze werkten
 * (/status/vps-agents: alle vier reachable). Deze vier en Hermes kosten geen
 * sleutel en geen tegoed, dus die meten we gewoon elke ronde.
 *
 * Dezelfde metingen als de Test-knop op Instellingen: vpsAgentStatus voor de
 * bruggen, /api/tags op de modelbox (via de VPS als dit toestel geen eigen
 * sleutel heeft) voor Ollama en Hermes.
 */
import { vpsAgentStatus } from '@/application/system/systemService';
import { ollamaHeaders, ollamaUrl } from '@/infrastructure/config/ollamaSleutel';
import type { KaartStand } from '@/domain/providerCardStand';

export const LIVE_VPS_PROVIDERS = ['ollama', 'hermes', 'openhands', 'openclaw', 'crewai'] as const;
export type LiveVpsProvider = typeof LIVE_VPS_PROVIDERS[number];

const MODELBOX = 'https://ollama.axecompanion.com';

/** Staat het model op de box? `hermes3:8b` telt ook als `hermes3:8b:latest` niet bestaat en andersom. */
export function heeftModel(namen: string[], model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return namen.length > 0;
  const kaal = (n: string) => n.toLowerCase().replace(/:latest$/, '');
  return namen.some(n => kaal(n) === kaal(m));
}

async function modelbox(base: string | undefined, model: string): Promise<KaartStand> {
  const doel = ollamaUrl((base || MODELBOX).replace(/\/+$/, ''));
  try {
    const r = await fetch(`${doel}/api/tags`, { headers: ollamaHeaders(doel), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return 'fail';
    const d = await r.json() as { models?: Array<{ name?: string }> };
    const namen = (d.models ?? []).map(x => String(x.name ?? '')).filter(Boolean);
    return heeftModel(namen, model) ? 'ok' : 'fail';
  } catch {
    return 'fail';
  }
}

/** Eén ronde voor alle vijf, parallel. `instelling` is wat Instellingen per id weet (baseUrl, model). */
export async function meetVpsProviders(
  instelling: Partial<Record<LiveVpsProvider, { baseUrl?: string; model?: string }>>,
): Promise<Record<LiveVpsProvider, KaartStand>> {
  const brug = async (id: 'openhands' | 'openclaw' | 'crewai'): Promise<KaartStand> =>
    (await vpsAgentStatus(id)).ok ? 'ok' : 'fail';
  const [ollama, hermes, openhands, openclaw, crewai] = await Promise.all([
    // Ollama zelf: de box antwoordt met modellen. Welk model de chat kiest is een tweede vraag.
    modelbox(instelling.ollama?.baseUrl, ''),
    modelbox(instelling.hermes?.baseUrl, instelling.hermes?.model || 'hermes3:8b'),
    brug('openhands'), brug('openclaw'), brug('crewai'),
  ]);
  return { ollama, hermes, openhands, openclaw, crewai };
}
