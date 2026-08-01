/**
 * installSpherePresent — wraps voiceStore.sendMessage so map/chart always
 * project on the sphere, regardless of which UI calls sendMessage.
 *
 * Pattern matches installLiveChat / installStableChat.
 */
import { useVoiceStore } from '@/presentation/store/voiceStore';
import {
  presentUserIntentOnSphere,
  presentAssistantReplyOnSphere,
} from '@/application/sphere/presentOnSphere';

let installed = false;

export function installSpherePresent(): void {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      const trimmed = (text || '').trim();

      // 1) Immediately project from user intent (map / chart / laat X zien)
      if (trimmed) {
        void presentUserIntentOnSphere(trimmed).catch((err) => {
          console.warn('[sphere] user intent present failed', err);
        });
      }

      const lenBefore = useVoiceStore.getState().conversation.length;

      await original(trimmed);

      // 2) After reply lands, catch OPEN_WINDOW maps/trading markers
      const conv = useVoiceStore.getState().conversation;
      if (conv.length > lenBefore) {
        const lastAxe = [...conv].reverse().find((m) => m.role === 'axe');
        if (lastAxe?.text) {
          void presentAssistantReplyOnSphere(lastAxe.text, trimmed).catch((err) => {
            console.warn('[sphere] assistant present failed', err);
          });
        }
      }
    },
  });

  console.info('[AXE CORE] Sphere Living Display installed on sendMessage');
}
