/**
 * Wat er tussen twee polls van /agents/activity veranderde, als vluchten van de bol.
 *
 * Puur: twee standen erin, een lijst activiteiten eruit. Alleen echte veranderingen:
 * een nieuw event, een agent die begint te werken, een vraag aan Luka.
 */
import type { ServerAgent } from '@/domain/agents/serverStatus';
import type { AxeActiviteit } from '@/shared/axeActiviteit';

const KLEUR_WERK = 'rgba(165,243,252,0.75)';
const KLEUR_VRAAG = 'rgba(251,191,36,0.8)';

export function activiteitUitServer(
  voor: Record<string, ServerAgent>,
  na: Record<string, ServerAgent>,
  max = 3,
): AxeActiviteit[] {
  const uit: AxeActiviteit[] = [];
  for (const [id, a] of Object.entries(na)) {
    const oud = voor[id];
    const doelen = [`agent:${id}`, id === 'northsea' ? '/maps-3d' : id === 'trading' ? '/trading' : '/agents'];
    if (a.status === 'WAITING_APPROVAL' && oud?.status !== 'WAITING_APPROVAL') {
      uit.push({ doelen, label: `${id}: needs your OK${a.task?.title ? ` — ${a.task.title}` : ''}`, kleur: KLEUR_VRAAG });
      continue;
    }
    const nieuw = a.last_event_at && a.last_event_at !== oud?.last_event_at ? a.events[0] : null;
    if (nieuw?.message) {
      uit.push({ doelen, label: `${id}: ${nieuw.message}`, kleur: KLEUR_WERK });
      continue;
    }
    if (a.status === 'WORKING' && oud && oud.status !== 'WORKING') {
      uit.push({ doelen, label: `${id}: ${a.current_action || a.task?.title || 'started working'}`, kleur: KLEUR_WERK });
    }
  }
  return uit.slice(0, max);
}

/** Waar de bol naartoe vliegt als AXE zelf een gereedschap gebruikt (tool-id -> tab in de navigatie). */
export function doelVoorTool(tool: string): string[] {
  const t = tool.toLowerCase();
  if (/memory|obsidian|rag|remember|recall/.test(t)) return ['/memory', '/obsidian'];
  if (/computer|exec|terminal|shell|mac/.test(t)) return ['/computer-use', '/terminal'];
  if (/search|web|browse|perplexity|tavily|fetch/.test(t)) return ['/browser'];
  if (/git|code|vercel|deploy/.test(t)) return ['/code-editor'];
  if (/northsea|deal/.test(t)) return ['/maps-3d'];
  if (/agenda|calendar|place/.test(t)) return ['/calendar'];
  if (/db|sql|table/.test(t)) return ['/table-editor'];
  if (/agent|crew|task/.test(t)) return ['/agents', '/tasks'];
  if (/cron|schedule/.test(t)) return ['/cron-manager'];
  return [];
}
