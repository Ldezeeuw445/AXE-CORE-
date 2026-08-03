/**
 * installSpherePresent — wraps voiceStore.sendMessage so map/chart always
 * project on the sphere. User intent wins; assistant only if sphere still idle.
 */
import { useVoiceStore } from '@/presentation/store/voiceStore';
import {
  presentUserIntentOnSphere,
  presentAssistantReplyOnSphere,
} from '@/application/sphere/presentOnSphere';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';

let installed = false;

export function installSpherePresent(): void {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      const trimmed = (text || '').trim();
      let userDid = false;

      if (trimmed) {
        try {
          userDid = await presentUserIntentOnSphere(trimmed);
        } catch (err) {
          console.warn('[sphere] user intent present failed', err);
        }
      }

      await original(text);

      if (!userDid) {
        try {
          const phase = useSphereProjectionStore.getState().phase;
          if (phase === 'idle' || phase === 'closing') {
            const conv = useVoiceStore.getState().conversation;
            const last = [...conv].reverse().find(m => m.role === 'axe');
            if (last?.text) {
              await presentAssistantReplyOnSphere(last.text, trimmed);
            }
          }
        } catch (err) {
          console.warn('[sphere] assistant present failed', err);
        }
      }
    },
  });
}
