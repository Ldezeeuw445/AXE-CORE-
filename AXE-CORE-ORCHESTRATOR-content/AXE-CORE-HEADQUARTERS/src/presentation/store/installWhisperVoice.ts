/**
 * installWhisperVoice.ts
 *
 * Replaces voiceStore startListening / stopListening so AXE can hold a real
 * voice conversation:
 *  1. Mic on → record until silence (or user stops)
 *  2. Whisper (Groq free / OpenAI) → transcript
 *  3. sendMessage → ElevenLabs/Fish speaks
 *  4. When idle again → auto listen (until user stops)
 *
 * Browser Web Speech API is fallback when no Groq/OpenAI key exists.
 * Same pattern as installLiveChat: monkey-patch after store creation.
 */

import { useVoiceStore } from '@/presentation/store/voiceStore';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import { stopFishAudio } from '@/infrastructure/gateways/fishAudioService';
import {
  isWhisperAvailable,
  listenAndTranscribe,
  stopRecording,
} from '@/infrastructure/gateways/whisperService';

let conversationActive = false;
let loopGeneration = 0;

function waitUntilIdle(timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const s = useVoiceStore.getState().voiceStatus;
      if (s === 'idle' || s === 'listening') {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 250);
    };
    // Give sendMessage a moment to flip to processing/speaking
    setTimeout(tick, 300);
  });
}

async function whisperTurn(gen: number): Promise<'ok' | 'empty' | 'stop' | 'fail'> {
  try {
    const text = await listenAndTranscribe({ lang: 'nl' });
    if (!conversationActive || gen !== loopGeneration) return 'stop';
    if (!text) return 'empty';
    useVoiceStore.setState({ transcript: text, voiceStatus: 'processing', error: null });
    await useVoiceStore.getState().sendMessage(text);
    await waitUntilIdle();
    // Brief pause so TTS tail / echo doesn't re-trigger
    await new Promise((r) => setTimeout(r, 450));
    return conversationActive && gen === loopGeneration ? 'ok' : 'stop';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[WhisperVoice]', msg);
    useVoiceStore.setState({ error: msg.slice(0, 160) });
    return 'fail';
  }
}

async function browserSttOnce(): Promise<string> {
  const SpeechRecCtor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  if (!SpeechRecCtor) throw new Error('Speech recognition not supported.');

  return new Promise((resolve, reject) => {
    const rec = new SpeechRecCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'nl-NL';
    let final = '';
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      resolve(final.trim());
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      useVoiceStore.setState({
        transcript: (final || interim).trim(),
      });
      if (silenceTimer) clearTimeout(silenceTimer);
      // After a final chunk, wait for a short pause then accept the utterance
      if (final.trim()) {
        silenceTimer = setTimeout(finish, 1200);
      }
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') {
        resolve('');
        return;
      }
      if (event.error === 'aborted') {
        resolve(final.trim());
        return;
      }
      reject(new Error(event.error));
    };
    rec.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      resolve(final.trim());
    };
    rec.start();
    // Safety max
    setTimeout(finish, 30_000);
  });
}

async function runConversationLoop() {
  const gen = ++loopGeneration;
  conversationActive = true;

  stopTTS();
  stopFishAudio();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    useVoiceStore.setState({ micPermission: 'granted' });
  } catch {
    conversationActive = false;
    useVoiceStore.setState({
      voiceStatus: 'idle',
      error: 'Microphone permission denied.',
      micPermission: 'denied',
    });
    return;
  }

  const useWhisper = isWhisperAvailable();

  while (conversationActive && gen === loopGeneration) {
    useVoiceStore.setState({
      voiceStatus: 'listening',
      transcript: '',
      error: null,
    });

    if (useWhisper) {
      const result = await whisperTurn(gen);
      if (result === 'stop') break;
      if (result === 'fail') {
        // One failure: try browser STT for this turn, then keep looping
        try {
          const text = await browserSttOnce();
          if (!conversationActive || gen !== loopGeneration) break;
          if (!text) continue;
          useVoiceStore.setState({ transcript: text, voiceStatus: 'processing' });
          await useVoiceStore.getState().sendMessage(text);
          await waitUntilIdle();
          await new Promise((r) => setTimeout(r, 450));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          useVoiceStore.setState({ voiceStatus: 'idle', error: msg });
          break;
        }
      }
      // empty → loop again and keep listening
      continue;
    }

    // Browser-only path
    try {
      const text = await browserSttOnce();
      if (!conversationActive || gen !== loopGeneration) break;
      if (!text) continue;
      useVoiceStore.setState({ transcript: text, voiceStatus: 'processing' });
      await useVoiceStore.getState().sendMessage(text);
      await waitUntilIdle();
      await new Promise((r) => setTimeout(r, 450));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      useVoiceStore.setState({
        voiceStatus: 'idle',
        error: msg === 'not-allowed' ? 'Microphone blocked.' : `Speech error: ${msg}`,
      });
      break;
    }
  }

  if (gen === loopGeneration) {
    conversationActive = false;
    useVoiceStore.setState({ voiceStatus: 'idle', isGeminiLive: false });
  }
}

export function installWhisperVoice(): void {
  useVoiceStore.setState({
    startListening: async () => {
      if (conversationActive) return; // already in a loop
      await runConversationLoop();
    },
    stopListening: () => {
      conversationActive = false;
      loopGeneration++;
      try {
        stopRecording();
      } catch {
        /* ignore */
      }
      stopTTS();
      stopFishAudio();
      useVoiceStore.setState({ voiceStatus: 'idle', isGeminiLive: false });
    },
  });

  // Expose for debugging / UI badge
  try {
    (window as unknown as { __axeWhisper?: boolean }).__axeWhisper = isWhisperAvailable();
  } catch {
    /* ignore */
  }
}

export function isVoiceConversationActive(): boolean {
  return conversationActive;
}
