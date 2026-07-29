/**
 * Live-chat interrupt layer.
 *
 * Wraps voiceStore.sendMessage so Luka can keep typing while AXE is thinking
 * or speaking without the UI locking up, and without stale in-flight replies
 * stacking on top of a newer turn.
 *
 * Installed once from main.tsx at boot.
 */
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { beginChatTurn, isCurrentChatTurn } from '@/presentation/store/chatTurn';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import { stopFishAudio } from '@/infrastructure/gateways/fishAudioService';

let installed = false;

/** Keep at most one axe reply after the latest user message. */
function dedupeTrailingAxeReplies() {
  const conv = useVoiceStore.getState().conversation;
  let lastUser = -1;
  for (let i = conv.length - 1; i >= 0; i--) {
    if (conv[i].role === 'user') {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return;
  const after = conv.slice(lastUser + 1);
  // Drop empty axe bubbles (e.g. only "User Safety: safe" after sanitize)
  const nonEmpty = after.filter((m) => m.role !== 'axe' || m.text.trim().length > 0);
  // Keep only the first axe after the latest user (drops late superseded turns)
  const axes = nonEmpty.filter((m) => m.role === 'axe');
  if (after.length === nonEmpty.length && axes.length <= 1) return;
  const firstAxe = axes[0];
  const cleaned = firstAxe
    ? [...conv.slice(0, lastUser + 1), firstAxe]
    : conv.slice(0, lastUser + 1);
  useVoiceStore.setState({
    conversation: cleaned,
    voiceStatus: isCurrentChatTurn(0) ? useVoiceStore.getState().voiceStatus : useVoiceStore.getState().voiceStatus,
  });
}

export function installLiveChat() {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      // Interrupt speech + listening so the new turn feels immediate
      stopTTS();
      stopFishAudio();
      try {
        useVoiceStore.getState().stopListening();
      } catch {
        /* ignore */
      }

      const turnId = beginChatTurn();

      try {
        await original(text);
      } finally {
        // Always collapse stale/empty trailing axe replies after a turn settles
        dedupeTrailingAxeReplies();

        // If this turn was superseded, force idle so the sphere doesn't stick
        // on "thinking" from the abandoned request finishing late.
        if (!isCurrentChatTurn(turnId)) {
          const st = useVoiceStore.getState().voiceStatus;
          if (st === 'processing' || st === 'speaking') {
            useVoiceStore.setState({ voiceStatus: 'idle' });
          }
        }
      }
    },
  });
}
