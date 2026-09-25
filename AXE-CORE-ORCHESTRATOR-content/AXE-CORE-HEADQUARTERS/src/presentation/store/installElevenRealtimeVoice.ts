/**
 * installElevenRealtimeVoice.ts
 *
 * One-click conversational voice for AXE.
 *
 * ElevenLabs Scribe is ONLY the ears. Every committed turn goes through the
 * existing voiceStore.sendMessage stack, so AXE keeps the same memory, tier
 * router, tools, approvals and agent orchestration as typed chat.
 *
 * If ElevenLabs realtime cannot start, the existing Whisper conversation loop
 * remains the fallback. No second assistant and no second brain.
 */

import { useVoiceStore } from '@/presentation/store/voiceStore';
import {
  createElevenLabsRealtimeScribeToken,
  isElevenLabsRealtimeScribeConfigured,
} from '@/infrastructure/gateways/elevenLabsService';
import {
  openRealtimeScribe,
  type RealtimeScribeSession,
} from '@/infrastructure/gateways/elevenRealtimeScribe';
import { usableTranscript } from '@/infrastructure/gateways/whisperGuard';
import { stopAllAudio } from '@/presentation/store/installWhisperVoice';

let installed = false;
let realtimeActive = false;
let realtimeStarting = false;
let fallbackActive = false;
let generation = 0;
let session: RealtimeScribeSession | null = null;
let lastSpeechEndedAt = 0;

function normalizedWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function looksLikeAxeEcho(text: string, axeResponse: string): boolean {
  const heard = normalizedWords(text);
  const spoken = normalizedWords(axeResponse);
  if (heard.length === 0 || spoken.length === 0) return false;

  const heardLine = heard.join(' ');
  const spokenLine = spoken.join(' ');
  if (heardLine.length >= 6 && spokenLine.includes(heardLine)) return true;

  const meaningful = heard.filter(word => word.length >= 3);
  if (meaningful.length < 2) return false;
  const spokenSet = new Set(spoken);
  const overlap = meaningful.filter(word => spokenSet.has(word)).length / meaningful.length;
  return overlap >= 0.75;
}

function immediateInterrupt(text: string): boolean {
  const line = text.toLowerCase().trim();
  return /^(stop|stoppen|wacht|ho|hou op|nee|wait|hold on|cancel|annuleer)\b/.test(line);
}

function shouldBargeIn(text: string, axeResponse: string): boolean {
  if (immediateInterrupt(text)) return true;
  if (text.replace(/\s/g, '').length < 8) return false;
  return !looksLikeAxeEcho(text, axeResponse);
}

function microphoneWasDenied(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'NotAllowedError' || error.name === 'SecurityError';
  }
  const text = error instanceof Error ? error.message : String(error);
  return /permission denied|notallowederror|microphone blocked/i.test(text);
}

export function isElevenRealtimeVoiceActive(): boolean {
  return realtimeActive || realtimeStarting;
}

