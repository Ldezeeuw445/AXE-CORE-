/**
 * installSecureChatBoost — runs AFTER installStableChat.
 * Ensures Talk/Act + reply language on every path that still falls through.
 */
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { classifyChatIntent, intentBadgeLabel } from '@/domain/chatIntent';
import { replyLanguageInstruction } from '@/domain/replyLanguage';

let installed = false;

export function installSecureChatBoost(): void {
  if (installed) return;
  installed = true;

  const previous = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;
      const intent = classifyChatIntent(text);
      try {
        sessionStorage.setItem('axe_chat_intent', intent);
        sessionStorage.setItem('axe_reply_lang_hint', replyLanguageInstruction().slice(0, 200));
      } catch { /* ignore */ }
      if (intent === 'act') {
        try {
          console.info('[AXE]', intentBadgeLabel(intent), text.slice(0, 100));
        } catch { /* ignore */ }
      }
      await previous(text);
    },
  });
}
