/**
 * elevenLabsService.ts
 * High-quality text-to-speech via ElevenLabs API.
 * Falls back to browser speechSynthesis if ElevenLabs is not configured.
 */

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Available voices — curated for natural, non-robotic sound
export const ELEVENLABS_VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', accent: 'American', gender: 'Male', description: 'Deep, calm, authoritative' },
  { id: ' ErXwobaYiN019PkySvjVM', name: 'Antoni', accent: 'American', gender: 'Male', description: 'Warm, friendly, natural' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', accent: 'American', gender: 'Female', description: 'Warm, friendly, conversational' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', accent: 'British', gender: 'Female', description: 'Soft, elegant, refined' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', accent: 'Australian', gender: 'Male', description: 'Casual, approachable, natural' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', accent: 'American', gender: 'Female', description: 'Clear, professional, warm' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', accent: 'British', gender: 'Male', description: 'Authoritative, deep, commanding' },
  { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', accent: 'American', gender: 'Male', description: 'Young, energetic, upbeat' },
];

export function getSelectedVoiceId(): string {
  return localStorage.getItem('axe_tts_voice') ?? ELEVENLABS_VOICES[1].id; // Default: Antoni
}

export function setSelectedVoiceId(voiceId: string): void {
  localStorage.setItem('axe_tts_voice', voiceId);
}

export function isElevenLabsConfigured(): boolean {
  return !!ELEVENLABS_API_KEY;
}

/**
 * Speak text using ElevenLabs if configured, otherwise fall back to browser TTS.
 */
export async function speakWithElevenLabs(
  text: string,
  onDone?: () => void,
  onError?: () => void,
): Promise<void> {
  // Try ElevenLabs first
  if (isElevenLabsConfigured()) {
    try {
      const voiceId = getSelectedVoiceId();
      const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.slice(0, 4000), // ElevenLabs limit
          model_id: 'eleven_turbo_v2_5', // Fastest, most natural model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onended = () => {
        URL.revokeObjectURL(url);
        onDone?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        onError?.();
      };

      await audio.play();
      return;
    } catch (err) {
      console.warn('[ElevenLabs] TTS failed, falling back to browser:', err);
      // Fall through to browser TTS
    }
  }

  // Browser fallback
  speakWithBrowser(text, onDone);
}

/**
 * Browser speechSynthesis fallback.
 */
export function speakWithBrowser(text: string, onDone?: () => void): void {
  try {
    if (!('speechSynthesis' in window)) {
      onDone?.();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'nl-NL';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find a natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = [
      'Google US English',
      'Samantha',
      'Alex',
      'Daniel',
      'Google UK English Male',
      'Google UK English Female',
    ];
    
    for (const name of preferredVoices) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) {
        utterance.voice = voice;
        break;
      }
    }

    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();

    window.speechSynthesis.speak(utterance);
  } catch {
    onDone?.();
  }
}

/**
 * Stop any active TTS.
 */
export function stopTTS(): void {
  try {
    window.speechSynthesis.cancel();
  } catch { /* ignore */ }
}
