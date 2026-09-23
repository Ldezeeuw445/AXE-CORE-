/**
 * installWhisperVoice.ts
 *
 * Replaces voiceStore startListening / stopListening so AXE can hold a real
 * voice conversation:
 *  1. Mic on → record until silence (or user stops)
 *  2. Whisper (Groq free / OpenAI) → transcript
 *  3. sendMessage → the single AXE voice (George via globalTts; Cedar only
 *     if George cannot make a sound) speaks, while the reply types along
 *  4. When idle again → auto listen (until user stops)
 *  5. If the user starts talking WHILE AXE is speaking, that counts as the
 *     next turn immediately — see listenForBargeIn() below.
 *
 * Browser Web Speech API is fallback when no Groq/OpenAI key exists.
 * Same pattern as installLiveChat: monkey-patch after store creation.
 */

import { useVoiceStore } from '@/presentation/store/voiceStore';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import { stopFishAudio } from '@/infrastructure/gateways/fishAudioService';
import { stopGlobalTts } from '@/infrastructure/gateways/globalTts';
import {
  isWhisperAvailable,
  listenAndTranscribe,
  stopRecording,
} from '@/infrastructure/gateways/whisperService';

let conversationActive = false;
let loopGeneration = 0;

/**
 * Kill every TTS path at once.
 *
 * Found 21 sep while building barge-in: this file called stopTTS() (Eleven
 * Labs) + stopFishAudio() everywhere, but the voice AXE actually speaks with
 * is George via globalTts.speakGlobal() (voiceStore.ts's speakSafely).
 * Ending a conversation, or a barge-in cutting AXE off, therefore never
 * silenced the audio that was actually playing -- it silenced two providers
 * that were never the one running. stopGlobalTts() covers George, Cedar,
 * Fish and ElevenLabs; keep calling the other two too so a request built
 * against an older store shape is still covered.
 */
export function stopAllAudio(): void {
  stopGlobalTts();
  stopTTS();
  stopFishAudio();
}

/**
 * How many non-space characters of an interim transcript it takes before a
 * sound is treated as the user actually talking, not a breath, a chair
 * creak, or the tail of AXE's own voice leaking past echo cancellation.
 *
 * Interim results are used (not final) because waiting for a final result
 * means waiting for a silence gap first -- exactly the latency barge-in is
 * supposed to remove. The cost is more false-trigger risk, which is what
 * this threshold, and requiring an *interruption*-worthy chunk rather than
 * one syllable, is for.
 */
const BARGE_IN_MIN_CHARS = 4;

/**
 * Listen for the user starting to talk while AXE is still speaking.
 *
 * Runs a SEPARATE SpeechRecognition instance from the one browserSttOnce()
 * uses for normal turns -- sharing one would mean whichever call started it
 * last wins control of it, and a barge-in listener that can be silently
 * stolen by the next normal turn is not a barge-in listener.
 *
 * Resolves with the interrupting transcript the moment one arrives, or with
 * null if `cancel()` is called first (the normal case: AXE finished talking
 * on its own and the caller no longer needs this race to keep listening).
 *
 * Real-world caveat this cannot fully solve from application code: the Web
 * Speech API does not expose the getUserMedia constraints (echoCancellation,
 * noiseSuppression) that would let this ask for stronger self-hearing
 * protection explicitly. It relies on the browser/OS's own acoustic echo
 * cancellation, which is generally solid on Mac + Chrome/Safari but is most
 * reliable with headphones. This is a documented limitation, not a silent
 * gap -- see the Phase 3 report for the plain-language version.
 */
export function listenForBargeIn(): { promise: Promise<string | null>; cancel: () => void } {
  const SpeechRecCtor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  if (!SpeechRecCtor) {
    // No barge-in on a platform without Web Speech — AXE still finishes the
    // turn correctly, it just cannot be interrupted mid-sentence there.
    return { promise: new Promise(() => {}), cancel: () => {} };
  }

  let done = false;
  let rec: SpeechRecognition | null = null;
  let resolveFn: (v: string | null) => void = () => {};

  const promise = new Promise<string | null>((resolve) => {
    resolveFn = resolve;
    try {
      rec = new SpeechRecCtor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'nl-NL';

      rec.onresult = (event: SpeechRecognitionEvent) => {
        if (done) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript.trim();
          if (chunk.replace(/\s/g, '').length >= BARGE_IN_MIN_CHARS) {
            done = true;
            try { rec?.stop(); } catch { /* ignore */ }
            resolve(chunk);
            return;
          }
        }
      };
      // 'aborted' fires on our own cancel() — not a real error, resolve null
      // rather than reject so the caller's race doesn't need a catch just
      // for the expected shutdown path.
      rec.onerror = () => { if (!done) { done = true; resolve(null); } };
      rec.onend = () => { if (!done) { done = true; resolve(null); } };
      rec.start();
    } catch {
      if (!done) { done = true; resolve(null); }
    }
  });

  return {
    promise,
    cancel: () => {
      if (done) return;
      done = true;
      try { rec?.stop(); } catch { /* ignore */ }
      resolveFn(null);
    },
  };
}

function waitUntilIdle(timeoutMs = 120_000): Promise<'idle' | 'timeout'> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const s = useVoiceStore.getState().voiceStatus;
      if (s === 'idle' || s === 'listening') {
        resolve('idle');
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve('timeout');
        return;
      }
      setTimeout(tick, 250);
    };
    // Give sendMessage a moment to flip to processing/speaking
    setTimeout(tick, 300);
  });
}

