/**
 * OpenAI als stem.
 *
 * ## Arbor zit hier niet bij, en dat is geen vergissing
 *
 * Arbor is een stem van de ChatGPT-APP (Advanced Voice / GPT-Live), samen met
 * Breeze, Juniper, Cove en Ember. De API voert een andere, vaste lijst — 13
 * stemmen, nagelezen in OpenAI's eigen TTS-gids op 16 september 2026 — en Arbor
 * staat daar niet tussen. Een app-stem is niet op te halen met een sleutel; hij
 * bestaat alleen binnen ChatGPT zelf.
 *
 * Wat er wél is: `marin` en `cedar`, door OpenAI zelf aangeraden als hun beste,
 * en allebei alleen op `gpt-4o-mini-tts`. Dat is de dichtstbijzijnde route naar
 * "de stem van ChatGPT" die met een sleutel te draaien is.
 *
 * ## Waarom de sleutel uit dezelfde la komt als de rest
 *
 * `axe_llm_connections` in localStorage, net als ElevenLabs hierboven. Eén plek
 * waar sleutels staan; een tweede zou betekenen dat "geen stem" twee oorzaken
 * kan hebben.
 */

import { normalizeForSpeech } from '@/domain/speechText';

/** De stemmen die de API voert (gpt-4o-mini-tts). */
export const OPENAI_STEMMEN = [
  'marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral',
  'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const;

export type OpenAiStem = (typeof OPENAI_STEMMEN)[number];

/** The AXE voice. cedar is OpenAI's newest, warmest natural voice — the closest
 *  a key can get to the ChatGPT "Arbor" sound. This is the one fixed AXE voice. */
export const STANDAARD_STEM: OpenAiStem = 'cedar';

const STEM_SLEUTEL = 'axe_openai_stem';
const MODEL = 'gpt-4o-mini-tts';

/**
 * AXE's speaking character. Voice identity comes from Cedar; this controls the
 * delivery so it stays calm and easy to listen to instead of drifting into an
 * over-animated assistant cadence.
 */
export const AXE_SPEECH_INSTRUCTIONS =
  'Speak in the language of the input, using a calm, low, warm adult male voice. ' +
  'Sound natural, grounded and understated, like a trusted technical copilot sitting nearby. ' +
  'Use a relaxed, moderately slow natural pace with short pauses, stable pitch and subtle warmth. ' +
  'Sound attentive, not sleepy. Avoid announcer cadence, exaggerated enthusiasm, sales tone, ' +
  'over-enunciation, theatrical emphasis, singing or whispering. ' +
  'For Dutch use fluent neutral Dutch; for English use a subtle calm British accent without caricature. ' +
  'Do not add or remove information.';

export function buildOpenAiSpeechRequest(input: string, voice: OpenAiStem) {
  return {
    model: MODEL,
    voice,
    input,
    instructions: AXE_SPEECH_INSTRUCTIONS,
    response_format: 'mp3' as const,
  };
}

export function getOpenAiStem(): OpenAiStem {
  // AXE has one voice identity. Legacy saved voice choices must never override it.
  return STANDAARD_STEM;
}

export function setOpenAiStem(_stem: OpenAiStem): void {
  // Kept as a compatibility no-op for older Settings callers. AXE voice is fixed.
  try { localStorage.removeItem(STEM_SLEUTEL); } catch { /* privémodus */ }
}

function sleutel(): string {
  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, { key?: string } | undefined>;
    return (conns.openai?.key ?? '').trim();
  } catch {
    return '';
  }
}

export function isOpenAiTtsConfigured(): boolean {
  return sleutel().length > 0;
}

let huidige: HTMLAudioElement | null = null;
let axeAudioContext: AudioContext | null = null;
let axeAnalyser: AnalyserNode | null = null;
let axeLevelData: Uint8Array<ArrayBuffer> | null = null;

/** Live 0..1 RMS of AXE's actual TTS playback, sampled by VoiceBeam. */
export function getAxeTtsLevel(): number {
  if (!axeAnalyser || !axeLevelData || !huidige || huidige.paused) return 0;
  axeAnalyser.getByteTimeDomainData(axeLevelData);
  let sum = 0;
  for (const v of axeLevelData) { const x = (v - 128) / 128; sum += x * x; }
  return Math.min(1, Math.sqrt(sum / axeLevelData.length) * 3.2);
}

export function stopOpenAiTts(): void {
  if (huidige) {
    huidige.pause();
    huidige.src = '';
    huidige = null;
  }
}

/**
 * Spreek `tekst` uit. Faalt hij, dan roept hij `opFout` met de reden van OpenAI
 * zelf — "429 rate limit" en "401 bad key" hebben tegengestelde oplossingen, en
 * één nette zin verbergt welke van de twee je hebt.
 */
export async function speakWithOpenAi(
  tekst: string,
  opKlaar?: () => void,
  opFout?: (reden: string) => void,
  stemOverride?: OpenAiStem,
): Promise<void> {
  const key = sleutel();
  if (!key) { opFout?.('no_openai_key'); return; }

  const spoken = normalizeForSpeech(tekst);
  if (!spoken) { opKlaar?.(); return; }

  stopOpenAiTts();
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOpenAiSpeechRequest(spoken, stemOverride ?? getOpenAiStem())),
    });
    if (!res.ok) {
      opFout?.(`openai_tts_${res.status}: ${(await res.text()).slice(0, 200)}`);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    huidige = audio;
    // Route playback through one analyser so the AXE composer reacts to the
    // voice that is actually coming out of the speakers, not a fake timer.
    axeAudioContext ??= new AudioContext();
    void axeAudioContext.resume().catch(() => {});
    const source = axeAudioContext.createMediaElementSource(audio);
    axeAnalyser = axeAudioContext.createAnalyser();
    axeAnalyser.fftSize = 512;
    axeLevelData = new Uint8Array(axeAnalyser.fftSize);
    source.connect(axeAnalyser);
    axeAnalyser.connect(axeAudioContext.destination);
    audio.onended = () => { URL.revokeObjectURL(url); huidige = null; opKlaar?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); huidige = null; opFout?.('audio_kon_niet_spelen'); };
    await audio.play();
  } catch (e) {
    opFout?.(e instanceof Error ? e.message : 'openai_tts_onbereikbaar');
  }
}
