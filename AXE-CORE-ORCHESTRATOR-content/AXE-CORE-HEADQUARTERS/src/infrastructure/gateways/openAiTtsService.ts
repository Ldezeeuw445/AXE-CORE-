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

export function getOpenAiStem(): OpenAiStem {
  try {
    const v = localStorage.getItem(STEM_SLEUTEL);
    if (v && (OPENAI_STEMMEN as readonly string[]).includes(v)) return v as OpenAiStem;
  } catch { /* privémodus */ }
  return STANDAARD_STEM;
}

export function setOpenAiStem(stem: OpenAiStem): void {
  try { localStorage.setItem(STEM_SLEUTEL, stem); } catch { /* privémodus */ }
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
      body: JSON.stringify({ model: MODEL, voice: stemOverride ?? getOpenAiStem(), input: spoken, response_format: 'mp3' }),
    });
    if (!res.ok) {
      opFout?.(`openai_tts_${res.status}: ${(await res.text()).slice(0, 200)}`);
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    huidige = audio;
    audio.onended = () => { URL.revokeObjectURL(url); huidige = null; opKlaar?.(); };
    audio.onerror = () => { URL.revokeObjectURL(url); huidige = null; opFout?.('audio_kon_niet_spelen'); };
    await audio.play();
  } catch (e) {
    opFout?.(e instanceof Error ? e.message : 'openai_tts_onbereikbaar');
  }
}
