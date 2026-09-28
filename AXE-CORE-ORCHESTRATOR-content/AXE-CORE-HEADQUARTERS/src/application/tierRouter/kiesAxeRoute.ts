/**
 * Kiest de AXE-route: regels eerst, optioneel een klein model bij twijfel,
 * en bij timeout of fout het huidige pad (intercept = false).
 */
import { routeFast } from '@/application/fastPath/fastPathRouter';
import {
  AXE_ROUTE_TIMEOUT_MS,
  CLASSIFIER_PROMPT,
  classifyAxeTier,
  parseModelKlassificatie,
  type AxeRoute,
} from '@/domain/tierRouter/axeRoute';

export interface AxeRouteKeuze extends AxeRoute {
  intercept: boolean;
  latencyMs: number;
}

export interface KiesAxeRouteDeps {
  vraagModel?: (prompt: string) => Promise<string>;
  timeoutMs?: number;
  nu?: () => number;
}

function slaap(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

export async function kiesAxeRoute(
  text: string,
  deps: KiesAxeRouteDeps = {},
): Promise<AxeRouteKeuze> {
  const nu = deps.nu ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const t0 = nu();
  const klaar = (route: AxeRoute, intercept: boolean): AxeRouteKeuze => ({
    ...route,
    intercept,
    latencyMs: Math.max(0, nu() - t0),
  });

  const fast = routeFast(text);
  if (fast.intent !== 'none') {
    return klaar({
      ...classifyAxeTier(text),
      via: 'fallback',
      reason: `fast:${fast.intent}`,
      confident: false,
    }, false);
  }

  const regels = classifyAxeTier(text);
  if (regels.confident) return klaar(regels, true);

  const vraag = deps.vraagModel;
  if (!vraag) return klaar({ ...regels, via: 'fallback', reason: 'no classifier model' }, false);

  const timeoutMs = deps.timeoutMs ?? AXE_ROUTE_TIMEOUT_MS;
  try {
    const raw = await Promise.race([
      vraag(`${CLASSIFIER_PROMPT}\n${text}`),
      slaap(timeoutMs),
    ]);
    if (raw == null) {
      return klaar({ ...regels, via: 'fallback', reason: `timeout ${timeoutMs}ms` }, false);
    }
    const parsed = parseModelKlassificatie(raw);
    if (!parsed) {
      return klaar({ ...regels, via: 'fallback', reason: 'classifier parse' }, false);
    }
    return klaar(parsed, true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return klaar({ ...regels, via: 'fallback', reason: `classifier fail: ${msg.slice(0, 60)}` }, false);
  }
}