export function installElevenRealtimeVoice(): void {
  if (installed) return;
  installed = true;

  // Installed after Whisper + its typed-send guard. These are the known-good
  // fallbacks and the canonical chat pipeline we keep using from realtime.
  const fallbackStart = useVoiceStore.getState().startListening;
  const fallbackStop = useVoiceStore.getState().stopListening;
  const baseSendMessage = useVoiceStore.getState().sendMessage;

  const closeRealtime = (setIdle = true) => {
    realtimeActive = false;
    realtimeStarting = false;
    generation += 1;
    const closing = session;
    session = null;
    if (closing) void closing.close();
    stopAllAudio();
    if (setIdle) {
      useVoiceStore.setState({
        voiceStatus: 'idle',
        transcript: '',
        isGeminiLive: false,
      });
    }
  };

  const startFallback = async (reason?: string) => {
    realtimeActive = false;
    realtimeStarting = false;
    session = null;
    fallbackActive = true;
    if (reason) {
      console.warn('[AXE realtime voice] ElevenLabs unavailable; Whisper fallback:', reason);
    }
    try {
      await fallbackStart();
    } finally {
      fallbackActive = false;
    }
  };

  // Keep the continuous session alive after each AXE answer. sendMessage
  // naturally returns the store to idle when the turn/TTS is done; in realtime
  // mode idle means "listen for the next turn", not "hang up".
  useVoiceStore.subscribe((state, previous) => {
    if (previous.voiceStatus === 'speaking' && state.voiceStatus !== 'speaking') {
      lastSpeechEndedAt = Date.now();
    }
    if (!realtimeActive) return;
    if (state.voiceStatus === 'idle' && previous.voiceStatus !== 'idle') {
      queueMicrotask(() => {
        if (realtimeActive && useVoiceStore.getState().voiceStatus === 'idle') {
          useVoiceStore.setState({ voiceStatus: 'listening', transcript: '' });
        }
      });
    }
  });

  const startRealtime = async () => {
    if (realtimeActive || realtimeStarting || fallbackActive) return;

    // A mic click means a spoken conversation. Do not leave the app in
    // "type-only" response mode and then make the user wonder why AXE is mute.
    useVoiceStore.getState().setResponseMode('speak');

    if (!isElevenLabsRealtimeScribeConfigured()) {
      await startFallback('no local ElevenLabs key on this surface');
      return;
    }

    // WKWebView locks WebAudio until it has been resumed from a direct user
    // gesture. Do this BEFORE the token network request so the later realtime
    // AudioContext is not born suspended after the click activation expired.
    try {
      const unlock = new AudioContext();
      if (unlock.state === 'suspended') await unlock.resume();
      void unlock.close();
    } catch { /* input can still fall back to Whisper */ }

    realtimeStarting = true;
    const myGeneration = ++generation;
    useVoiceStore.setState({
      voiceStatus: 'processing',
      transcript: '',
      error: null,
      isGeminiLive: false,
    });
    stopAllAudio();

    try {
      const token = await createElevenLabsRealtimeScribeToken();
      if (myGeneration !== generation || !realtimeStarting) return;

      const opened = await openRealtimeScribe(token, {
        onSessionStarted: () => {
          if (myGeneration !== generation) return;
          useVoiceStore.setState({
            micPermission: 'granted',
            voiceStatus: 'listening',
            transcript: '',
            error: null,
          });
        },

        onPartial: (raw) => {
          if (!realtimeActive || myGeneration !== generation) return;
          const text = raw.trim();
          if (!text) return;

          const state = useVoiceStore.getState();
          const busy = state.voiceStatus === 'speaking' || state.voiceStatus === 'processing';

          if (busy && shouldBargeIn(text, state.response)) {
            // True full-duplex behaviour: Luka talking wins immediately. The
            // existing live-chat layer will supersede the old model turn once
            // Scribe commits this new utterance.
            stopAllAudio();
            useVoiceStore.setState({
              voiceStatus: 'listening',
              transcript: text,
              error: null,
            });
            return;
          }

          // During AXE speech, an echo-looking partial stays hidden. When AXE
          // is listening, partial words are the live caption in the composer.
          if (!busy) {
            useVoiceStore.setState({
              voiceStatus: 'listening',
              transcript: text,
              error: null,
            });
          }
        },

        onCommitted: (raw) => {
          if (!realtimeActive || myGeneration !== generation) return;
          const text = usableTranscript(raw);
          if (!text) return;

          const state = useVoiceStore.getState();
          const echoWindow =
            state.voiceStatus === 'speaking' ||
            Date.now() - lastSpeechEndedAt < 1_200;
          if (echoWindow && looksLikeAxeEcho(text, state.response)) {
            return;
          }

          stopAllAudio();
          useVoiceStore.setState({
            voiceStatus: 'processing',
            transcript: text,
            error: null,
          });

          // Intentionally bypass the wrapper installed below: this is a voice
          // turn, not a typed turn that should hang up the microphone.
          void baseSendMessage(text).catch((error) => {
            if (!realtimeActive || myGeneration !== generation) return;
            useVoiceStore.setState({
              voiceStatus: 'listening',
              error: error instanceof Error ? error.message : String(error),
            });
          });
        },

        onError: (message) => {
          if (!realtimeActive || myGeneration !== generation) return;
          console.warn('[AXE realtime voice]', message);
          closeRealtime(false);
          void startFallback(`realtime error: ${message}`);
        },

        onClosed: (_code, reason) => {
          if (!realtimeActive || myGeneration !== generation) return;
          realtimeActive = false;
          session = null;
          void startFallback(`realtime connection closed: ${reason}`);
        },
      });

      if (myGeneration !== generation || !realtimeStarting) {
        await opened.close();
        return;
      }

      session = opened;
      realtimeStarting = false;
      realtimeActive = true;
      useVoiceStore.setState({
        micPermission: 'granted',
        voiceStatus: 'listening',
        transcript: '',
        error: null,
      });
    } catch (error) {
      if (myGeneration !== generation) return;
      realtimeStarting = false;
      realtimeActive = false;
      session = null;

      if (microphoneWasDenied(error)) {
        useVoiceStore.setState({
          voiceStatus: 'idle',
          micPermission: 'denied',
          error: 'Microphone permission denied. System Settings → Privacy → Microphone → AXE Core.',
        });
        return;
      }

      await startFallback(error instanceof Error ? error.message : String(error));
    }
  };

  useVoiceStore.setState({
    startListening: startRealtime,

    stopListening: () => {
      if (fallbackActive) {
        fallbackActive = false;
        fallbackStop();
        return;
      }
      closeRealtime(true);
    },

    // Typed input deliberately hangs up a realtime voice call, matching the
    // existing Whisper behaviour. Scribe commits call baseSendMessage directly
    // and therefore do NOT pass through this wrapper.
    sendMessage: async (text: string) => {
      if (realtimeActive || realtimeStarting) closeRealtime(false);
      return baseSendMessage(text);
    },
  });
}
