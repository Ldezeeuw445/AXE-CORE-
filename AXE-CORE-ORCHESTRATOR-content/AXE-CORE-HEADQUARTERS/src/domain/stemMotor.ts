/**
 * Welke stem-motor AXE mag gebruiken. George is de standaard.
 * De sleutel zelf staat niet hier — alleen de namen en wat het scherm mag zeggen.
 */
export type StemMotor =
  | 'george'
  | 'cedar'
  | 'elevenlabs-flash'
  | 'elevenlabs-v3'
  | 'cartesia'
  | 'fish';

export type ElevenLabsModel = 'eleven_flash_v2_5' | 'eleven_v3';

export const STEM_MOTOR_SLEUTEL = 'axe_stem_motor';

export interface StemMotorKeuze {
  id: StemMotor;
  naam: string;
  /** Eén regel, Engels, in de UI. */
  regel: string;
  /** Wat we in de PR/docs zeggen over latentie. */
  latency: string;
  streaming: boolean;
  /** Env-naam of Settings → Keys id. Geen waarde. */
  sleutel: string;
}

export const STEM_MOTOREN: readonly StemMotorKeuze[] = [
  {
    id: 'george',
    naam: 'George',
    regel: 'Kokoro-82M · bm_george · local · default',
    latency: '~1–2s first chunk, sentence-streamed, no key',
    streaming: true,
    sleutel: 'none — local com.axe.tts',
  },
  {
    id: 'cedar',
    naam: 'Cedar',
    regel: 'OpenAI gpt-4o-mini-tts · cedar · NL+EN',
    latency: '~0.6–1.2s per sentence if an OpenAI key is set',
    streaming: false,
    sleutel: 'Settings → Keys → OpenAI / VITE_OPENAI_API_KEY',
  },
  {
    id: 'elevenlabs-flash',
    naam: 'ElevenLabs Flash v2.5',
    regel: 'eleven_flash_v2_5 · low-latency · NL+EN',
    latency: '~0.3–0.7s per sentence if an ElevenLabs key is set',
    streaming: true,
    sleutel: 'Settings → Keys → ElevenLabs / VITE_ELEVENLABS_API_KEY',
  },
  {
    id: 'elevenlabs-v3',
    naam: 'ElevenLabs v3 Conversational',
    regel: 'eleven_v3 · conversational · NL+EN',
    latency: '~0.5–1.0s per sentence if an ElevenLabs key is set',
    streaming: true,
    sleutel: 'Settings → Keys → ElevenLabs / VITE_ELEVENLABS_API_KEY',
  },
  {
    id: 'cartesia',
    naam: 'Cartesia Sonic',
    regel: 'sonic-3 · low-latency · NL+EN',
    latency: '~0.2–0.6s per sentence if a Cartesia key is set',
    streaming: true,
    sleutel: 'Settings → Keys → Cartesia / VITE_CARTESIA_API_KEY',
  },
  {
    id: 'fish',
    naam: 'Fish',
    regel: 'Fish Audio s2 · NL+EN via existing key/VPS proxy',
    latency: '~0.8–1.5s per sentence if a Fish key or VPS proxy is set',
    streaming: false,
    sleutel: 'Settings → Keys · fish / VITE_FISH_AUDIO_API_KEY',
  },
];

export function parseStemMotor(raw: string | null | undefined): StemMotor {
  if (raw === 'elevenlabs') return 'elevenlabs-flash';
  if (
    raw === 'cedar' ||
    raw === 'elevenlabs-flash' ||
    raw === 'elevenlabs-v3' ||
    raw === 'cartesia' ||
    raw === 'fish'
  ) return raw;
  return 'george';
}

export function elevenLabsModelVan(motor: StemMotor): ElevenLabsModel {
  return motor === 'elevenlabs-v3' ? 'eleven_v3' : 'eleven_flash_v2_5';
}
