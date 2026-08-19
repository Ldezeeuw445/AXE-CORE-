/**
 * VisionCaptureButton — explicit "AXE looks" control for chat/voice UI.
 *
 * Flow: click → permission → one JPEG frame → callVision (Gemini preferred)
 * → append user+axe messages to the conversation. Camera stops immediately.
 */
import { useState, useCallback } from 'react';
import { Camera, Loader2, EyeOff } from 'lucide-react';
import {
  captureWebcamFrame,
  isWebcamSupported,
  WebcamCaptureError,
} from '@/infrastructure/gateways/webcamCaptureService';
import { callVision } from '@/infrastructure/gateways/visionGateway';
import { captureToMemoryOnDevice, onDeviceCameraAvailable } from '@/infrastructure/gateways/onDeviceModel';
import { useVoiceStore, type ConversationMessage } from '@/presentation/store/voiceStore';
import type { KeySlot } from '@/domain/providers';
import { PROVIDERS, isKeyOptional, migrateModel } from '@/domain/providers';
import { normalizeProviderBaseUrl } from '@/infrastructure/config/providerConnectionDefaults';

const ENV_KEYS: Partial<Record<string, string>> = {
  google: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
};

function collectVisionSlots(
  primary: KeySlot | null,
  fb1: KeySlot | null,
  fb2: KeySlot | null,
  fb3: KeySlot | null,
): KeySlot[] {
  const out: KeySlot[] = [];
  const seen = new Set<string>();
  const push = (s: KeySlot | null | undefined) => {
    if (!s?.provider || seen.has(s.provider)) return;
    seen.add(s.provider);
    out.push(s);
  };
  push(primary);
  push(fb1);
  push(fb2);
  push(fb3);

  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string; model?: string; baseUrl?: string } | undefined
    >;
    for (const id of ['google', 'openai', 'anthropic', 'openrouter'] as const) {
      if (seen.has(id)) continue;
      const cfg = PROVIDERS.find((p) => p.id === id);
      const conn = conns[id];
      const key = conn?.key || ENV_KEYS[id] || '';
      if (!key && !isKeyOptional(id)) continue;
      const baseUrl = normalizeProviderBaseUrl(id, conn?.baseUrl || cfg?.baseUrl);
      const model = migrateModel(id, conn?.model) || cfg?.defaultModel;
      push({ provider: id, key, model, baseUrl });
    }
  } catch {
    /* ignore */
  }
  return out;
}

interface Props {
  prompt?: string;
  className?: string;
  compact?: boolean;
}

