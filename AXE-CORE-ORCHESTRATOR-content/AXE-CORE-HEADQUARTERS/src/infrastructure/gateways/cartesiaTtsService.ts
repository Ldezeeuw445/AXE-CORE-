/**
 * Cartesia Sonic — lage-latentie TTS (NL+EN).
 *
 * Sleutel uit Settings → Keys (`axe_llm_connections.cartesia`) of
 * `VITE_CARTESIA_API_KEY`. Geen waarde in deze repo.
 * Stem-id is publiek en overschrijfbaar via localStorage `axe_cartesia_voice`.
 */
import { normalizeForSpeech } from '@/domain/speechText';
import { getReplyLanguage } from '@/domain/replyLanguage';

const ENV_CARTESIA_KEY = import.meta.env.VITE_CARTESIA_API_KEY ?? '';
const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2025-04-16';
const CARTESIA_MODEL = 'sonic-3';
const STEM_SLEUTEL = 'axe_cartesia_voice';
/** Publiek demo-id (British Man) — geen geheim. */
const STANDAARD_STEM = '79a125e8-cd45-4c13-8a67-188112f4dd22';

function sleutel(): string {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string } | undefined
    >;
    return (conns.cartesia?.key ?? '').trim() || ENV_CARTESIA_KEY.trim();
  } catch {
    return ENV_CARTESIA_KEY.trim();
  }
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

function stemId(): string {
  try {
    return localStorage.getItem(STEM_SLEUTEL)?.trim() || STANDAARD_STEM;
  } catch {
    return STANDAARD_STEM;
  }
}

function taal(): string {
  return getReplyLanguage() === 'nl' ? 'nl' : 'en';
}

export function buildCartesiaSpeechRequest(transcript: string) {
  return {
    model_id: CARTESIA_MODEL,
    transcript,
    voice: { mode: 'id' as const, id: stemId() },
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

export async function speakWithCartesia(
  tekst: string,
  opKlaar?: () => void,
  opFout?: (reden: string) => void,
  opStart?: () => void,
): Promise<void> {
  const key = sleutel();
  if (!key) {
    opFout?.('no_cartesia_key');
    return;
  }
  const spoken = normalizeForSpeech(tekst);
  if (!spoken) {
    opKlaar?.();
    return;
  }
  stopCartesia();
  try {
    const res = await fetch(CARTESIA_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': key,
        'Cartesia-Version': CARTESIA_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildCartesiaSpeechRequest(spoken)),
    });
    if (!res.ok) {
      opFout?.(`cartesia_tts_${res.status}: ${(await res.text()).slice(0, 200)}`);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    huidige = audio;
    ctx ??= new AudioContext();
    void ctx.resume().catch(() => {});
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      niveauData = new Uint8Array(analyser.fftSize);
      analyser.connect(ctx.destination);
    }
    ctx.createMediaElementSource(audio).connect(analyser);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      huidige = null;
      opKlaar?.();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      huidige = null;
      opFout?.('audio_kon_niet_spelen');
    };
    await audio.play();
    opStart?.();
  } catch (e) {
    opFout?.(e instanceof Error ? e.message : 'cartesia_tts_onbereikbaar');
  }
}
