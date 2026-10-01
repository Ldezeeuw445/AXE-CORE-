/**
 * Cartesia Sonic — lage-latentie TTS (NL+EN).
 *
 * Sleutel uit Settings → Keys (`axe_llm_connections.cartesia`) of
 * `VITE_CARTESIA_API_KEY`. Geen waarde in deze repo.
 * Stem-id is publiek en overschrijfbaar via localStorage `axe_cartesia_voice`.
 */
import { normalizeForSpeech } from '@/domain/speechText';
import { getReplyLanguage } from '@/domain/replyLanguage';
import { dienstSleutel } from '@/infrastructure/config/providerSleutels';

const ENV_CARTESIA_KEY = import.meta.env.VITE_CARTESIA_API_KEY ?? '';
const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2025-04-16';
const CARTESIA_MODEL = 'sonic-3';
const STEM_SLEUTEL = 'axe_cartesia_voice';
/** Publiek demo-id (British Man) — geen geheim. */
const STANDAARD_STEM = '79a125e8-cd45-4c13-8a67-188112f4dd22';

function sleutel(): string {
  return dienstSleutel('cartesia') || ENV_CARTESIA_KEY.trim();
}

export function isCartesiaConfigured(): boolean {
  return sleutel().length > 0;
}

export async function testCartesiaKey(key?: string): Promise<{ ok: boolean; error?: string }> {
  const k = (key?.trim() || sleutel());
  if (!k) return { ok: false, error: 'Geen key ingesteld (Settings → Cartesia of VITE_CARTESIA_API_KEY)' };
  try {
    const res = await fetch('https://api.cartesia.ai/voices', {
      headers: { 'X-API-Key': k, 'Cartesia-Version': CARTESIA_VERSION },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    return { ok: false, error: `Cartesia HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cartesia unreachable' };
  }
}

export function getCartesiaVoiceId(): string {
  try {
    return localStorage.getItem(STEM_SLEUTEL)?.trim() || STANDAARD_STEM;
  } catch {
    return STANDAARD_STEM;
  }
}

export function setCartesiaVoiceId(id: string): void {
  const schoon = id.trim();
  try {
    if (schoon) localStorage.setItem(STEM_SLEUTEL, schoon);
    else localStorage.removeItem(STEM_SLEUTEL);
  } catch { /* ignore */ }
}

function taal(): string {
  return getReplyLanguage() === 'nl' ? 'nl' : 'en';
}

export function buildCartesiaSpeechRequest(transcript: string) {
  return {
    model_id: CARTESIA_MODEL,
    transcript,
    voice: { mode: 'id' as const, id: getCartesiaVoiceId() },
    language: taal(),
    output_format: {
      container: 'mp3' as const,
      encoding: 'mp3' as const,
      sample_rate: 44100,
    },
  };
}

let huidige: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let niveauData: Uint8Array<ArrayBuffer> | null = null;

export function getCartesiaTtsLevel(): number {
  if (!analyser || !niveauData || !huidige || huidige.paused) return 0;
  analyser.getByteTimeDomainData(niveauData);
  let som = 0;
  for (const v of niveauData) {
    const x = (v - 128) / 128;
    som += x * x;
  }
  return Math.min(1, Math.sqrt(som / niveauData.length) * 3.2);
}

export function stopCartesia(): void {
  if (huidige) {
    huidige.pause();
    huidige.src = '';
    huidige = null;
  }
}

/* `speakWithCartesia` stond hier. AXE spreekt sinds 29 sep 2026 alleen nog
   met de centrale Marin-stem via AXE Core, dus globalTts riep hem al niet
   meer aan en niemand anders deed dat ooit. `testCartesiaKey`, `stopCartesia`
   en `getCartesiaTtsLevel` blijven: Settings test de sleutel nog. */
