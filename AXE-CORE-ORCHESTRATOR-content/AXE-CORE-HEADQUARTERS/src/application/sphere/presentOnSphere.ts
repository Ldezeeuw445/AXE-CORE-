/**
 * presentOnSphere — single entry for Living Display from any chat path.
 * Call from voiceStore.sendMessage and Home so map/chart always hit the sphere
 * even when the LLM only emits [OPEN_WINDOW: ...].
 */
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';

function looksLikeChart(t: string): boolean {
  return /\b(chart|grafiek|graph|plot|trading|candles?|btc|eth|sol|koers|price)\b/i.test(t);
}

function looksLikeMap(t: string): boolean {
  if (/\b(kaart|map|maps|locatie|location|city|stad|plaats)\b/i.test(t)) return true;
  if (/laat(\s+\S+){1,8}\s+zien/i.test(t)) return true;
  if (/\b(new\s*york|nyc|los\s*angeles|tokyo|london|paris|amsterdam|dubai|singapore|berlin|rotterdam|sydney|miami|chicago)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Project from the user's own message (before / regardless of LLM). */
export async function presentUserIntentOnSphere(text: string): Promise<boolean> {
  const t = (text || '').trim();
  if (!t) return false;

  try {
    if (looksLikeChart(t) && !looksLikeMap(t)) {
      const p = await resolveChart(t);
      useSphereProjectionStore.getState().project(p);
      console.info('[sphere] projected chart from user intent', p.title);
      return true;
    }
    if (looksLikeMap(t)) {
      const p = await resolveMap(t);
      useSphereProjectionStore.getState().project(p);
      console.info('[sphere] projected map from user intent', p.title, p.data);
      return true;
    }
    // "laat X zien" catch-all → map geocode
    if (/laat(\s+\S+){1,8}\s+zien/i.test(t)) {
      const p = await resolveMap(t);
      useSphereProjectionStore.getState().project(p);
      console.info('[sphere] projected map from laat-zien', p.title);
      return true;
    }
  } catch (err) {
    console.warn('[sphere] presentUserIntentOnSphere failed', err);
  }
  return false;
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
      useSphereProjectionStore.getState().project(p);
      console.info('[sphere] projected map from OPEN_WINDOW', p.title);
      return true;
    }
    if (/\[OPEN_WINDOW:[^\]]*trading/i.test(r) || /opening\s+(the\s+)?trading/i.test(r)) {
      const p = await resolveChart(lastUserText || r);
      useSphereProjectionStore.getState().project(p);
      console.info('[sphere] projected chart from OPEN_WINDOW', p.title);
      return true;
    }
    if (/\[PROJECT:\s*\{/i.test(r)) {
      const { parseProjectMarker } = await import('@/application/sphere/sphereDirector');
      const marked = parseProjectMarker(r);
      if (marked) {
        useSphereProjectionStore.getState().project(marked);
        return true;
      }
    }
  } catch (err) {
    console.warn('[sphere] presentAssistantReplyOnSphere failed', err);
  }
  return false;
}
