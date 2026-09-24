import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Barge-in: does AXE actually stop talking the instant the user starts, and
 * does it genuinely feed that interruption back in as the next turn?
 *
 * Before this, installWhisperVoice never listened while voiceStatus was
 * 'speaking' — the loop's own waitUntilIdle() just polled for the reply to
 * finish, so interrupting AXE mid-sentence was structurally impossible, no
 * matter what a settings toggle claimed. It also called stopTTS() (Eleven
 * Labs) + stopFishAudio() everywhere "stop everything" was meant, while the
 * voice AXE actually speaks with (George via globalTts) is stopped by a THIRD
 * function, stopGlobalTts() — so even ending a call the normal way never
 * silenced the audio actually playing.
 *
 * Both are fixed here; these tests pin the fix down without needing real
 * audio hardware — that still needs a live human mic/speaker pass.
 */

const voiceState = {
  voiceStatus: 'speaking' as 'idle' | 'listening' | 'processing' | 'speaking',
  transcript: '',
  error: null as string | null,
};

vi.mock('@/presentation/store/voiceStore', () => ({
  useVoiceStore: {
    getState: () => voiceState,
    setState: (patch: Partial<typeof voiceState>) => Object.assign(voiceState, patch),
  },
}));

const stopTTS = vi.fn();
const stopFishAudio = vi.fn();
const stopGlobalTts = vi.fn();

vi.mock('@/infrastructure/gateways/elevenLabsService', () => ({ stopTTS: (...a: unknown[]) => stopTTS(...a) }));
vi.mock('@/infrastructure/gateways/fishAudioService', () => ({ stopFishAudio: (...a: unknown[]) => stopFishAudio(...a) }));
vi.mock('@/infrastructure/gateways/globalTts', () => ({ stopGlobalTts: (...a: unknown[]) => stopGlobalTts(...a) }));
vi.mock('@/infrastructure/gateways/whisperService', () => ({
  isWhisperAvailable: () => false,
  listenAndTranscribe: vi.fn(),
  stopRecording: vi.fn(),
  cancelRecording: vi.fn(),
  acquireMic: vi.fn(),
  releaseMic: vi.fn(),
}));

const {
  stopAllAudio,
  listenForBargeIn,
  speakAndAwaitOrInterrupt,
  hangUpListenForTypedInput,
  installWhisperVoiceSendGuard,
  isVoiceConversationActive,
} = await import('@/presentation/store/installWhisperVoice');

/** A controllable fake SpeechRecognition, one instance per call. */
class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((e: { resultIndex: number; results: Array<Array<{ transcript: string }>> }) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  start() { this.started = true; }
  stop() { this.stopped = true; this.onend?.(); }
  /** Test helper: push one interim chunk as the real API would deliver it. */
  say(text: string) {
    this.onresult?.({ resultIndex: 0, results: [[{ transcript: text }]] });
  }
}

let lastRec: FakeRecognition | null = null;

beforeEach(() => {
  voiceState.voiceStatus = 'speaking';
  voiceState.transcript = '';
  voiceState.error = null;
  stopTTS.mockReset();
  stopFishAudio.mockReset();
  stopGlobalTts.mockReset();
  lastRec = null;
  vi.stubGlobal('window', {
    ...globalThis.window,
    SpeechRecognition: class {
      constructor() { lastRec = new FakeRecognition(); return lastRec; }
    },
    webkitSpeechRecognition: undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stopAllAudio', () => {
  it('stops all three TTS providers, including the real one (globalTts/cedar)', () => {
    stopAllAudio();
    expect(stopGlobalTts).toHaveBeenCalledTimes(1);
    expect(stopTTS).toHaveBeenCalledTimes(1);
    expect(stopFishAudio).toHaveBeenCalledTimes(1);
  });
});

describe('listenForBargeIn', () => {
  it('ignores a short/noise chunk below the threshold', async () => {
    const { promise } = listenForBargeIn();
    lastRec!.say('uh');
    // Still open — no false trigger yet.
    let settled = false;
    promise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('resolves with the transcript once a real chunk arrives', async () => {
    const { promise } = listenForBargeIn();
    lastRec!.say('wacht even');
    await expect(promise).resolves.toBe('wacht even');
  });

  it('resolves null and stops the recognizer on cancel()', async () => {
    const { promise, cancel } = listenForBargeIn();
    cancel();
    await expect(promise).resolves.toBeNull();
    expect(lastRec!.stopped).toBe(true);
  });
});

describe('speakAndAwaitOrInterrupt', () => {
  it('stops all audio immediately and reports the interruption when the user talks over AXE', async () => {
    const outcome = speakAndAwaitOrInterrupt();
    lastRec!.say('nee stop even');

    const result = await outcome;
    expect(result.interruptedBy).toBe('nee stop even');
    expect(stopGlobalTts).toHaveBeenCalled();
    // The state flips straight to 'listening' with the interrupting text —
    // no lingering 'speaking', no waiting for AXE's sentence to finish.
    expect(voiceState.voiceStatus).toBe('listening');
    expect(voiceState.transcript).toBe('nee stop even');
  });

  it('reports no interruption once AXE finishes speaking on its own', async () => {
    const outcome = speakAndAwaitOrInterrupt();
    // Simulate the natural end of the reply.
    voiceState.voiceStatus = 'idle';
    vi.useFakeTimers();
    const p = outcome;
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();

    const result = await p;
    expect(result.interruptedBy).toBeNull();
    expect(stopGlobalTts).not.toHaveBeenCalled();
    // The barge-in recognizer must not be left running once AXE finished.
    expect(lastRec!.stopped).toBe(true);
  });
});

describe('hangUpListenForTypedInput', () => {
  it('doet niets als er geen gesprek loopt', () => {
    hangUpListenForTypedInput();
    expect(isVoiceConversationActive()).toBe(false);
  });
});

describe('installWhisperVoiceSendGuard', () => {
  it('laat een typed send door als er niet geluisterd wordt', async () => {
    const original = vi.fn();
    Object.assign(voiceState, { sendMessage: original });
    installWhisperVoiceSendGuard();
    const wrapped = (voiceState as { sendMessage: (t: string) => Promise<void> }).sendMessage;
    await wrapped('Hey axe');
    expect(original).toHaveBeenCalledWith('Hey axe');
    expect(isVoiceConversationActive()).toBe(false);
  });
});
