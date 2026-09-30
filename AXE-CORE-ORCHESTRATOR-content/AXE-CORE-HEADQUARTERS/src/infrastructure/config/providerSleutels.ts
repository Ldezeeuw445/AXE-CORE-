/**
 * Waar de sleutel van een provider vandaan komt. Eén plek, voor de hele app.
 *
 * Dit stond in `presentation/store/voiceStore.ts`, en daarmee buiten bereik van
 * de gateways: infrastructure/ mag niet uit de UI-laag lezen. Gevolg: negen
 * gateways en een handvol schermen deden zelf
 * `JSON.parse(localStorage.getItem('axe_llm_connections'))` en misten daarmee
 * alles wat deze functie extra doet:
 *
 * 1. **ENV/vault-sleutels.** `ENV_KEYS` hieronder. Er waren drie kopieën van
 *    die lijst (hier, `visionGateway.ts`, `VisionCaptureButton.tsx`) en twee
 *    daarvan misten `xai` en `groq`. Zet je Grok of Groq via de omgeving, dan
 *    zag de chat hem en vision niet — terwijl Settings "Connected" zei.
 * 2. **Providers die de VPS-proxy met zijn eigen sleutel bedient.** Die horen
 *    een sleutelloos slot te krijgen, geen `null`.
 * 3. **Base-URL normaliseren**, zodat een half ingetypt adres niet doorlekt.
 * 4. **Verouderde modelnamen migreren.** Een modelnaam die maanden geleden in
 *    localStorage belandde is vaak hernoemd; `migrateModel` mapt hem naar de
 *    huidige. Dat gebeurt op deze ene plek, dus een fix in die map werkt
 *    meteen overal zonder dat Luka iets opnieuw hoeft in te typen.
 *
 * `voiceStore` her-exporteert `getProviderKeySlot` en `getOllamaKeySlots`, want
 * daar staan de bestaande aanroepers op.
 */
import {
  PROVIDERS, isKeyOptional, migrateModel,
  type KeySlot, type ProviderId,
} from '@/domain/providers';
import { normalizeProviderBaseUrl } from '@/infrastructure/config/providerConnectionDefaults';
import { getDefaultOllamaModelNames, sortOllamaModelsForCapability } from '@/domain/catalogs/ollamaModelCatalog';
import { getStoredLlmModelRegistry } from '@/infrastructure/persistence/llmModelRegistryService';

/** Waar Settings de ingetypte sleutels neerzet. */
export const VERBINDINGEN_SLEUTEL = 'axe_llm_connections';

export interface ProviderVerbinding {
  key?: string;
  model?: string;
  models?: string[];
  baseUrl?: string;
  /** Wat de laatste "Test"-knop opleverde. axeBootstrap schrijft dit terug. */
  lastTest?: string;
  lastTestAt?: string;
}

/**
 * Sleutels uit de omgeving (`.env` / de vault), voor providers waar je er geen
 * hoeft in te typen. Dit is de volledige lijst; de twee kopieën die elders
 * stonden misten xai en groq.
 */
const ENV_KEYS: Partial<Record<string, string>> = {
  google: import.meta.env.VITE_GEMINI_API_KEY ?? '',
  xai: import.meta.env.VITE_XAI_API_KEY ?? '',
  openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  openai: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  anthropic: import.meta.env.VITE_ANTHROPIC_API_KEY ?? '',
  groq: import.meta.env.VITE_GROQ_API_KEY ?? '',
};

/** Welke ENV-sleutel een provider heeft, of '' als er geen is. Voor tests. */
export function envSleutel(providerId: string): string {
  return ENV_KEYS[providerId] ?? '';
}

/** Alles wat er in `axe_llm_connections` staat. Kapotte opslag telt als leeg. */
export function leesProviderVerbindingen(): Record<string, ProviderVerbinding | undefined> {
  try {
    return JSON.parse(localStorage.getItem(VERBINDINGEN_SLEUTEL) ?? '{}') as Record<string, ProviderVerbinding | undefined>;
  } catch {
    return {};
  }
}

