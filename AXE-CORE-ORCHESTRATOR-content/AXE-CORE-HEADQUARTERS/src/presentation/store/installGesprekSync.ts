/**
 * installGesprekSync — één doorlopend gesprek op elk apparaat.
 *
 * Elke paar seconden (alleen als het venster zichtbaar is): wat hebben andere
 * apparaten sinds de vorige keer opgeslagen? Nieuwe berichten in dit gesprek
 * komen erbij; ging Luka elders verder in een ander gesprek, dan stapt dit
 * apparaat over zodra AXE hier niet midden in een beurt zit.
 */
import { useVoiceStore, markLoadedAsPersisted, type ConversationMessage } from '@/presentation/store/voiceStore';
import { apparaatId, berichtenSinds } from '@/infrastructure/persistence/chatPersistence';
import { verwerkExterneRijen } from '@/domain/chat/gesprekSync';

const ELKE_MS = 4_000;
let installed = false;
let sinds: string | null = null;
let bezig = false;

async function tik(): Promise<void> {
  if (bezig || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  bezig = true;
  try {
    const st = useVoiceStore.getState();
    if (!sinds) {
      const laatste = st.conversation[st.conversation.length - 1]?.timestamp ?? Date.now() - 60_000;
      sinds = new Date(laatste - 1_000).toISOString();
    }
    const rijen = await berichtenSinds(sinds);
    if (!rijen.length) return;
    const vorige = sinds;
    sinds = rijen[rijen.length - 1].createdAt;

    const uit = verwerkExterneRijen(st.sessionId, st.conversation, rijen, apparaatId());
    if (uit.actie === 'wissel') {
      if (st.voiceStatus !== 'idle') { sinds = vorige; return; }
      await st.switchConversation(uit.naar);
      return;
    }
    if (uit.actie === 'toevoegen') {
      // Eerst als opgeslagen markeren, anders slaat de subscriber ze nog eens op.
      markLoadedAsPersisted(uit.berichten);
      useVoiceStore.setState((s) => ({
        conversation: [...s.conversation, ...uit.berichten as ConversationMessage[]]
          .sort((a, b) => a.timestamp - b.timestamp),
      }));
    }
  } catch (e) {
    console.debug('[AXE] gesprek-sync:', e instanceof Error ? e.message : e);
  } finally {
    bezig = false;
  }
}

export function installGesprekSync(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.setInterval(() => { void tik(); }, ELKE_MS);
  document.addEventListener('visibilitychange', () => { void tik(); });
}
