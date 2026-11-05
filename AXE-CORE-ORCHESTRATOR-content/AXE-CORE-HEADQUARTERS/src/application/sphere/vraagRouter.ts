/**
 * Eén antwoord op "wat wil Luka zien".
 *
 * ## Waarom dit los van presentOnSphere staat
 *
 * De herkenning stond in `presentOnSphere.ts`, verweven met het duwen naar
 * Home's store. Dat bestand importeert dus de presentatielaag en staat
 * daarom op de uitzonderingslijst van `architecture.test.ts`.
 *
 * De notch is een eigen Tauri-venster: een eigen JS-wereld, zonder Home. Hij
 * wil hetzelfde antwoord op dezelfde vraag, maar tekent het zelf. Zou hij
 * `presentOnSphere` importeren, dan sleept de strook die hele store mee én
 * erft hij de laagovertreding. Zou hij zijn eigen herkenning schrijven, dan
 * bestaan er twee antwoorden op "laat de kaart van LA zien" en lopen die uit
 * elkaar — wet 1: één ding staat op één plek.
 *
 * Dus: hier de router, die alleen een projectie teruggeeft. Wie hem aanroept
 * bepaalt waar die landt.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';

export function looksLikeChart(t: string): boolean {
  return /\b(chart|grafiek|graph|plot|trading|candles?|btc|eth|sol|koers|price)\b/i.test(t);
}

/** Known place tokens (aliases included) — keep in sync with mapResolver. */
const PLACE_HINT =
  /\b(new\s*york|nyc|los\s*angeles|\bla\b|san\s*francisco|\bsf\b|tokyo|london|paris|amsterdam|dubai|singapore|berlin|rotterdam|utrecht|den\s*haag|the\s*hague|sydney|melbourne|miami|chicago|toronto|seoul|shanghai|hong\s*kong|munich|madrid|barcelona|rome|milan|lisbon|stockholm|oslo|copenhagen|vienna|zurich|brussels|istanbul|moscow|abu\s*dhabi|tel\s*aviv|cairo|lagos|nairobi|johannesburg|s[aã]o\s*paulo|buenos\s*aires|mexico\s*city|mumbai|delhi|bangkok|jakarta|auckland|rio(\s*de\s*janeiro)?)\b/i;

export function looksLikeMap(t: string): boolean {
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

/**
 * De projectie die bij deze vraag hoort, of null als het gewoon een vraag is.
 *
 * Null is het normale geval: de meeste berichten aan AXE willen geen kaart.
 * Dat moet dus goedkoop en stil zijn — geen netwerk, geen melding.
 */
export async function projectieUitVraag(text: string): Promise<ProjectionPayload | null> {
  const t = (text || '').trim();
  if (!t) return null;

  try {
    if (looksLikeChart(t) && !looksLikeMap(t)) return await resolveChart(t);
    if (looksLikeMap(t)) return await resolveMap(t);
    // "laat X zien" / "show X" zonder plaatsnaam: resolveMap geocodeert zelf.
    if (/laat(\s+\S+){1,10}\s+zien/i.test(t) || /\b(show|toon)\s+.+/i.test(t)) {
      return await resolveMap(t);
    }
  } catch (err) {
    console.warn('[sphere] projectieUitVraag failed', err);
  }
  return null;
}
