/**
 * Alles wat er aan sleutels ligt, één keer verzameld.
 *
 * Dit stond module-privé in `installStableChat.ts`, terwijl `installTierRouter.ts`
 * er een smallere variant naast had staan (`snelSlot`, met een eigen lijstje
 * providers en een eigen uitsluiting van abonnement/Ollama). Twee verzamelaars
 * betekent twee antwoorden op "welke motoren heb ik eigenlijk", en dat is
 * precies waar de app uit de pas liep.
 *
 * Hier staat alleen het VERZAMELEN en de voorkeursvolgorde. Wat een specifieke
 * agent daarvan mag gebruiken beslist `domain/agents/motorScope.ts` — dat is
 * de regel uit roster.ts, en die hoort niet in een lijstjesbouwer.
 *
 * Woont in presentation/store en niet in application/: hij leest `voiceStore`,
 * en application/ mag niet uit de UI-laag lezen (eslint no-restricted-imports).
 */
import { PROVIDERS, type KeySlot } from '@/domain/providers';
import { useVoiceStore, getProviderKeySlot } from '@/presentation/store/voiceStore';

/**
 * Elke provider waar een sleutel voor bekend is, beste eerst.
 *
 * Drie bronnen, in deze volgorde, zonder dubbele providers:
 * 1. De slots die je zelf koos (★ Primary en zijn fallbacks).
 * 2. `axe_llm_connections` — wat je in Settings intypte.
 * 3. De vault/ENV, via `getProviderKeySlot`. Zonder deze derde ronde is een
 *    provider met een sleutel uit de omgeving (bijv. Gemini via
 *    VITE_GEMINI_API_KEY) wél "Connected" in Settings maar onzichtbaar voor de
 *    chat, en viel AXE terug op wat localStorage toevallig had staan.
 */
export function collectAllSlots(): KeySlot[] {
  const st = useVoiceStore.getState();
  const slots: KeySlot[] = [];
  const push = (s: KeySlot | null | undefined) => {
    if (s?.provider && !slots.some(x => x.provider === s.provider)) slots.push(s);
  };
  push(st.primarySlot);
  push(st.fallback1Slot);
  push(st.fallback2Slot);
  push(st.fallback3Slot);

  try {
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<
      string,
      { key?: string; model?: string; baseUrl?: string } | undefined
    >;
    for (const [id, c] of Object.entries(conns)) {
      if (!c?.key || c.key.length < 4) continue;
      if (slots.some(s => s.provider === id)) continue;
      slots.push({
        provider: id as KeySlot['provider'],
        key: c.key,
        model: c.model,
        baseUrl: c.baseUrl,
      });
    }
  } catch { /* een kapotte opgeslagen waarde mag de chat niet stilzetten */ }

  for (const p of PROVIDERS) {
    push(getProviderKeySlot(p.id));
  }

  return slots;
}
