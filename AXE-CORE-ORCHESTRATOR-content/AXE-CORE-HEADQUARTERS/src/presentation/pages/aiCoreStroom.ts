/**
 * De cognitive stream van AI Core, afgeleid in plaats van opgespaard.
 *
 * De stroom hield zijn eigen lijst bij en kreeg alleen regels die binnenkwamen
 * TERWIJL de pagina open stond. Het gesprek en de routeringslog staan allebei
 * al in de voiceStore (het gesprek wordt geladen, de log staat in
 * localStorage) -- toch was de stroom bij elke opening leeg, op drie
 * verzonnen opstartregels na ("Waiting for LLM connection..." ook als er wél
 * een verbinding was).
 *
 * Hier wordt hij opgebouwd uit wat er echt is: elke beurt, het model waar AXE
 * die beurt door sprak, en elke overdracht aan een specialist. Dezelfde regels
 * die de live-stroom al schreef, dus geschiedenis en live zien er hetzelfde
 * uit. Wat nergens bewaard wordt (het "denkt na"-moment) komt als losse regel
 * van de pagina zelf binnen via `los`.
 */
import type { ConversationMessage, RoutingEvent } from '@/presentation/store/voiceStore';
import { agentById, type AxeAgentId } from '@/domain/agents/roster';
import { beurtRegel } from '@/domain/beurtKlok';

export interface StroomRegel {
  id: string;
  /** Epoch-ms. Bepaalt de volgorde. */
  at: number;
  type: 'in' | 'out' | 'sys' | 'route';
  text: string;
}

/** "google/gemma-3-4b-it:free" -> "gemma-3-4b-it" */
function kortModel(model?: string): string {
  return model ? model.split('/').pop()?.split(':')[0] ?? model : '';
}

/**
 * Bouwt de stroom op uit het gesprek, de routeringslog en losse live-regels.
 *
 * - `sinds`: alles daarvoor valt weg (na "Clear conversation").
 * - Routeringsregels tellen alleen mee zolang er een gesprek is, en niet van
 *   vóór de eerste beurt: de log overleeft een gesprekswissel, en een
 *   overdracht uit een ander gesprek hoort niet tussen deze beurten.
 * - Bij gelijke tijd blijft de invoegvolgorde staan, zodat de modelregel
 *   vóór het antwoord komt waar hij bij hoort.
 */
export function bouwStroom(
  gesprek: readonly ConversationMessage[],
  routering: readonly RoutingEvent[],
  los: readonly StroomRegel[] = [],
  { sinds = 0, max = 200 }: { sinds?: number; max?: number } = {},
): StroomRegel[] {
  const regels: StroomRegel[] = [];

  for (const m of gesprek) {
    const id = `${m.timestamp}-${m.role}`;
    // AXE's antwoord staat als AXE -- welk model eronder zat is één aparte,
    // controleerbare regel, geen race tussen modellen.
    if (m.role !== 'user' && m.provider) {
      const model = kortModel(m.model);
      regels.push({ id: `${id}-model`, at: m.timestamp, type: 'route', text: `model · ${m.provider}${model ? `/${model}` : ''}` });
    }
    regels.push({ id, at: m.timestamp, type: m.role === 'user' ? 'in' : 'out', text: m.text });
  }

  const eersteBeurt = gesprek.reduce((a, m) => Math.min(a, m.timestamp), Infinity);
  for (const evt of routering) {
    if (!Number.isFinite(eersteBeurt) || evt.ts < eersteBeurt) continue;
    // Alleen wat AXE BESLOOT: een beurt die AXE zelf afhandelt is al zichtbaar
    // als het antwoord; een overdracht aan een specialist niet.
    const agent = (evt.delegate ?? 'axe') as AxeAgentId;
    // De Jarvis-route (tier 1/2/3) is een andere as dan de roster-tiers. Die
    // staat er altijd: zo is te zien of een groet het grote model oversloeg.
    if (evt.routeTier) {
      const ms = typeof evt.routeMs === 'number' ? ` · ${evt.routeMs}ms` : '';
      const wie = agent !== 'axe' ? ` · ${agentById(agent).name}` : '';
      regels.push({ id: `rte-${evt.id}-tier`, at: evt.ts, type: 'route', text: `route · tier ${evt.routeTier} · ${evt.via}${ms}${wie}` });
    }
    const lat = beurtRegel({
      sttMs: evt.sttMs,
      routeMs: evt.routeMs,
      firstTokenMs: evt.firstTokenMs,
      firstAudioMs: evt.firstAudioMs,
    });
    if (lat !== 'lat') regels.push({ id: `rte-${evt.id}-lat`, at: evt.ts, type: 'route', text: lat });
    if (agent === 'axe') continue;
    const naam = agentById(agent).name;
    const keer = (evt.count ?? 1) > 1 ? `  ×${evt.count}` : '';
    regels.push({ id: `rte-${evt.id}-dele`, at: evt.ts, type: 'route', text: `AXE → ${naam}${evt.via === 'langgraph' ? '  · via LangGraph' : ''}${keer}` });
    if (evt.winner) {
      const model = kortModel(evt.winnerModel);
      regels.push({ id: `rte-${evt.id}-eng`, at: evt.ts, type: 'route', text: `${naam} · ${evt.winner}${model ? `/${model}` : ''}` });
    }
  }

  regels.push(...los);

  const gezien = new Set<string>();
  const uniek: { r: StroomRegel; i: number }[] = [];
  regels.forEach((r, i) => {
    if (r.at < sinds || gezien.has(r.id)) return;
    gezien.add(r.id);
    uniek.push({ r, i });
  });
  return uniek
    .sort((a, b) => a.r.at - b.r.at || a.i - b.i)
    .map(({ r }) => r)
    .slice(-max);
}

/**
 * Tijd voor in de stroom, in lokale tijd. Van vandaag alleen de klok; ouder
 * krijgt de datum erbij, want een geladen gesprek kan dagen beslaan en een
 * kale klok zegt dan niets.
 */
export function stroomTijd(at: number, nu: number = Date.now()): string {
  const d = new Date(at);
  const n = new Date(nu);
  const twee = (x: number) => String(x).padStart(2, '0');
  const klok = `${twee(d.getHours())}:${twee(d.getMinutes())}:${twee(d.getSeconds())}`;
  const vandaag = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (vandaag) return klok;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${klok.slice(0, 5)}`;
}
