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

/** Known place tokens (aliases included) — keep in sync with mapResolver. */
const PLACE_HINT =
  /\b(new\s*york|nyc|los\s*angeles|\bla\b|san\s*francisco|\bsf\b|tokyo|london|paris|amsterdam|dubai|singapore|berlin|rotterdam|utrecht|den\s*haag|the\s*hague|sydney|melbourne|miami|chicago|toronto|seoul|shanghai|hong\s*kong|munich|madrid|barcelona|rome|milan|lisbon|stockholm|oslo|copenhagen|vienna|zurich|brussels|istanbul|moscow|abu\s*dhabi|tel\s*aviv|cairo|lagos|nairobi|johannesburg|s[aã]o\s*paulo|buenos\s*aires|mexico\s*city|mumbai|delhi|bangkok|jakarta|auckland|rio(\s*de\s*janeiro)?)\b/i;

function looksLikeMap(t: string): boolean {
  if (/\b(kaart|map|maps|locatie|location|city|stad|plaats|coords?|coordinaten|coordinates)\b/i.test(t)) {
    return true;
  }
  // NL / EN show-me patterns
  if (/laat(\s+\S+){0,10}\s+zien/i.test(t)) return true;
  if (/\b(show|display|project|toon|bekijk|open)\b/i.test(t) && PLACE_HINT.test(t)) return true;
  if (/\b(waar\s+is|where\s+is|take\s+me\s+to|navigeer\s+naar|navigate\s+to|ga\s+naar|go\s+to)\b/i.test(t)) {
    return true;
  }
  // Bare place name ("New York", "NYC", …)
  if (PLACE_HINT.test(t)) return true;
  return false;
}

function forceProject(payload: Awaited<ReturnType<typeof resolveMap>>): void {
  useSphereProjectionStore.getState().project(payload);
}

/** Project from the user's own message (before / regardless of LLM). */
export async function presentUserIntentOnSphere(text: string): Promise<boolean> {
  const t = (text || '').trim();
  if (!t) return false;

  try {
    if (looksLikeChart(t) && !looksLikeMap(t)) {
      const p = await resolveChart(t);
      forceProject(p);
      console.info('[sphere] projected chart from user intent', p.title);
      return true;
    }
    if (looksLikeMap(t)) {
      const p = await resolveMap(t);
      forceProject(p);
      console.info('[sphere] projected map from user intent', p.title, p.data);
      return true;
    }
    // "laat X zien" / "show X" catch-all → map geocode
    if (/laat(\s+\S+){1,10}\s+zien/i.test(t) || /\b(show|toon)\s+.+/i.test(t)) {
      const p = await resolveMap(t);
      forceProject(p);
      console.info('[sphere] projected map from show/laat-zien', p.title);
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
    if (/\[PROJECT:\s*\{/i.test(r)) {
      const { parseProjectMarker } = await import('@/application/sphere/sphereDirector');
      const marked = parseProjectMarker(r);
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
