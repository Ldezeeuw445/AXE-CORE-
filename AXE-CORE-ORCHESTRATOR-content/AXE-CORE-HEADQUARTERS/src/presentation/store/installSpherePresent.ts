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
import { homeCommando, type HomeCommando } from '@/domain/overlay/homeCommando';
import { useCoreViewStore } from '@/presentation/store/coreViewStore';
import { antwoord as maakAntwoord, maakVanJouOpdracht, pasToe } from '@/domain/maakVanJou';
import { leesMaakVanJou, schrijfMaakVanJou } from '@/presentation/store/maakVanJouStore';

const WEERGAVE_NAAM = { axe: 'de bol', neural: 'Neural', terrain: 'Terrain', runtime: 'Runtime' } as const;

/**
 * 15 nov: knoppen die al bestaan, nu ook met je stem -- meteen, zonder AI-ronde.
 * Geeft het antwoord terug, of null als het niet lukte (dan gaat de zin
 * gewoon naar AXE zelf).
 */
async function voerHomeCommandoUit(c: HomeCommando): Promise<string | null> {
  if (c.soort === 'weergave') {
    useCoreViewStore.getState().setCoreView(c.weergave);
    return `Staat op ${WEERGAVE_NAAM[c.weergave]}.`;
  }
  try {
    const { isTauriRuntime } = await import('@/infrastructure/config/apiUrl');
    if (!isTauriRuntime()) return null;
    const { openZwevend, sluitZwevend } = await import('@/infrastructure/gateways/zwevendeVensters');
    await (c.open ? openZwevend('axe') : sluitZwevend('axe'));
    return c.open ? 'Notch staat open.' : 'Notch is dicht.';
  } catch {
    return null;
  }
}

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
    /* Een voorbeeld (```html/```svg) staat al live op Home; in de chat zou het een
       muur code zijn. Wie de code wil, vraagt erom. */
    const clean = stripToolMarkers(conv[i].text)
      .replace(/```(html|svg)\s*\n[\s\S]{20,}?```/gi, '_(Preview on Home)_')
      .trim();
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

      const commando = trimmed ? homeCommando(trimmed) : null;
      if (commando) {
        const antwoord = await voerHomeCommandoUit(commando);
        if (antwoord) {
          const nu = Date.now();
          useVoiceStore.setState(s => ({
            conversation: [...s.conversation,
              { role: 'user', text: trimmed, timestamp: nu },
              { role: 'axe', text: antwoord, timestamp: nu + 1 }],
          }));
          return;
        }
      }

      // "Maak het van jou" (25 nov): "verberg Trading", "maak het groen". Hier in de
      // buitenste laag, anders projecteert de bol eerst een Trading-grafiek en gaat
      // de zin daarna naar het model.
      const eigen = trimmed ? maakVanJouOpdracht(trimmed) : null;
      if (eigen) {
        const na = pasToe(leesMaakVanJou(), eigen);
        schrijfMaakVanJou(na);
        const nu = Date.now();
        useVoiceStore.setState(s => ({
          conversation: [...s.conversation,
            { role: 'user', text: trimmed, timestamp: nu },
            { role: 'axe', text: maakAntwoord(eigen, na), timestamp: nu + 1 }],
        }));
        return;
      }

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
