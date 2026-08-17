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
import { stripToolMarkers } from '@/domain/tools/toolCatalog';

/**
 * installStableChat's send path never runs the tool-call/marker resolution
 * loop (that lives in voiceStore's original sendMessage, which this file
 * wraps and this codepath bypasses) — so a reply carrying `[PROJECT: {...}]`
 * projects correctly on the sphere here but the raw marker JSON was left
 * sitting in the chat bubble forever, indistinguishable from AXE just
 * outputting broken code. Strip it from the stored message once the sphere
 * has actually consumed it, so the bubble shows the same clean reply the
 * model intended.
 */
function stripDisplayedMarkers(): void {
  const store = useVoiceStore.getState();
  const conv = store.conversation;
  for (let i = conv.length - 1; i >= 0; i--) {
    if (conv[i].role !== 'axe') continue;
    const clean = stripToolMarkers(conv[i].text).trim();
    if (clean !== conv[i].text) {
      const next = [...conv];
      next[i] = { ...next[i], text: clean };
      useVoiceStore.setState({ conversation: next });
    }
    break;
  }
}

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

      // After any projection has had its chance to read the raw marker —
      // strip it from what's actually displayed. Unconditional: even the
      // userDid branch (projected from the user's own message) can leave a
      // redundant marker in the LLM's echoed reply.
      stripDisplayedMarkers();
    },
  });
}
