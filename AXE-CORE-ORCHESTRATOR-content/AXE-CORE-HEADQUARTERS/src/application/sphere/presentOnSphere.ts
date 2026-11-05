/**
 * presentOnSphere — single entry for Living Display from any chat path.
 * Call from voiceStore.sendMessage and Home so map/chart always hit the sphere
 * even when the LLM only emits [OPEN_WINDOW: ...].
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import { looksLikeMap, projectieUitVraag } from '@/application/sphere/vraagRouter';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';

/* De herkenning (looksLikeMap / looksLikeChart / projectieUitVraag) staat in
   `vraagRouter.ts`. Dit bestand gaat alleen nog over WAAR een projectie landt
   -- en omdat het daarvoor Home's store nodig heeft, staat het op de
   uitzonderingslijst van architecture.test.ts. De router staat er juist
   buiten, zodat de notch hem kan gebruiken zonder die store mee te slepen. */

function forceProject(payload: ProjectionPayload): void {
  useSphereProjectionStore.getState().project(payload);
}

/** Project from the user's own message (before / regardless of LLM). */
export async function presentUserIntentOnSphere(text: string): Promise<boolean> {
  const p = await projectieUitVraag(text);
  if (!p) return false;
  forceProject(p);
  console.info('[sphere] projected from user intent', p.mode, p.title);
  return true;
}

/** Project from assistant reply markers (OPEN_WINDOW maps/trading). */
export async function presentAssistantReplyOnSphere(
  reply: string,
  lastUserText?: string,
): Promise<boolean> {
  const r = reply || '';
  if (!r) return false;

  try {
    if (/\[OPEN_WINDOW:[^\]]*maps?/i.test(r) || /opening\s+(the\s+)?(3d\s+)?map/i.test(r)) {
      const p = await resolveMap(lastUserText || r);
      forceProject(p);
      console.info('[sphere] projected map from OPEN_WINDOW', p.title);
      return true;
    }
    if (/\[OPEN_WINDOW:[^\]]*trading/i.test(r) || /opening\s+(the\s+)?trading/i.test(r)) {
      const p = await resolveChart(lastUserText || r);
      forceProject(p);
      console.info('[sphere] projected chart from OPEN_WINDOW', p.title);
      return true;
    }
    // [PROJECT:] (ook met "query" om op te zoeken) en een ```html-voorbeeld: één weg.
    if (/\[PROJECT:\s*\{/i.test(r) || /```(html|svg)\s*\n/i.test(r)) {
      const { directFromAssistantMessageAsync } = await import('@/application/sphere/sphereDirector');
      const marked = await directFromAssistantMessageAsync(r);
      if (marked) {
        forceProject(marked);
        return true;
      }
    }
    // LLM claimed a city without markers — still project from last user text
    if (lastUserText && looksLikeMap(lastUserText) && /\b(map|kaart|new\s*york|nyc|location|locatie)\b/i.test(r)) {
      const p = await resolveMap(lastUserText);
      forceProject(p);
      console.info('[sphere] projected map from assistant claim + user text', p.title);
      return true;
    }
  } catch (err) {
    console.warn('[sphere] presentAssistantReplyOnSphere failed', err);
  }
  return false;
}