/**
 * Wait for AXE's reply to finish speaking, OR for the user to start talking
 * over it — whichever happens first.
 *
 * This is the barge-in itself: as soon as `listenForBargeIn` produces a
 * transcript, this stops all audio immediately, marks the turn as
 * interrupted, and hands back the interrupting text so the caller can treat
 * it as the next turn's input without any extra silence-gap or button press.
 */
export async function speakAndAwaitOrInterrupt(): Promise<{ interruptedBy: string | null }> {
  const barge = listenForBargeIn();
  const idle = waitUntilIdle();

  const winner = await Promise.race([
    idle.then((r) => ({ kind: 'idle' as const, r })),
    barge.promise.then((text) => ({ kind: 'barge' as const, text })),
  ]);

  if (winner.kind === 'barge' && winner.text) {
    // The user is now the one talking — kill AXE's voice this instant. Do
    // not wait for the natural end of the sentence; that delay is exactly
    // what a real interruption must not have.
    stopAllAudio();
    useVoiceStore.setState({ voiceStatus: 'listening', transcript: winner.text, error: null });
    return { interruptedBy: winner.text };
  }

  // AXE finished on its own (or timed out) — the barge-in listener is no
  // longer needed for this turn.
  barge.cancel();
  return { interruptedBy: null };
}

/**
 * Live words while Luka talks. Whisper only transcribes AFTER he stops, so
 * the screen stayed empty for the whole sentence. This runs the platform's
 * own recognizer alongside the recording purely for DISPLAY: it writes the
 * interim words into `transcript` (which the composer and the presence dock
 * already show), and Whisper's final text replaces it once it arrives.
 *
 * Display only -- it never sends anything. If the recognizer is missing or
 * refused (no NSSpeechRecognitionUsageDescription, permission denied), the
 * words simply appear at the end like before; the conversation still works.
 */
function startLiveCaption(gen: number): { stop: () => void } {
  const SpeechRecCtor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
  if (!SpeechRecCtor) return { stop: () => {} };

  let gestopt = false;
  let rec: SpeechRecognition | null = null;
  let final = '';
  // A recognizer that keeps failing (network, audio-capture) would otherwise
  // restart itself in a hot loop for the whole utterance.
  let herstarts = 0;
  const start = () => {
    if (gestopt || herstarts++ > 12) return;
    try {
      rec = new SpeechRecCtor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'nl-NL';
      rec.onresult = (event: SpeechRecognitionEvent) => {
        if (gestopt || gen !== loopGeneration) return;
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += t;
          else interim += t;
        }
        const zichtbaar = `${final} ${interim}`.replace(/\s+/g, ' ').trim();
        if (zichtbaar && useVoiceStore.getState().voiceStatus === 'listening') {
          useVoiceStore.setState({ transcript: zichtbaar });
        }
      };
      // Refused or unsupported: stop quietly, Whisper still does the real work.
      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') gestopt = true;
      };
      // WebKit ends a recognizer after a pause; keep captions going for the
      // whole utterance until Whisper's recording is done.
      rec.onend = () => { if (!gestopt) start(); };
      rec.start();
    } catch {
      gestopt = true;
    }
  };
  start();
  return {
    stop: () => {
      gestopt = true;
      try { rec?.abort(); } catch { /* ignore */ }
    },
  };
}

async function whisperTurn(gen: number): Promise<'ok' | 'empty' | 'stop' | 'fail'> {
  try {
    const caption = startLiveCaption(gen);
    let text: string;
    try {
      text = await listenAndTranscribe();
    } finally {
      // Stop BEFORE Whisper's text is used, so a late interim result can
      // never overwrite the accurate final transcript.
      caption.stop();
    }
    if (!conversationActive || gen !== loopGeneration) return 'stop';
    if (!text) return 'empty';
    return await runTurn(text, gen);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[WhisperVoice]', msg);
    useVoiceStore.setState({ error: msg.slice(0, 160) });
    return 'fail';
  }
}

/**
 * Send one utterance and see it through to either a finished reply or a
 * barge-in. A barge-in feeds its captured text back into this same function
 * — that is "the interruption is processed as new input" — bounded to 4
 * hops so a pathological run of instant, near-empty barge-ins cannot spin
 * forever without ever reaching `waitUntilIdle`'s own timeout.
 */
async function runTurn(text: string, gen: number, depth = 0): Promise<'ok' | 'empty' | 'stop' | 'fail'> {
  useVoiceStore.setState({ transcript: text, voiceStatus: 'processing', error: null });
  await useVoiceStore.getState().sendMessage(text);
  if (!conversationActive || gen !== loopGeneration) return 'stop';

  const { interruptedBy } = await speakAndAwaitOrInterrupt();
  if (!conversationActive || gen !== loopGeneration) return 'stop';

  if (interruptedBy && depth < 4) {
    return runTurn(interruptedBy, gen, depth + 1);
  }

  // Brief pause so TTS tail / echo doesn't re-trigger the next listen.
  await new Promise((r) => setTimeout(r, 450));
  return conversationActive && gen === loopGeneration ? 'ok' : 'stop';
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

  stopAllAudio();

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
          const outcome = await runTurn(text, gen);
          if (outcome === 'stop') break;
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
      const outcome = await runTurn(text, gen);
      if (outcome === 'stop') break;
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
      stopAllAudio();
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
