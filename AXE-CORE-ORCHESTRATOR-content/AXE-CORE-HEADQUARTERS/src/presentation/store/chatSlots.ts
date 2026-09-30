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
import { PROVIDERS, leesProviderOpslag, type KeySlot } from '@/domain/providers';
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

  /* Kent `providers.ts` deze id? Dan het NETTE slot, niet de rauwe velden.
     Deze ronde staat vóór ronde 3, dus wat hier binnenkomt wint -- en met een
     rauwe `c.model` betekende dat: de modelnaam zoals hij maanden geleden werd
     opgeslagen, langs `migrateModel` heen. Iemand met `gemini-2.5-flash` in
     Settings (Google zet dat model 16 okt 2026 uit) kreeg dus precies die
     dode naam de cascade in, terwijl ronde 3 de gemigreerde had gegeven.
     Een id die providers.ts NIET kent is iets zelf ingetypts: daarvoor is er
     geen migratie en geen default, dus die gaat door zoals hij er staat. */
  for (const [id, c] of Object.entries(leesProviderOpslag())) {
    if (!c?.key || c.key.length < 4) continue;
    if (slots.some(s => s.provider === id)) continue;
    const net = PROVIDERS.some(p => p.id === id) ? getProviderKeySlot(id) : null;
    push(net ?? {
      provider: id as KeySlot['provider'],
      key: c.key,
      model: c.model,
      baseUrl: c.baseUrl,
    });
  }

  for (const p of PROVIDERS) {
    push(getProviderKeySlot(p.id));
  }

  return slots;
}
