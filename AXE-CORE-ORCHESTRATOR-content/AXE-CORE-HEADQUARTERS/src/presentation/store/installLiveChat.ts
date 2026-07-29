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

/** Keep at most one non-empty axe reply after the latest user message. */
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
  const nonEmptyAxe = after.filter((m) => m.role === 'axe' && m.text.trim().length > 0);
  const others = after.filter((m) => m.role !== 'axe');

  // Ideal: exactly one non-empty axe, nothing else trailing
  if (others.length === 0 && nonEmptyAxe.length <= 1 && after.length === nonEmptyAxe.length) {
    return;
  }

  const firstAxe = nonEmptyAxe[0];
  const cleaned = firstAxe
    ? [...conv.slice(0, lastUser + 1), firstAxe]
    : conv.slice(0, lastUser + 1);

  if (cleaned.length !== conv.length) {
    useVoiceStore.setState({ conversation: cleaned });
  }
}

export function installLiveChat() {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      // Interrupt speech so the new turn feels immediate
      stopTTS();
      stopFishAudio();

      const turnId = beginChatTurn();

      try {
        await original(text);
      } finally {
        // Collapse empty / superseded trailing axe replies after a turn settles
        dedupeTrailingAxeReplies();

        // Abandoned request finishing late should not leave the sphere on "thinking"
        if (!isCurrentChatTurn(turnId)) {
          const st = useVoiceStore.getState().voiceStatus;
          if (st === 'processing' || st === 'speaking') {
            stopTTS();
            stopFishAudio();
            useVoiceStore.setState({ voiceStatus: 'idle' });
          }
        }
      }
    },
  });
}
