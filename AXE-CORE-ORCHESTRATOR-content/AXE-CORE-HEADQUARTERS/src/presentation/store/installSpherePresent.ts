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
import { toast } from 'sonner';

let installed = false;

export function installSpherePresent(): void {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      const trimmed = (text || '').trim();

      // 1) Project from user intent FIRST (await so UI updates before LLM)
      if (trimmed) {
        try {
          const did = await presentUserIntentOnSphere(trimmed);
          if (did) {
            toast.message('Sphere', { description: `Projecting · ${trimmed.slice(0, 40)}` });
          }
        } catch (err) {
          console.warn('[sphere] user intent present failed', err);
          toast.error('Sphere project failed', {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const lenBefore = useVoiceStore.getState().conversation.length;

      await original(trimmed);

      // 2) After reply lands, catch OPEN_WINDOW maps/trading markers
      const conv = useVoiceStore.getState().conversation;
      if (conv.length > lenBefore) {
        const lastAxe = [...conv].reverse().find((m) => m.role === 'axe');
        if (lastAxe?.text) {
          try {
            const did = await presentAssistantReplyOnSphere(lastAxe.text, trimmed);
            if (did) {
              toast.message('Sphere', { description: 'Opened from OPEN_WINDOW' });
            }
          } catch (err) {
            console.warn('[sphere] assistant present failed', err);
          }
        }
      }
    },
  });

  console.info('[AXE CORE] Sphere Living Display installed on sendMessage');
}