/**
 * Providers die de VPS-AI-proxy met zijn EIGEN sleutel bedient (gecached uit
 * Settings' `/api/proxy/ai/providers`). AXE mag die routeren zonder lokale
 * sleutel — de VPS vult hem in. Leeg tot Settings een keer open is geweest.
 */
function doorServerBediend(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('axe_server_providers') ?? '[]') as string[]); }
  catch { return new Set(); }
}

/**
 * Het slot van één provider, of null als hij echt niet te gebruiken is.
 *
 * Dit is de functie die elke lezer hoort te gebruiken in plaats van zelf te
 * parsen — zie de kop van dit bestand voor wat je anders mist.
 */
export function getProviderKeySlot(providerId: string): KeySlot | null {
  try {
    const conn = leesProviderVerbindingen()[providerId];
    const cfg = PROVIDERS.find(p => p.id === providerId);
    const key = conn?.key || (providerId !== 'ollama' ? envSleutel(providerId) : '');
    const baseUrl = normalizeProviderBaseUrl(providerId as ProviderId, conn?.baseUrl || cfg?.baseUrl);
    if (isKeyOptional(providerId) && providerId !== 'ollama' && !baseUrl) return null;
    if (!isKeyOptional(providerId) && !key && !doorServerBediend().has(providerId)) return null;
    const model = migrateModel(providerId, conn?.model) || cfg?.defaultModel;
    return { provider: providerId as ProviderId, key, model, baseUrl };
  } catch { return null; }
}

/**
 * Ollama's slots: hoogstens twee.
 *
 * Deze VPS houdt één model tegelijk geladen (OLLAMA_MAX_LOADED_MODELS=1), dus
 * alle acht aflopen op één trage beurt betekent acht keer laden en wegwerpen
 * voor één antwoord — precies de "rommelige" cascade die gemeld werd. Twee
 * pogingen is een echte herkansing; een echte Ollama-storing hoort snel door
 * te vallen naar een andere provider.
 */
export function getOllamaKeySlots(): KeySlot[] {
  try {
    const ollama = leesProviderVerbindingen()['ollama'];
    const cfg = PROVIDERS.find(p => p.id === 'ollama')!;
    const baseUrl = normalizeProviderBaseUrl('ollama', ollama?.baseUrl || cfg.baseUrl);
    const models: string[] = ollama?.models?.length
      ? ollama.models
      : (ollama?.model
        ? [ollama.model]
        : getStoredLlmModelRegistry().map(m => m.name).filter(Boolean) || getDefaultOllamaModelNames());
    const sorted = sortOllamaModelsForCapability([
      ...models.filter(m => !m.endsWith(':cloud')),
      ...models.filter(m => m.endsWith(':cloud')),
    ]);
    return sorted.filter(Boolean).slice(0, 2).map(model => ({
      provider: 'ollama' as ProviderId, key: '', model, baseUrl,
    }));
  } catch { return []; }
}

/**
 * De ingetypte sleutel van één dienst, getrimd, of '' als er geen is.
 *
 * Voor de diensten die dezelfde OPSLAG delen maar niet hetzelfde BEGRIP:
 * ElevenLabs, Fish Audio, Cartesia, Exa, SmartThings staan niet in
 * `ProviderId` — ze hebben geen model, geen cascade en geen base-URL, dus een
 * `KeySlot` past er niet op. Wat ze wel deelden was vijf keer dezelfde
 * `JSON.parse` met eigen `try/catch`. Dat is deze regel.
 *
 * Meerdere namen mogen: Fish Audio staat bij sommigen als `fishaudio` en bij
 * anderen als `fish`, afhankelijk van wanneer het is ingevuld.
 */
export function dienstSleutel(...namen: string[]): string {
  const conns = leesProviderVerbindingen();
  for (const naam of namen) {
    const k = conns[naam]?.key?.trim();
    if (k) return k;
  }
  return '';
}