export function VisionCaptureButton({ prompt, className, compact }: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const primarySlot = useVoiceStore((s) => s.primarySlot);
  const fallback1Slot = useVoiceStore((s) => s.fallback1Slot);
  const fallback2Slot = useVoiceStore((s) => s.fallback2Slot);
  const fallback3Slot = useVoiceStore((s) => s.fallback3Slot);

  // The Android shell has a camera even when the WebView has no getUserMedia —
  // it goes through the native capture. Without this the button greyed itself
  // out as "No camera" on the one device that has the best camera of the lot.
  const supported = isWebcamSupported() || onDeviceCameraAvailable();

  const run = useCallback(async () => {
    if (busy) return;

    // On the phone, hand this to the native camera instead.
    //
    // Three reasons, in the order they matter: it reads the text on-device and
    // stores it in AXON, so it works with no signal — which is the whole point
    // of the phone build; the system camera focuses and exposes far better than
    // getUserMedia inside a WebView; and it needs no camera permission of ours.
    //
    // What Android gives up is the "describe what you see" answer, which needs
    // a vision model and therefore a connection. Reading a whiteboard into
    // memory is the thing worth having in a pocket; describing a scene is the
    // thing worth having at a desk.
    if (captureToMemoryOnDevice()) return;

    setErr(null);
    setBusy(true);
    useVoiceStore.setState({ voiceStatus: 'processing', error: null });

    try {
      const frame = await captureWebcamFrame({ maxWidth: 1280, quality: 0.82 });
      setPreview(frame.dataUrl);

      const userText = (prompt ?? 'Wat zie je? Beschrijf kort wat er op de foto staat.').trim();
      const userMsg: ConversationMessage = {
        role: 'user',
        text: `${userText}\n\n[📷 camera snapshot]`,
        timestamp: Date.now(),
      };
      useVoiceStore.setState((s) => ({
        conversation: [...s.conversation, userMsg],
      }));

      const slots = collectVisionSlots(primarySlot, fallback1Slot, fallback2Slot, fallback3Slot);
      const { text, slot } = await callVision(slots, {
        prompt: userText,
        imageBase64: frame.base64,
        mimeType: frame.mimeType,
      });

      const axeMsg: ConversationMessage = {
        role: 'axe',
        text,
        timestamp: Date.now(),
        provider: slot.provider,
        model: slot.model,
      };
      useVoiceStore.setState((s) => ({
        conversation: [...s.conversation, axeMsg],
        response: text,
        voiceStatus: 'speaking',
        activeProvider: slot.provider,
        error: null,
      }));

      try {
        if (localStorage.getItem('axe_response_mode') !== 'type') {
          const { speakWithBrowser } = await import('@/infrastructure/gateways/elevenLabsService');
          const { isFishAudioConfigured, speakWithFishAudio } = await import(
            '@/infrastructure/gateways/fishAudioService'
          );
          const done = () => useVoiceStore.setState({ voiceStatus: 'idle' });
          let tts: 'fish' | 'elevenlabs' | 'browser' = 'fish';
          try {
            tts = (localStorage.getItem('axe_tts_provider') as typeof tts) || 'fish';
          } catch {
            /* */
          }
          if (tts === 'fish' && isFishAudioConfigured()) {
            void speakWithFishAudio(text, done, () => speakWithBrowser(text, done));
          } else {
            speakWithBrowser(text, done);
          }
        } else {
          useVoiceStore.setState({ voiceStatus: 'idle' });
        }
      } catch {
        useVoiceStore.setState({ voiceStatus: 'idle' });
      }

      setTimeout(() => setPreview(null), 2500);
    } catch (e) {
      const msg =
        e instanceof WebcamCaptureError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setErr(msg);
      useVoiceStore.setState({ voiceStatus: 'idle', error: msg });
    } finally {
      setBusy(false);
    }
  }, [busy, prompt, primarySlot, fallback1Slot, fallback2Slot, fallback3Slot]);

  const btnClass =
    className ??
    'inline-flex items-center gap-1.5 px-2.5 h-9 rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300 text-xs font-medium hover:bg-cyan-400/20 disabled:opacity-50 transition-all';

  if (!supported) {
    return (
      <button type="button" disabled title="Camera not supported" className={btnClass} style={{ opacity: 0.35 }}>
        <EyeOff size={compact ? 12 : 16} />
        {!compact && <span className="ml-1 text-[11px]">No camera</span>}
      </button>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        title="AXE looks (one snapshot)"
        className={btnClass}
      >
        {busy ? (
          <Loader2 size={compact ? 12 : 16} className="animate-spin" />
        ) : (
          <Camera size={compact ? 12 : 16} />
        )}
        {!compact && <span>{busy ? 'Looking…' : 'Look'}</span>}
      </button>
      {preview && (
        <img
          src={preview}
          alt="Snapshot"
          className="absolute bottom-full mb-2 left-0 w-28 h-20 object-cover rounded-lg border border-white/10 shadow-lg z-20"
        />
      )}
      {err && (
        <span className="absolute top-full mt-1 left-0 text-[10px] text-red-400/90 max-w-[200px] z-20">{err}</span>
      )}
    </div>
  );
}

export default VisionCaptureButton;
