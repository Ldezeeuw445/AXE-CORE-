import { loadLocalFirstEnabled, setLocalFirstEnabled } from '@/domain/providers';
import { BuildStampLine } from '@/presentation/components/axe-core/BuildStampLine';
import { meaningVar, meaningVarDim, meaningOfTest } from '@/domain/meaning';
import { loadRepoConfigs as loadRepoConfigsImpl, saveRepoConfigs, DEFAULT_REPOS, type RepoConfig as RepoConfigT } from '@/infrastructure/persistence/repoConfigService';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { useVoiceStore, PROVIDERS, migrateModel, type ProviderId, type KeySlot } from '@/presentation/store/voiceStore';
import { CapabilityRouterSection } from '@/presentation/components/settings/CapabilityRouterSection';
import { ToolCallingSection } from '@/presentation/components/settings/ToolCallingSection';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import { apiUrl } from '@/infrastructure/config/apiUrl';
import { mergeConnections } from '@/domain/providerConnections';
import { loadSetting, saveSetting, SETTING_UNSYNCED_EVENT } from '@/infrastructure/persistence/userSettingsService';
import { getDefaultOllamaModelNames } from '@/domain/catalogs/ollamaModelCatalog';
import { getStoredLlmModelRegistry, registryEntriesFromNames, saveLlmModelRegistry } from '@/infrastructure/persistence/llmModelRegistryService';
import { checkAllServices, getSystemState, vpsAgentStatus, checkGeminiReal, type ServiceState } from '@/application/system/systemService';
import { normalizeProviderBaseUrl } from '@/infrastructure/config/providerConnectionDefaults';
import { loadCustomProviders, saveCustomProviders, CUSTOM_PROVIDERS_KEY, type CustomProvider } from '@/domain/customProviders';
import {
  Key, Check, X, Eye, EyeOff, Mic, Save, AlertTriangle,
  RefreshCw, Zap, Star,
  ExternalLink, Github, GitBranch, Trash2,
  Activity, Server, Plus, Volume2, Play,
} from 'lucide-react';
import {
  ELEVENLABS_VOICES, getSelectedVoiceId, setSelectedVoiceId,
  isElevenLabsConfigured, speakWithElevenLabs, stopTTS,
  fetchAvailableVoices, type ElevenLabsVoice,
} from '@/infrastructure/gateways/elevenLabsService';
import { testExaKey } from '@/infrastructure/gateways/exaSearchService';
import { loadTrustLevels, setAutoApprove, type TrustLevel } from '@/infrastructure/persistence/trustLevelsService';
import type { ApprovalKind } from '@/domain/tools/toolCatalog';
import { getFishVoiceId, setFishVoiceId, speakWithFishAudio, stopFishAudio } from '@/infrastructure/gateways/fishAudioService';
import { MindsetQuotesSection } from '@/presentation/components/settings/MindsetQuotesSection';

/* ─── Per-provider key store ─────────────────────────────────────────
 * Only the providers Luka actually uses are shown here. The VPS agent
 * bridges (OpenHands/OpenJarvis/OpenClaw/KiloCode/CrewAI/Hermes) are NOT
 * key-based cloud providers — they're wired elsewhere (agent bridges via
 * axe_api, CrewAI via /crew/run, Hermes as an Ollama model), so they don't
 * belong on this Keys screen. Grok (xAI) and OpenRouter are removed too
 * (unused). Need one back? Re-add its row here. */
const OPENROUTER_CHIPS = [
  'openrouter/auto',
  'openai/gpt-5.6-luna-pro',
  'anthropic/claude-sonnet-5',
  'google/gemini-3.5-flash-lite',
  'deepseek/deepseek-v4-flash-0731',
];

/**
 * Models worth one click, per provider.
 *
 * Only providers whose roster is stable enough to hardcode, and only slugs
 * verified to exist. OpenRouter's own routers (`openrouter/free`,
 * `openrouter/auto`) are the two that cannot go stale — every specific slug
 * there rotates.
 *
 * `stealth/ox-alpha` was briefly listed here as an OpenRouter option, on the
 * strength of documentation that says the model is reachable that way. It is
 * not: measured 2026-08-27 against openrouter.ai/api/v1/models, none of the 417
 * models contains "ox-alpha" or "stealth", while openrouter/free and
 * openrouter/auto are both present. Stealth models are temporary by nature and
 * this one has been withdrawn. A chip pointing at a model that does not exist
 * turns a working key into a failing card, which is exactly what it did.
 *
 * Tokenra still serves it under its own card, where the slug is correct.
 */
const MODEL_CHIPS: Record<string, string[]> = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound', 'qwen/qwen3.6-27b'],
  google: ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'],
  // Every slug here was checked against openrouter.ai/api/v1/models on
  // 2026-08-27 — the last set was not, and one of them did not exist, which
  // turned a working key into a failing card. Context and price at that date:
  //   openrouter/auto            router, picks per request
  //   gpt-5.6-luna-pro           1.05M ctx, $0.20/M in — the value pick
  //   claude-sonnet-5            1.00M ctx, $2.00/M in — code and reasoning
  //   gemini-3.5-flash-lite      1.05M ctx, $0.30/M in — reads image and video
  //   deepseek-v4-flash          1.31M ctx, $0.06/M in — cheapest long context
  openrouter: OPENROUTER_CHIPS,
  // The second seat gets the same list on purpose: the whole reason for two
  // cards is picking a different model on each, and a shorter menu on one of
  // them would just be a reason to go back to typing slugs.
  openrouter2: OPENROUTER_CHIPS,
};

const PROVIDER_KEY_CATALOGUE = [
  { id: 'google',      name: 'Gemini',         emoji: '✨', accent: '#3B82F6', placeholder: 'AIza... / AQ.Ab...',  defaultModel: 'gemini-3.5-flash',           docsUrl: 'https://aistudio.google.com/app/apikey',  free: true,  needsKey: true  },
  { id: 'anthropic',   name: 'Anthropic',      emoji: '🤖', accent: '#A78BFA', placeholder: 'sk-ant-api03-...',    defaultModel: 'claude-sonnet-5',            docsUrl: 'https://console.anthropic.com/keys',      free: false, needsKey: true  },
  { id: 'openai',      name: 'OpenAI',         emoji: '⚡', accent: '#10B981', placeholder: 'sk-proj-...',         defaultModel: 'gpt-4o-mini',                docsUrl: 'https://platform.openai.com/api-keys',    free: false, needsKey: true  },
  { id: 'groq',        name: 'Groq',           emoji: '🚀', accent: '#EC4899', placeholder: 'gsk_...',             defaultModel: 'openai/gpt-oss-120b',        docsUrl: 'https://console.groq.com/keys',           free: true,  needsKey: true  },
  { id: 'openrouter',  name: 'OpenRouter',     emoji: '🔓', accent: '#F59E0B', placeholder: 'sk-or-v1-...',        defaultModel: 'openrouter/free',            docsUrl: 'https://openrouter.ai/keys',              free: true,  needsKey: true  },
  { id: 'openrouter2', name: 'OpenRouter 2',   emoji: '🔓', accent: '#F59E0B', placeholder: 'sk-or-v1-...',        defaultModel: 'openrouter/auto',            docsUrl: 'https://openrouter.ai/keys',              free: true,  needsKey: true  },
  { id: 'cerebras',    name: 'Cerebras',       emoji: '⚡', accent: '#F97316', placeholder: 'csk-...',             defaultModel: 'gpt-oss-120b',               docsUrl: 'https://cloud.cerebras.ai',               free: true,  needsKey: true  },
  { id: 'ollama',      name: 'Ollama (VPS)',   emoji: '🦙', accent: '#10B981', placeholder: '(geen key nodig)',    defaultModel: 'gemma4:latest',              docsUrl: 'https://ollama.ai',                       free: true,  needsKey: false },
  { id: 'openhands',   name: 'OpenHands (VPS)',emoji: '🙌', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'claude-sonnet-4-5',          docsUrl: 'https://docs.openhands.dev',              free: true,  needsKey: false },
  { id: 'openclaw',    name: 'OpenClaw (VPS)', emoji: '🦞', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                docsUrl: '',                                        free: true,  needsKey: false },
  { id: 'crewai',      name: 'CrewAI (VPS)',   emoji: '👥', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                docsUrl: '',                                        free: true,  needsKey: false },
  { id: 'exa',         name: 'Exa Search',     emoji: '🔍', accent: '#6366F1', placeholder: 'exa-...',             defaultModel: '',                           docsUrl: 'https://docs.exa.ai',                     free: false, needsKey: true },
  { id: 'smartthings', name: 'SmartThings',    emoji: '🏠', accent: '#00D2FF', placeholder: 'xxxxxxxx-xxxx-...',   defaultModel: '',                           docsUrl: 'https://account.smartthings.com/tokens', free: true,  needsKey: true },
  { id: 'elevenlabs',  name: 'ElevenLabs',     emoji: '🎙️', accent: '#8B5CF6', placeholder: 'sk_...',              defaultModel: '',                           docsUrl: 'https://elevenlabs.io/app/settings/api-keys', free: false, needsKey: true },
  { id: 'tavily',      name: 'Tavily Search',  emoji: '🌐', accent: '#22D3EE', placeholder: 'tvly-...',            defaultModel: '',                           docsUrl: 'https://app.tavily.com/home',             free: true,  needsKey: true },
  { id: 'axon',        name: 'AXON Memory',    emoji: '🧠', accent: '#14B8A6', placeholder: 'axon_live_...',       defaultModel: '',                           docsUrl: 'https://app.axon-memory.com',             free: true,  needsKey: true },
] as const;

const OPTIONAL_KEY_PROVIDERS = new Set(['ollama', 'openhands', 'openclaw', 'crewai']);

/**
 * Providers on this screen that are not chat models.
 *
 * They sit here because this is where keys live, not because they answer
 * prompts — a search index, a home hub, a voice engine, a memory store. Two
 * things follow: the sweep that tests everything on arrival must skip them
 * (a chat-completion probe against a search API fails on a perfectly good
 * key), and none of them can be the primary chat provider.
 *
 * This used to be the same four ids written out in four places. They drifted
 * once already; a fifth entry would have had to be added four times, and
 * missing one of them is invisible until a good key reads as broken.
 */
const NON_LLM_PROVIDERS = new Set(['exa', 'smartthings', 'elevenlabs', 'tavily', 'axon']);

/** The subset that needs nothing but a key — no base URL, no model to pick. */
const KEY_ONLY_PROVIDERS = new Set(['exa', 'elevenlabs', 'tavily', 'axon']);

type ProviderConn = {
  key?: string;
  model?: string;
  models?: string[];
  baseUrl?: string;
  lastTest?: 'ok' | 'fail' | 'testing';
  lastTestAt?: string;
  lastError?: string;
};

type OllamaModelHealth = {
  status?: 'ok' | 'fail' | 'testing';
  lastTestAt?: string;
  lastError?: string;
  baseUrl?: string;
};

const OPENHANDS_BASE_URL = import.meta.env.VITE_OPENHANDS_URL ?? '/proxy/openhands';
const OPENJARVIS_BASE_URL = import.meta.env.VITE_OPENJARVIS_URL ?? '/proxy/openjarvis';
const OPENCLAW_BASE_URL = import.meta.env.VITE_OPENCLAW_URL ?? '/proxy/openclaw';
const KILOCODE_BASE_URL = import.meta.env.VITE_KILOCODE_URL ?? '/proxy/kilocode';
const CREWAI_BASE_URL = import.meta.env.VITE_CREWAI_URL ?? '/proxy/crewai';
const HERMES_BASE_URL = import.meta.env.VITE_HERMES_URL ?? '/proxy/hermes';
const GROQ_BASE_URL = import.meta.env.VITE_GROQ_URL ?? 'https://api.groq.com/openai/v1';
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');
const OLLAMA_MODEL_HEALTH_KEY = 'axe_ollama_model_health';

function loadProviderKeys(): Record<string, ProviderConn> {
  try {
    const stored = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
    const defaultOllamaModels = getStoredLlmModelRegistry().map(m => m.name);
    // Seed from Vercel env vars if not yet in localStorage
    const envSeeds: Record<string, string> = {
      openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
      google:     import.meta.env.VITE_GEMINI_API_KEY     ?? '',
      xai:        import.meta.env.VITE_XAI_API_KEY        ?? '',
      openai:     import.meta.env.VITE_OPENAI_API_KEY     ?? '',
      anthropic:  import.meta.env.VITE_ANTHROPIC_API_KEY  ?? '',
      groq:       import.meta.env.VITE_GROQ_API_KEY       ?? '',
    };
    let changed = false;
    for (const [id, envKey] of Object.entries(envSeeds)) {
      if (envKey && !stored[id]?.key) {
        stored[id] = { ...stored[id], key: envKey };
        changed = true;
      }
    }
    // Migrate outdated stored models — single source of truth in providers.ts
    // (_MODEL_MIGRATIONS / migrateModel), so a fix there takes effect for both
    // the runtime call path (voiceStore.getProviderKeySlot) and this UI.
    for (const id of Object.keys(stored)) {
      const conn = stored[id];
      const migrated = conn?.model ? migrateModel(id, conn.model) : undefined;
      if (migrated && migrated !== conn?.model) {
        stored[id] = { ...conn, model: migrated };
        changed = true;
      }
    }
    for (const id of Object.keys(stored)) {
      const conn = stored[id];
      if (!conn) continue;
      const normalizedBaseUrl = normalizeProviderBaseUrl(id as ProviderId, conn.baseUrl ?? undefined);
      if (normalizedBaseUrl && normalizedBaseUrl !== conn.baseUrl) {
        stored[id] = { ...conn, baseUrl: normalizedBaseUrl };
        changed = true;
      }
    }
    if (stored.qrok && !stored.xai) {
      stored.xai = stored.qrok;
      delete stored.qrok;
      changed = true;
    }
    if (stored.openhandss && !stored.openhands) {
      stored.openhands = stored.openhandss;
      delete stored.openhandss;
      changed = true;
    }
    // The Ox Alpha seat became a second OpenRouter one. The key already in it
    // was an OpenRouter key (sk-or-v1-…) that Tokenra was refusing, so moving
    // it across is what its owner meant by it in the first place.
    if (stored.oxalpha && !stored.openrouter2) {
      stored.openrouter2 = stored.oxalpha;
      delete stored.oxalpha;
      changed = true;
    }
    if (!stored.ollama?.models?.length) {
      stored.ollama = { ...stored.ollama, models: defaultOllamaModels };
      changed = true;
    }
    if (changed) localStorage.setItem('axe_llm_connections', JSON.stringify(stored));
    return stored;
  } catch { return {}; }
}
/**
 * Wat de cloud had toen deze sessie hydrateerde.
 *
 * Bestaat omdat `axe_llm_connections` als hele rij wordt weggeschreven. Elk
 * apparaat schreef dus zijn eigen beeld over dat van alle andere heen, en een
 * apparaat dat de sleutels niet had maakte ze overal leeg.
 *
 * Zo ging het op 2 sep 2026 mis: de gehoste app startte zonder de VITE_-
 * sleutels die er tot die ochtend in de bundel zaten, en de eerste druk op
 * Test schreef die lege toestand naar Supabase. Zeven providers weg, zonder
 * melding, want vanuit de code klopte elke stap.
 */
let cloudSnapshot: Record<string, ProviderConn> = {};

/**
 * Slaat de verbindingen op zonder een gevulde sleutel met niets te overschrijven.
 *
 * Het verschil tussen `undefined` en `''` doet er hier toe: undefined betekent
 * "dit apparaat weet er niets van" en dan wint de cloud; een lege string is een
 * veld dat jij hebt leeggemaakt, en dat hoort wel door te komen.
 */
function saveConnections(next: Record<string, ProviderConn>) {
  const merged = mergeConnections(cloudSnapshot, next);
  localStorage.setItem('axe_llm_connections', JSON.stringify(merged));
  void saveSetting('axe_llm_connections', merged);
  return merged;
}

function saveProviderKeys(d: Record<string, ProviderConn>) {
  saveConnections(d);
  void saveLlmModelRegistry(registryEntriesFromNames(d.ollama?.models ?? getDefaultOllamaModelNames()));
}

function loadOllamaModelHealth(): Record<string, OllamaModelHealth> {
  try {
    return JSON.parse(localStorage.getItem(OLLAMA_MODEL_HEALTH_KEY) ?? '{}') as Record<string, OllamaModelHealth>;
  } catch {
    return {};
  }
}

function saveOllamaModelHealth(next: Record<string, OllamaModelHealth>) {
  localStorage.setItem(OLLAMA_MODEL_HEALTH_KEY, JSON.stringify(next));
  void saveSetting(OLLAMA_MODEL_HEALTH_KEY, next);
}

/* ─── Custom provider management ──────────────────────────────────── */
// Storage lives in @/domain/customProviders — shared with llmGateway.ts's
// dispatch code so a custom provider can actually be called, not just added.

/**
 * Warns when a setting was written to this device only.
 *
 * `saveSetting` keeps the local write no matter what, so the field on screen
 * shows the new value either way. That is the trap: a Google API key pasted
 * while the Supabase session had lapsed looked saved, while every background
 * agent went on using the old one from `user_settings`. The row was two days
 * stale and nothing anywhere said so.
 *
 * Stays until dismissed or until a later save succeeds — this is not a toast,
 * it is a wrong state that persists until someone fixes it.
 */
function UnsyncedSettingsBanner() {
  const [issue, setIssue] = useState<{ key: string; reason: string } | null>(null);

  useEffect(() => {
    const onUnsynced = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; reason: string }>).detail;
      if (detail) setIssue(detail);
    };
    window.addEventListener(SETTING_UNSYNCED_EVENT, onUnsynced);
    return () => window.removeEventListener(SETTING_UNSYNCED_EVENT, onUnsynced);
  }, []);

  if (!issue) return null;

  return (
    <div
      className="mb-4 rounded-lg border px-4 py-3 flex items-start gap-3"
      style={{ borderColor: 'var(--danger, #f43f5e)', background: 'rgba(244,63,94,0.08)' }}
    >
      <AlertTriangle size={16} style={{ color: 'var(--danger, #f43f5e)', flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Saved on this device only
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          <code>{issue.key}</code> — {issue.reason}
        </div>
      </div>
      <button
        onClick={() => setIssue(null)}
        className="text-xs px-2 py-1 rounded"
        style={{ color: 'var(--text-muted)' }}
      >
        Dismiss
      </button>
    </div>
  );
}

function ProviderKeysSection() {
  const voice = useVoiceStore();
  const [keys, setKeys] = useState<Record<string, ProviderConn>>(loadProviderKeys);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, 'idle'|'ok'|'fail'|'testing'>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>(loadCustomProviders);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState<CustomProvider>({ id: '', name: '', accent: '#22D3EE', baseUrl: '', defaultModel: '', needsKey: true, format: 'openai' });
  const [addProviderError, setAddProviderError] = useState<string | null>(null);

  // Welke providers de VPS zelf kan bedienen.
  //
  // Zonder dit keek deze pagina alleen naar de sleutel in de browser. Sinds
  // die er (terecht) uit is, stond bij OpenAI en Groq "Not Configured"
  // terwijl ze aantoonbaar antwoorden -- de sleutel staat nu op de server,
  // waar de browser er niet bij kan en ook niet bij hoort te kunnen.
  //
  // Een leeg antwoord is hier geen ramp: dan valt het scherm terug op wat het
  // altijd al deed. Maar het mag niet stil falen, dus het zegt niets liever
  // dan iets verkeerds.
  const [serverProviders, setServerProviders] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/proxy/ai/providers'));
        if (!res.ok) return;
        const body = (await res.json()) as { providers?: string[]; keyless?: string[] };
        if (cancelled) return;
        setServerProviders(new Set([...(body.providers ?? []), ...(body.keyless ?? [])]));
      } catch {
        /* server onbereikbaar -- laat het scherm bij het oude gedrag */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Known-format defaults — there's exactly one real endpoint for these two
  // formats, so don't make the user look it up to add a second key for a
  // provider that already exists (e.g. a second free-tier Gemini key).
  const KNOWN_FORMAT_BASE_URLS: Record<string, string> = {
    google: 'https://generativelanguage.googleapis.com',
    anthropic: 'https://api.anthropic.com',
  };

  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const stored = await loadSetting<Record<string, ProviderConn>>('axe_llm_connections', {});
      const storedCustom = await loadSetting<CustomProvider[]>(CUSTOM_PROVIDERS_KEY, []);
      if (!alive) return;
      cloudSnapshot = stored;
      if (Object.keys(stored).length > 0) setKeys(prev => ({ ...prev, ...stored }));
      if (storedCustom.length > 0) setCustomProviders(storedCustom);
    };
    void hydrate();
    return () => { alive = false; };
  }, []);

  const update = (id: string, field: keyof ProviderConn, val: string) => {
    setKeys(prev => {
      const next = { ...prev, [id]: { ...prev[id], [field]: val } };
      saveProviderKeys(next);
      return next;
    });
  };

  const testProvider = async (id: string, isCustom = false, isAutoTest = false) => {
    const conn = keys[id] ?? {};
    const cat = isCustom ? null : PROVIDER_KEY_CATALOGUE.find(p => p.id === id);
    const custom = isCustom ? customProviders.find(p => p.id === id) : null;
    const needsKey = cat ? cat.needsKey : custom ? custom.needsKey : true;
    if (needsKey && !conn.key) return;
    setTesting(t => ({ ...t, [id]: 'testing' }));
    setKeys(prev => {
      const next = { ...prev, [id]: { ...prev[id], lastTest: 'testing' as const } };
      saveConnections(next);
      return next;
    });

    // Exa is a SEARCH provider, not an LLM — run a real Exa query instead of
    // the chat-completion testSlot() (which always failed for it and made a
    // valid key look broken). It's also never an LLM slot, so we don't promote
    // it to primarySlot below.
    if (id === 'exa') {
      const { ok: exaOk, error: exaErr } = await testExaKey(conn.key ?? '');
      setTesting(t => ({ ...t, [id]: exaOk ? 'ok' : 'fail' }));
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: exaOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: exaOk ? undefined : exaErr } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (exaOk) delete n[id]; else n[id] = exaErr ?? 'Exa test mislukt'; return n; });
      return;
    }

    // SmartThings is a home-automation API, not an LLM — run a real device
    // listing instead of testSlot()'s chat-completion probe.
    if (id === 'smartthings') {
      const { testSmartThingsToken } = await import('@/infrastructure/gateways/smartThingsService');
      const { ok: stOk, error: stErr, count } = await testSmartThingsToken(conn.key ?? '');
      setTesting(t => ({ ...t, [id]: stOk ? 'ok' : 'fail' }));
      const msg = stOk ? `${count ?? 0} apparaten gevonden` : (stErr ?? 'SmartThings test mislukt');
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: stOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: stOk ? undefined : msg } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (stOk) delete n[id]; else n[id] = msg; return n; });
      return;
    }

    // ElevenLabs is a TTS voice provider, not an LLM — a real key check, not
    // a chat-completion probe.
    if (id === 'elevenlabs') {
      const { testElevenLabsKey } = await import('@/infrastructure/gateways/elevenLabsService');
      const { ok: elOk, error: elErr } = await testElevenLabsKey(conn.key ?? '');
      setTesting(t => ({ ...t, [id]: elOk ? 'ok' : 'fail' }));
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: elOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: elOk ? undefined : elErr } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (elOk) delete n[id]; else n[id] = elErr ?? 'ElevenLabs test mislukt'; return n; });
      return;
    }

    // Tavily is a search provider, not an LLM — a real tiny search, not a
    // chat-completion probe.
    if (id === 'tavily') {
      const { testTavilyKey } = await import('@/infrastructure/gateways/tavilyService');
      const { ok: tvOk, error: tvErr } = await testTavilyKey(conn.key ?? '');
      setTesting(t => ({ ...t, [id]: tvOk ? 'ok' : 'fail' }));
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: tvOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: tvOk ? undefined : tvErr } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (tvOk) delete n[id]; else n[id] = tvErr ?? 'Tavily test mislukt'; return n; });
      return;
    }

    // AXON Memory is a memory store, not an LLM — the cheapest call that
    // proves the key is accepted, not a chat-completion probe.
    if (id === 'axon') {
      const { axonTestKey } = await import('@/infrastructure/gateways/axonMemoryService');
      const { ok: axOk, error: axErr } = await axonTestKey(conn.key ?? '');
      setTesting(t => ({ ...t, [id]: axOk ? 'ok' : 'fail' }));
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: axOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: axOk ? undefined : axErr } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (axOk) delete n[id]; else n[id] = axErr ?? 'AXON test mislukt'; return n; });
      return;
    }

    // Gemini: route through the same real, cached check the Home "Models &
    // Tests" widget uses (checkGeminiReal), forced fresh here since a
    // deliberate click should never return a stale cached answer. Without
    // this, voice.testSlot() below and the widget's own check disagreed —
    // same key, different Gemini endpoints, different quota buckets.
    if (id === 'google') {
      const { ok: gOk, latency } = await checkGeminiReal({ force: true, key: conn.key });
      setTesting(t => ({ ...t, [id]: gOk ? 'ok' : 'fail' }));
      const msg = gOk ? undefined : 'Gemini test mislukt (mogelijk quota)';
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: gOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: msg } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (gOk) delete n[id]; else n[id] = `${msg} (${latency}ms)`; return n; });
      // Deliberately does NOT promote Google to ★ Primary on a passing test.
      // Together with the same trick in axeBootstrap, that is how Gemini kept
      // reappearing at the front of every cascade after Luka switched it off.
      // Starring is an explicit click now, and off stays off.
      return;
    }

    // OpenHands/OpenClaw/CrewAI are agent bridges on the VPS, not
    // OpenAI-chat-format endpoints — voice.testSlot() below POSTs a
    // /chat/completions probe they were never built to answer (OpenHands in
    // particular needs a two-step task-start + poll flow), so every "Test"
    // click read as a permanent Fail even while the bridges themselves
    // worked fine (verified live: /internal/openhands/execute round-trips
    // correctly). Reuse the same reachability probe the Home "Models & Tests"
    // panel already gets right instead of the chat-completion probe.
    if (id === 'openhands' || id === 'openclaw' || id === 'crewai') {
      const { ok: bridgeOk, latency } = await vpsAgentStatus(id);
      setTesting(t => ({ ...t, [id]: bridgeOk ? 'ok' : 'fail' }));
      const msg = bridgeOk ? undefined : 'VPS bridge onbereikbaar';
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: bridgeOk ? 'ok' as const : 'fail' as const, lastTestAt: new Date().toISOString(), lastError: msg } };
        saveConnections(next);
        return next;
      });
      setTestErrors(e => { const n = { ...e }; if (bridgeOk) delete n[id]; else n[id] = `${msg} (${latency}ms)`; return n; });
      return;
    }

    const cfg = PROVIDERS.find(p => p.id === id);
    const slot: KeySlot = {
      provider: id as ProviderId,
      key: conn.key ?? '',
      model: conn.model || cat?.defaultModel || custom?.defaultModel || '',
      baseUrl: normalizeProviderBaseUrl(id as ProviderId, conn.baseUrl || custom?.baseUrl || cfg?.baseUrl),
    };
    const ok = await voice.testSlot(slot);
    setTesting(t => ({ ...t, [id]: ok ? 'ok' : 'fail' }));
    if (!ok) {
      const raw = useVoiceStore.getState().error ?? 'Test mislukt';
      const retryMatch = raw.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
      const msg = retryMatch
        ? `Rate limit — probeer opnieuw over ${Math.ceil(Number(retryMatch[1]))}s`
        : raw.replace(/\s*https?:\/\/\S+/g, '').trim().slice(0, 140);
      // testSlot() writes failures into the same shared `error` this
      // provider-test just read from — the one AICore's "ACTIVE ERROR"
      // panel (and anything else watching live chat status) displays as if
      // it were a current, ongoing chat failure. Captured into this
      // provider's own testErrors above; clear the shared field now so a
      // one-off manual test of, say, Anthropic doesn't leave a stale "chat
      // is broken" banner sitting around after the user leaves Settings.
      useVoiceStore.setState({ error: null });
      setTestErrors(e => ({ ...e, [id]: msg }));
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: 'fail' as const, lastTestAt: new Date().toISOString(), lastError: msg } };
        saveConnections(next);
        return next;
      });
    } else {
      setTestErrors(e => { const n = { ...e }; delete n[id]; return n; });
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: 'ok' as const, lastTestAt: new Date().toISOString(), lastError: undefined } };
        saveConnections(next);
        return next;
      });
    }
    // Only an explicit, manual "Test" click may promote a provider to
    // primary. The background self-test on Settings load used to do this
    // too — silently swapping AXE's actual chat provider to whichever one
    // happened to test OK first (catalogue order, not intent), which is how
    // Groq ended up "chosen" over Ollama/Gemma without Luka ever asking.
    // Testing a provider says it works, not that it should lead. Auto-starring
    // here meant "off" quietly undid itself the next time anything was tested.
  };

  // Auto-test every configured provider once per Settings visit, so the
  // grid already shows real OK/Fail the moment you open it — no more
  // clicking "Test" on ten cards just to see what's actually working today.
  // Guarded to run once (autoTestRanRef) and skips anything tested in the
  // last 10 min (another tab/visit, or the periodic self-heal check) so
  // this doesn't re-burn API calls every time you glance at the page.
  const autoTestRanRef = useRef(false);
  useEffect(() => {
    if (autoTestRanRef.current) return;
    if (Object.keys(keys).length === 0 && customProviders.length === 0) return; // wait for hydrate
    autoTestRanRef.current = true;

    const STALE_MS = 10 * 60 * 1000;
    const isFresh = (id: string) => {
      const at = keys[id]?.lastTestAt;
      return !!at && Date.now() - Date.parse(at) < STALE_MS;
    };

    const candidates: Array<{ id: string; isCustom: boolean }> = [
      ...PROVIDER_KEY_CATALOGUE
        .filter(p => !NON_LLM_PROVIDERS.has(p.id)) // their own dedicated test path — not auto-burned on every Settings visit
        .filter(p => (p.needsKey ? !!keys[p.id]?.key : true))
        .map(p => ({ id: p.id, isCustom: false })),
      ...customProviders
        .filter(p => (p.needsKey ? !!keys[p.id]?.key : true))
        .map(p => ({ id: p.id, isCustom: true })),
    ].filter(c => !isFresh(c.id));

    // Stagger slightly so it doesn't fire a dozen simultaneous requests.
    candidates.forEach((c, i) => {
      setTimeout(() => { void testProvider(c.id, c.isCustom, true); }, i * 400);
    });
  }, [keys, customProviders]);

  const addCustomProvider = () => {
    const missing: string[] = [];
    if (!newProvider.id) missing.push('Provider ID');
    if (!newProvider.name) missing.push('Display name');
    if (!newProvider.baseUrl) missing.push('Base URL');
    if (missing.length > 0) {
      setAddProviderError(`Missing: ${missing.join(', ')}`);
      return;
    }
    if (customProviders.some(p => p.id === newProvider.id) || builtinIds.has(newProvider.id)) {
      setAddProviderError(`Provider ID "${newProvider.id}" is already in use — pick a different one.`);
      return;
    }
    setAddProviderError(null);
    const updated = [...customProviders, { ...newProvider }];
    setCustomProviders(updated);
    saveCustomProviders(updated);
    setShowAddForm(false);
    setNewProvider({ id: '', name: '', accent: '#22D3EE', baseUrl: '', defaultModel: '', needsKey: true, format: 'openai' });
  };

  const removeCustomProvider = (id: string) => {
    const updated = customProviders.filter(p => p.id !== id);
    setCustomProviders(updated);
    saveCustomProviders(updated);
  };

  const builtinIds = new Set<string>(PROVIDER_KEY_CATALOGUE.map(p => p.id));
  const allCatalogue = [
    ...PROVIDER_KEY_CATALOGUE,
    ...customProviders.filter(c => !builtinIds.has(c.id)).map(c => ({ ...c, emoji: '🔌', free: false, docsUrl: c.baseUrl })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-body font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Key size={15} style={{ color: 'var(--accent-cyan)' }} /> Provider Keys
          </h2>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            LangGraph orchestrator kiest automatisch de juiste provider per taak — test elk model individueel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { voice.clearRoutingLog(); }}
            title="Wis routing history (ROUTER TRACE)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--error)' }}>
            <Trash2 size={12} /> Wis routing log
          </button>
          <button onClick={() => setShowAddForm(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
            style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: 'var(--accent-cyan)' }}>
            <Plus size={12} /> Add Provider
          </button>
        </div>
      </div>

      {/* Add custom provider form */}
      {showAddForm && (
        <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(34,211,238,0.25)' }}>
          <h3 className="text-xs-custom font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>Add Custom Provider</h3>
          <div className={LIST_GRID}>
            <input value={newProvider.id} onChange={e => setNewProvider(p => ({ ...p, id: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="Provider ID (e.g. my-llm)" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <input value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))} placeholder="Display name" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <input value={newProvider.baseUrl} onChange={e => setNewProvider(p => ({ ...p, baseUrl: e.target.value }))} placeholder="Base URL (e.g. https://api.example.com/v1)" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <input value={newProvider.defaultModel} onChange={e => setNewProvider(p => ({ ...p, defaultModel: e.target.value }))} placeholder="Default model" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <select value={newProvider.format} onChange={e => { const format = e.target.value as 'openai' | 'anthropic' | 'google'; setNewProvider(p => ({ ...p, format, baseUrl: p.baseUrl || KNOWN_FORMAT_BASE_URLS[format] || p.baseUrl })); }} className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={newProvider.needsKey} onChange={e => setNewProvider(p => ({ ...p, needsKey: e.target.checked }))} /> Needs API key
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={addCustomProvider} className="px-3 py-1.5 rounded-lg text-xs-custom font-medium" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={12} className="inline mr-1" /> Add</button>
            <button onClick={() => { setShowAddForm(false); setAddProviderError(null); }} className="px-3 py-1.5 rounded-lg text-xs-custom" style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-muted)' }}>Cancel</button>
            {addProviderError && <span className="text-[11px]" style={{ color: 'var(--error)' }}>{addProviderError}</span>}
          </div>
        </div>
      )}

      {/* Provider cards grid */}
      <div className={LIST_GRID}>
        {allCatalogue.map(cat => {
          const conn = keys[cat.id] ?? {};
          const needsKey = 'needsKey' in cat && cat.needsKey;
          const hasKey = !!conn.key;
          // De server heeft zijn eigen sleutel voor deze provider. Dat telt als
          // geconfigureerd -- de aanroep werkt, alleen niet dankzij iets in
          // deze browser.
          const hasServerKey = serverProviders?.has(cat.id) ?? false;
          const configured = !needsKey || hasKey || hasServerKey;
          // testing[] is session-only and starts empty on every mount, so
          // leaving Settings and coming back used to show every card as a
          // fresh "Test" button — even providers that tested OK a minute
          // ago — because this fell back straight to 'idle' instead of the
          // persisted result. Fall back to keys[].lastTest (loaded from
          // storage) first, so a real "OK" stays visible until it's
          // actually re-tested, not just while this component instance
          // happens to still be mounted.
          const ts = testing[cat.id] ?? conn.lastTest ?? 'idle';
          // Cloudflare Pages: show key-status instead of network test result
          // (CORS blocks direct VPS health checks from static hosting)
          const keyStatus: 'configured' | 'server' | 'missing' | 'not-needed' =
            !needsKey ? 'not-needed' : hasKey ? 'configured' : hasServerKey ? 'server' : 'missing';
          const isCustom = customProviders.some(p => p.id === cat.id);
          return (
            <div key={cat.id} className="rounded-xl p-3 space-y-2"
              style={{ background: 'var(--bg-surface)', border: `1px solid ${configured ? `${('accent' in cat ? cat.accent : '#22D3EE')}30` : 'var(--border-subtle)'}`, transition: 'border-color 0.2s' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{'emoji' in cat ? cat.emoji : '🔌'}</span>
                  <span className="text-xs-custom font-medium truncate" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px]" style={{
                    color: keyStatus === 'missing' ? 'var(--error)' : 'var(--success)'
                  }}>
                    {keyStatus === 'configured' ? '● Configured'
                      : keyStatus === 'server' ? '● Server-side'
                      : keyStatus === 'not-needed' ? '● Ready'
                      : '● Not Configured'}
                  </span>
                  {isCustom && (
                    <button onClick={() => removeCustomProvider(cat.id)} style={{ color: 'var(--text-muted)' }}><Trash2 size={9} /></button>
                  )}
                </div>
              </div>

              {'docsUrl' in cat && cat.docsUrl && (
                <a href={cat.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  docs <ExternalLink size={8} />
                </a>
              )}

              {/* A RED "Fail" WITH NO REASON IS NOT A DIAGNOSIS.
                  testErrors is in-memory, while lastTest: 'fail' is persisted
                  in axe_llm_connections — so the card survived a restart
                  showing "✕ Fail" with the reason gone. Anthropic had been
                  sitting like that for days: the gateway does surface the
                  provider's own message ("credit balance too low", "invalid
                  x-api-key", "model not found" — three completely different
                  fixes), and none of it ever reached the screen. lastError is
                  already being written; it just was not read. */}
              {(testErrors[cat.id] || conn.lastError) && (
                <p className="text-[10px]" style={{ color: 'var(--error)' }}>
                  {testErrors[cat.id] ?? conn.lastError}
                </p>
              )}
              {conn.lastTestAt && (
                <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Last: {new Date(conn.lastTestAt).toLocaleTimeString()}</p>
              )}

              {('needsKey' in cat && cat.needsKey) ? (
                <div className="relative">
                  <input
                    type={showKey[cat.id] ? 'text' : 'password'}
                    value={conn.key ?? ''}
                    onChange={e => update(cat.id, 'key', e.target.value)}
                    placeholder={'placeholder' in cat ? cat.placeholder : 'API key...'}
                    className="w-full px-2.5 py-1.5 pr-7 rounded-lg text-[11px] font-mono outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShowKey(s => ({ ...s, [cat.id]: !s[cat.id] }))} style={{ color: 'var(--text-muted)' }}>
                    {showKey[cat.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                </div>
              ) : null}

              {/* These need only a key, no base URL or model. Hiding those
                  inputs is what "adds it properly" — they only ever confused
                  (and there's nothing to type there). */}
              {KEY_ONLY_PROVIDERS.has(cat.id) ? (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {cat.id === 'exa' && 'Web-search voor AXE. Plak je Exa-key en druk op Test — geen model of base URL nodig.'}
                  {cat.id === 'elevenlabs' && 'Stem-voice voor AXE (alternatief voor Fish Audio). Plak je key en druk op Test.'}
                  {cat.id === 'tavily' && 'Web-search voor AXE. Plak je Tavily-key en druk op Test.'}
                  {cat.id === 'axon' && 'Developer key uit AXON Memory (Settings → Developer key → Connect). Let op wélk AXON-account: de key bepaalt of AXE Core in je persoonlijke of je zakelijke geheugen schrijft.'}
                </p>
              ) : (
                <>
                  {/* Base URL for all providers */}
                  <input
                    type="text"
                    value={conn.baseUrl ?? ('baseUrl' in cat ? cat.baseUrl : '')}
                    onChange={e => update(cat.id, 'baseUrl', e.target.value)}
                    placeholder="Base URL"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />

                  {/* Model input */}
                  <input
                    type="text"
                    value={conn.model ?? ''}
                    onChange={e => update(cat.id, 'model', e.target.value)}
                    placeholder={'defaultModel' in cat ? cat.defaultModel : 'model'}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </>
              )}

              {/* Model quick-select for known providers */}
              {/* Model quick-select, per provider.
                  Driven by one table instead of a block per provider: Groq had
                  chips and Gemini did not, for no reason other than that only
                  Groq's block had been written. The chip tints itself from the
                  card's own accent so a new row needs no styling of its own. */}
              {(MODEL_CHIPS[cat.id] ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {MODEL_CHIPS[cat.id].map(model => {
                    const active = (conn.model || ('defaultModel' in cat ? cat.defaultModel : '')) === model;
                    return (
                      <button
                        key={model}
                        onClick={() => update(cat.id, 'model', model)}
                        title={active ? 'In use' : `Switch to ${model}`}
                        className="px-1.5 py-0.5 rounded-full text-[8px] font-mono"
                        style={{
                          // The one in use is filled rather than outlined, so the
                          // card answers "which model am I on" at a glance —
                          // which is the question these chips exist for.
                          background: active ? `${cat.accent}26` : `${cat.accent}14`,
                          border: `1px solid ${cat.accent}${active ? '66' : '2E'}`,
                          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {model}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => testProvider(cat.id, isCustom)}
                  disabled={ts === 'testing' || (('needsKey' in cat && cat.needsKey) && !conn.key)}
                  className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{
                    // Was three separate ternaries over four hand-mixed rgba
                    // values -- and the red here (239,68,68) was not the same
                    // red as --error (248,113,113), so a failed test and a
                    // failed anything-else were different colours for no
                    // reason anyone could have stated.
                    background: ts ? meaningVarDim(meaningOfTest(ts)) : 'var(--bg-active)',
                    border: `1px solid ${ts && ts !== 'testing' ? meaningVar(meaningOfTest(ts)) : 'var(--border-active)'}`,
                    color: ts && ts !== 'testing' ? meaningVar(meaningOfTest(ts)) : 'var(--text-secondary)',
                    opacity: (ts === 'testing' || (('needsKey' in cat && cat.needsKey) && !conn.key)) ? 0.5 : 1,
                  }}>
                  {ts === 'testing' ? <RefreshCw size={11} className="animate-spin" /> : ts === 'ok' ? <Check size={11} /> : ts === 'fail' ? <X size={11} /> : <Zap size={11} />}
                  <span>{ts === 'testing' ? 'Testing...' : ts === 'ok' ? 'OK' : ts === 'fail' ? 'Fail' : 'Test'}</span>
                </button>
                {/* AXE's actual chat provider — was only ever set as an
                    accidental side effect of whichever provider tested OK
                    first (catalogue order). This is the real, explicit
                    switch: click any working provider to make it primary. */}
                {!NON_LLM_PROVIDERS.has(cat.id) && (() => {
                  const isPrimary = voice.primarySlot?.provider === cat.id;
                  return (
                    <button
                      // Clicking the current primary CLEARS it. It used to be
                      // `disabled` here, so Primary could be moved but never
                      // switched off — meaning one provider was always forced
                      // to the front of every cascade. With a dead key in that
                      // seat (Google, 401 ACCOUNT_STATE_INVALID) every single
                      // request began with a guaranteed failure before falling
                      // through. Off is a legitimate answer: buildStableChatCascade
                      // then orders by capability on its own.
                      onClick={() => voice.setPrimarySlot(isPrimary ? null : {
                        provider: cat.id as ProviderId,
                        key: conn.key ?? '',
                        model: conn.model || ('defaultModel' in cat ? cat.defaultModel : '') || '',
                        baseUrl: normalizeProviderBaseUrl(cat.id as ProviderId, conn.baseUrl || ('baseUrl' in cat ? cat.baseUrl : undefined)),
                      })}
                      title={isPrimary
                        ? 'AXE\'s huidige chat-provider — klik om uit te zetten'
                        : 'Maak dit AXE\'s chat-provider'}
                      className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium"
                      style={{
                        background: isPrimary ? 'rgba(139,92,246,0.15)' : 'var(--bg-active)',
                        border: `1px solid ${isPrimary ? 'rgba(139,92,246,0.5)' : 'var(--border-active)'}`,
                        color: isPrimary ? '#a78bfa' : 'var(--text-muted)',
                        opacity: isPrimary ? 1 : 0.7,
                      }}>
                      <Star size={10} fill={isPrimary ? '#a78bfa' : 'none'} />
                      {isPrimary && <span>Primair</span>}
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VoiceSection() {
  const [selected, setSelected] = useState(getSelectedVoiceId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>(ELEVENLABS_VOICES);
  const [voiceListSource, setVoiceListSource] = useState<'loading' | 'live' | 'fallback'>('loading');
  const [voiceListFallbackReason, setVoiceListFallbackReason] = useState<string | null>(null);
  const configured = isElevenLabsConfigured();

  useEffect(() => {
    if (!configured) { setVoiceListSource('fallback'); setVoiceListFallbackReason('ElevenLabs not configured'); return; }
    fetchAvailableVoices()
      .then(list => {
        if (list.length) { setVoices(list); setVoiceListSource('live'); }
        else { setVoices(ELEVENLABS_VOICES); setVoiceListSource('fallback'); setVoiceListFallbackReason('ElevenLabs returned zero voices for this API key — check its permission scope in the ElevenLabs dashboard (it may be a text-to-speech-only key without voice-library read access).'); }
      })
      .catch(err => { setVoices(ELEVENLABS_VOICES); setVoiceListSource('fallback'); setVoiceListFallbackReason(err instanceof Error ? err.message : String(err)); });
  }, [configured]);

  const select = (id: string) => {
    setSelectedVoiceId(id);
    setSelected(id);
  };

  const preview = (id: string) => {
    stopTTS();
    if (playingId === id) { setPlayingId(null); return; }
    setPlayingId(id);
    setFallbackNotice(null);
    // `selected` (component state, not storage) is the restore target — reading
    // storage here would pick up whatever the *previous* preview left behind
    // if one preview is started before another's callback has fired.
    setSelectedVoiceId(id); // speakWithElevenLabs always reads the current selection
    void speakWithElevenLabs(
      'Hallo Luka, dit is een voorbeeld van deze stem.',
      () => { setPlayingId(null); setSelectedVoiceId(selected); },
      () => { setPlayingId(null); setSelectedVoiceId(selected); },
      (reason) => { setFallbackNotice(`ElevenLabs didn't play this voice — heard the browser's own voice instead. Reason: ${reason}`); },
    );
  };

  return (
    <WidgetCard title="VOICE" headerAction={<Volume2 size={14} style={{ color: 'var(--text-muted)' }} />}>
      {!configured ? (
        <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs-custom" style={{ color: 'var(--warning)' }}>
            ElevenLabs isn't configured (no <code>VITE_ELEVENLABS_API_KEY</code>) — AXE is speaking through the browser's built-in voice instead, which can't be changed here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs-custom mb-2" style={{ color: 'var(--text-muted)' }}>
            Pick a voice and tap play to preview it before switching — this is the ElevenLabs voice AXE speaks with, separate from which AI model answers you.
            {voiceListSource === 'loading' && ' Loading your real voice library…'}
          </p>
          {voiceListSource === 'fallback' && voiceListFallbackReason && (
            <div className="p-2.5 rounded-lg flex items-start gap-2 mb-2" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <AlertTriangle size={12} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs-custom" style={{ color: 'var(--warning)' }}>
                Showing a fallback voice list (IDs may not be valid on this account) — real reason: {voiceListFallbackReason}
              </p>
            </div>
          )}
          {fallbackNotice && (
            <div className="p-2.5 rounded-lg flex items-start gap-2 mb-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle size={12} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs-custom" style={{ color: 'var(--error)' }}>{fallbackNotice}</p>
            </div>
          )}
          {voices.map(v => {
            const isSelected = v.id === selected;
            const isPlaying = v.id === playingId;
            return (
              <div key={v.id} className="flex items-center justify-between gap-2 p-2 rounded-lg"
                style={{ background: isSelected ? 'rgba(34,211,238,0.08)' : 'var(--bg-base)', border: `1px solid ${isSelected ? 'rgba(34,211,238,0.3)' : 'var(--border-subtle)'}` }}>
                <button onClick={() => select(v.id)} className="flex-1 text-left flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: isSelected ? 'var(--accent-cyan)' : 'var(--border-active)' }} />
                  <span className="min-w-0">
                    <span className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{v.name}</span>
                    <span className="text-xs-custom ml-1.5" style={{ color: 'var(--text-muted)' }}>{v.accent} · {v.gender}</span>
                    <p className="text-xs-custom truncate" style={{ color: 'var(--text-muted)' }}>{v.description}</p>
                  </span>
                </button>
                <button onClick={() => preview(v.id)} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs-custom"
                  style={{ background: isPlaying ? 'rgba(34,211,238,0.15)' : 'var(--bg-active)', border: '1px solid var(--border-active)', color: isPlaying ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                  <Play size={11} /> {isPlaying ? 'Playing…' : 'Preview'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

const TTS_PROVIDER_KEY = 'axe_tts_provider';

function loadTtsProvider(): 'fish' | 'elevenlabs' | 'browser' {
  try { return (localStorage.getItem(TTS_PROVIDER_KEY) as 'fish' | 'elevenlabs' | 'browser') || 'fish'; } catch { return 'fish'; }
}

/** Voice provider — Fish Audio is the default (no paid ElevenLabs account),
 *  ElevenLabs stays available if you get one later, and the browser's own
 *  voice (already tuned for a confident "Bobby Axelrod" delivery) always
 *  works with zero setup. */
function FishAudioSection() {
  const [provider, setProvider] = useState(loadTtsProvider);
  const [voiceId, setVoiceIdState] = useState(getFishVoiceId);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseProvider = (next: 'fish' | 'elevenlabs' | 'browser') => {
    setProvider(next);
    try { localStorage.setItem(TTS_PROVIDER_KEY, next); } catch { /* ignore */ }
  };

  const saveVoiceId = (id: string) => {
    setVoiceIdState(id);
    setFishVoiceId(id);
  };

  const preview = () => {
    if (!voiceId.trim()) { setError('Enter a Fish Audio voice id (reference_id) first.'); return; }
    stopFishAudio();
    setError(null);
    setPlaying(true);
    void speakWithFishAudio(
      'Hallo Luka, dit is een voorbeeld van deze stem.',
      () => setPlaying(false),
      (reason) => { setPlaying(false); setError(reason); },
    );
  };

  return (
    <WidgetCard title="🐟 VOICE PROVIDER" headerAction={<Volume2 size={14} style={{ color: 'var(--text-muted)' }} />}>
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Fish Audio is the default — no paid ElevenLabs account needed. Pick a voice on{' '}
        <a href="https://fish.audio" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent-cyan)' }}>fish.audio</a>,
        copy its voice id (reference_id), and paste it below. ElevenLabs stays available above if you get a paid account later; the browser's built-in voice always works with zero setup.
      </p>

      <div className="flex gap-1.5 mb-3">
        <button onClick={() => chooseProvider('fish')} className="flex-1 px-2 py-1.5 rounded-lg text-xs-custom"
          style={{ background: provider === 'fish' ? 'rgba(34,211,238,0.12)' : 'var(--bg-base)', border: `1px solid ${provider === 'fish' ? 'rgba(34,211,238,0.35)' : 'var(--border-subtle)'}`, color: provider === 'fish' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
          Fish Audio (default)
        </button>
        <button onClick={() => chooseProvider('elevenlabs')} className="flex-1 px-2 py-1.5 rounded-lg text-xs-custom"
          style={{ background: provider === 'elevenlabs' ? 'rgba(34,211,238,0.12)' : 'var(--bg-base)', border: `1px solid ${provider === 'elevenlabs' ? 'rgba(34,211,238,0.35)' : 'var(--border-subtle)'}`, color: provider === 'elevenlabs' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
          ElevenLabs
        </button>
        <button onClick={() => chooseProvider('browser')} className="flex-1 px-2 py-1.5 rounded-lg text-xs-custom"
          style={{ background: provider === 'browser' ? 'rgba(34,211,238,0.12)' : 'var(--bg-base)', border: `1px solid ${provider === 'browser' ? 'rgba(34,211,238,0.35)' : 'var(--border-subtle)'}`, color: provider === 'browser' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
          Browser (built-in)
        </button>
      </div>

      <div className="flex gap-1.5">
        <input
          value={voiceId}
          onChange={e => saveVoiceId(e.target.value)}
          placeholder="Fish Audio voice id (reference_id)"
          className="flex-1 text-small px-3 py-2 rounded-lg outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <button onClick={preview} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs-custom"
          style={{ background: playing ? 'rgba(34,211,238,0.15)' : 'var(--bg-active)', border: '1px solid var(--border-active)', color: playing ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
          <Play size={11} /> {playing ? 'Playing…' : 'Preview'}
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg flex items-start gap-2 mt-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle size={12} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs-custom" style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      )}
    </WidgetCard>
  );
}

function OllamaModelsSection() {
  const voice = useVoiceStore();
  const [registry, setRegistry] = useState(getStoredLlmModelRegistry());
  const [health, setHealth] = useState<Record<string, OllamaModelHealth>>(loadOllamaModelHealth());
  const [syncing, setSyncing] = useState(false);
  const [localFirst, setLocalFirst] = useState(loadLocalFirstEnabled());
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  // Whether the list on screen reflects a real, just-now Ollama response —
  // vs. whatever was last cached, possibly from a VPS that's since changed
  // or gone down. Rendering the cached list without this distinction is
  // exactly the "shows live when it isn't" problem: a stale list and a
  // fresh one look identical unless we say so.
  const [syncState, setSyncState] = useState<{ ok: boolean; at: string; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const storedHealth = await loadSetting<Record<string, OllamaModelHealth>>(OLLAMA_MODEL_HEALTH_KEY, {});
      if (!alive) return;
      if (storedHealth && typeof storedHealth === 'object') setHealth(storedHealth);
    };
    void hydrate();
    void syncFromVps();
    return () => { alive = false; };
  }, []);

  const saveHealth = (next: Record<string, OllamaModelHealth>) => {
    setHealth(next);
    saveOllamaModelHealth(next);
  };

  const syncFromVps = async () => {
    setSyncing(true);
    try {
      const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
      const baseUrl = conns.ollama?.baseUrl ?? OLLAMA_BASE_URL;
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      const names = (data?.models ?? [])
        .map((m: { name: string }) => m.name)
        .filter(Boolean)
        // Embedding models (nomic-embed-text, mxbai-embed, all-minilm, bge-*)
        // can't do chat — they'd only ever fail the Test and pollute routing.
        // ":cloud"-suffixed entries are Ollama's remote-hosted proxy models
        // (deepseek-v4-flash:cloud, glm-5.2:cloud, ...) — they need a
        // separate ollama.com account/API key we don't have configured, so
        // they'd fail the Test the same way, for an unrelated reason.
        .filter((n: string) => !/embed|bge-|all-minilm/i.test(n) && !n.endsWith(':cloud'));
      if (!names.length) throw new Error('Ollama returned no chat models');
      const nextRegistry = registryEntriesFromNames(names);
      setRegistry(nextRegistry);
      await saveLlmModelRegistry(nextRegistry);
      // The runtime chat/routing path (voiceStore.getOllamaKeySlots) reads
      // axe_llm_connections.ollama.models, a *different* key than the one
      // above — without writing it here too, this sync only ever updated
      // what this settings grid displays, never what the app actually uses.
      conns.ollama = { ...conns.ollama, models: names };
      localStorage.setItem('axe_llm_connections', JSON.stringify(conns));
      setSyncState({ ok: true, at: new Date().toISOString() });
    } catch (err) {
      // Do NOT silently keep showing the old registry as if it's current —
      // say plainly that this is a stale/cached list, not a live one.
      setSyncState({ ok: false, at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncing(false);
    }
  };

  const testModel = async (modelName: string) => {
    setTesting(prev => ({ ...prev, [modelName]: true }));
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
    const baseUrl = conns.ollama?.baseUrl ?? OLLAMA_BASE_URL;
    saveHealth({
      ...health,
      [modelName]: { ...health[modelName], status: 'testing', lastTestAt: new Date().toISOString(), baseUrl },
    });
    const ok = await voice.testSlot({ provider: 'ollama', key: '', model: modelName, baseUrl });
    const err = ok ? undefined : (useVoiceStore.getState().error ?? 'Test mislukt').slice(0, 180);
    if (!ok) useVoiceStore.setState({ error: null }); // see the Gemini test above — don't leak into the shared live-chat error banner
    saveHealth({
      ...health,
      [modelName]: { status: ok ? 'ok' : 'fail', lastTestAt: new Date().toISOString(), lastError: err, baseUrl },
    });
    setTesting(prev => ({ ...prev, [modelName]: false }));
  };

  const models = [...registry].sort((a, b) => a.priority - b.priority);

  // Auto-test every listed model once per visit (skips anything tested in
  // the last 10 min) — same reasoning as the Provider Keys grid: you
  // shouldn't have to click "Test" on seven cards just to see what's
  // actually up on the VPS right now. Run ONE AT A TIME, awaited — this
  // Ollama backend is CPU-only and single-model-at-a-time in practice;
  // firing all seven near-simultaneously (the old 400ms stagger, which
  // still overlaps once a generation takes longer than that) is the same
  // "too many concurrent VPS jobs" failure mode that took the whole VPS
  // down earlier today with OpenHands, just smaller — here it just makes
  // every card time out and show Fail even though the VPS is fine.
  const modelAutoTestRanRef = useRef(false);
  useEffect(() => {
    if (modelAutoTestRanRef.current) return;
    if (models.length === 0) return; // wait for the registry to hydrate
    modelAutoTestRanRef.current = true;
    const STALE_MS = 10 * 60 * 1000;
    const stale = models.filter(m => {
      const at = health[m.name]?.lastTestAt;
      return !(at && Date.now() - Date.parse(at) < STALE_MS);
    });
    void (async () => {
      for (const m of stale) {
        await testModel(m.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.length]);

  return (
    // No WidgetCard: these are providers like any other and belong in the
    // same visual run as the cloud cards above, each already badged "VPS".
    <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Elk model heeft zijn eigen kaart en opgeslagen teststatus.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Alleen modellen die echt via de VPS beschikbaar zijn, horen hier OK te blijven.</p>
          </div>
          <button onClick={syncFromVps} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
            sync van VPS
          </button>
        </div>

        {/* This setting has existed and worked for a long time and had no
            control anywhere, so nobody knew it was there. With it on, a
            reachable self-hosted model goes ahead of every cloud provider for
            ordinary chat — which is the whole point of paying for a VPS that
            already answers in ~2s. */}
        <label
          className="flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer"
          style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)' }}
        >
          <input
            type="checkbox"
            checked={localFirst}
            onChange={e => { setLocalFirstEnabled(e.target.checked); setLocalFirst(e.target.checked); }}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="text-xs-custom block" style={{ color: 'var(--text-primary)' }}>
              Eigen model eerst
            </span>
            <span className="text-[9px] block mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Gebruik een bereikbaar eigen model vóór de cloud — je Mac Mini als je
              thuis bent, anders de VPS. Kost niets en kan niet ingetrokken worden.
            </span>
          </span>
        </label>
        {syncState && (
          <div className="text-[10px] px-2.5 py-1.5 rounded-lg"
            style={{
              background: syncState.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${syncState.ok ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)'}`,
              color: syncState.ok ? 'var(--success)' : 'var(--error)',
            }}>
            {syncState.ok
              ? `● Live — ${models.length} model(len) bevestigd op de VPS, ${new Date(syncState.at).toLocaleTimeString()}`
              : `● Sync mislukt (${syncState.error}) — onderstaande lijst is gecached, niet bevestigd live op ${new Date(syncState.at).toLocaleTimeString()}`}
          </div>
        )}
        <div className={LIST_GRID}>
          {models.map(model => {
            const state = health[model.name];
            const isOk = state?.status === 'ok';
            const isFail = state?.status === 'fail';
            const isTesting = !!testing[model.name];
            return (
              <div key={model.name} className="rounded-xl p-3 space-y-2"
                style={{ background: 'var(--bg-surface)', border: `1px solid ${isOk ? 'rgba(16,185,129,0.28)' : isFail ? 'rgba(239,68,68,0.28)' : 'var(--border-subtle)'}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs-custom font-semibold" style={{ color: 'var(--text-primary)' }}>{model.displayName}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--success)' }}>VPS</span>
                    </div>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{model.name}</p>
                  </div>
                  <span className="text-[9px]" style={{ color: isOk ? 'var(--success)' : isFail ? 'var(--error)' : 'var(--text-muted)' }}>
                    {isOk ? '● OK' : isFail ? '● Fail' : '● Untested'}
                  </span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{model.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)' }}>{model.category}</span>
                  <button
                    onClick={() => testModel(model.name)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
                    style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)', opacity: isTesting ? 0.65 : 1 }}>
                    {isTesting ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                    {isTesting ? 'Testing...' : 'Test'}
                  </button>
                  {state?.lastTestAt && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{new Date(state.lastTestAt).toLocaleString()}</span>}
                </div>
                {state?.lastError && <p className="text-[10px]" style={{ color: 'var(--error)' }}>{state.lastError}</p>}
              </div>
            );
          })}
        </div>
      </div>
  );
}

function ServiceHealthSection() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const next = await getSystemState();
    setServices(next);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    return () => { /* no-op */ };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await checkAllServices();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const focusOrder = ['supabase', 'github', 'n8n', 'langgraph', 'terminal', 'ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes'];
  const ordered = focusOrder
    .map(name => services.find(service => service.service === name))
    .filter((service): service is ServiceState => !!service)
    .concat(services.filter(service => !focusOrder.includes(service.service)));

  return (
    <WidgetCard title="🌐 LIVE SERVICES">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Groene pulse betekent online, niet alleen geconfigureerd.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Dit volgt de health registry die AXE Core gebruikt.</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading service health…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ordered.map(service => {
              const online = service.status === 'online';
              const degraded = service.status === 'degraded';
              const label = service.service === 'n8n' ? 'n8n' : service.display || service.service;
              const isVps = ['openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes', 'ollama'].includes(service.service);
              return (
                <div key={service.service} className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'var(--bg-surface)', border: `1px solid ${online ? 'rgba(16,185,129,0.28)' : degraded ? 'rgba(245,158,11,0.28)' : 'var(--border-subtle)'}` }}>
                  <span className={`h-2.5 w-2.5 rounded-full ${online ? 'animate-pulse' : ''}`} style={{ background: online ? 'var(--success)' : degraded ? 'var(--warning)' : 'var(--error)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                      {isVps && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>(VPS)</span>}
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {service.status}{service.latency_ms ? ` · ${service.latency_ms}ms` : ''}{service.version ? ` · ${service.version}` : ''}
                    </p>
                  </div>
                  <Server size={12} style={{ color: online ? 'var(--success)' : 'var(--text-muted)' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

function RemoteTerminalSection() {
  const [service, setService] = useState<ServiceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const next = (await getSystemState()).find(item => item.service === 'terminal') ?? null;
    setService(next);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    return () => { /* no-op */ };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await checkAllServices();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const online = service?.status === 'online';
  const degraded = service?.status === 'degraded';

  return (
    <WidgetCard title="🖥️ REMOTE TERMINAL">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Beveiligde shell via `wss://api.axecompanion.com/terminal`.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Status komt uit dezelfde registry als de rest van AXE Core.</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading terminal status…</div>
        ) : (
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--bg-surface)', border: `1px solid ${online ? 'rgba(16,185,129,0.28)' : degraded ? 'rgba(245,158,11,0.28)' : 'var(--border-subtle)'}` }}>
            <span className={`h-2.5 w-2.5 rounded-full ${online ? 'animate-pulse' : ''}`} style={{ background: online ? 'var(--success)' : degraded ? 'var(--warning)' : 'var(--error)' }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>AXE Terminal</span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>(VPS)</span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {service?.status ?? 'unknown'}{service?.latency_ms ? ` · ${service.latency_ms}ms` : ''}{service?.version ? ` · ${service.version}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/terminal"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium"
                style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}>
                Open
              </a>
              <Server size={12} style={{ color: online ? 'var(--success)' : 'var(--text-muted)' }} />
            </div>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

/* ─── Quick-fill presets ──────────────────────────────────────────── */
const QUICK_PRESETS = [
  {
    label: 'OpenJarvis',
    sublabel: 'proxy / VPS · auto-routes all LLMs',
    emoji: '🤖',
    accent: '#A78BFA',
    values: { provider: 'openjarvis' as const, key: '', baseUrl: '/proxy/openjarvis', model: '' },
    tip: 'VPS bridge endpoint. The health test checks the live model registry.',
  },
  {
    label: 'Ollama',
    sublabel: 'proxy / VPS · gemma4',
    emoji: '🦙',
    accent: '#10B981',
    values: { provider: 'ollama' as const, key: '', baseUrl: OLLAMA_BASE_URL, model: 'gemma4:latest' },
    tip: 'Ollama draait op je VPS via Cloudflare tunnel. Zorg dat OLLAMA_ORIGINS=* is ingesteld.',
  },
  {
    label: 'OpenRouter Free',
    sublabel: 'Llama 3.1 · gratis tier',
    emoji: '🔓',
    accent: '#F59E0B',
    values: { provider: 'openrouter' as const, key: '', baseUrl: '', model: 'openrouter/free' },
    tip: 'Get free key at openrouter.ai — "openrouter/free" auto-routes to whatever free model is live right now, so this preset can\'t go stale.',
  },
  {
    label: 'Gemini Flash',
    sublabel: 'Google AI Studio · gratis',
    emoji: '✨',
    accent: '#3B82F6',
    values: { provider: 'google' as const, key: '', baseUrl: '', model: 'gemini-2.5-flash' },
    tip: 'Get free key at aistudio.google.com — Gemini 2.5 Flash is generous on the free tier. Paste your key above.',
  },
];

/* ─── Slot editor ─────────────────────────────────────────────────── */
function SlotEditor({ label, slot, onSave, onClear, accent }:
  { label: string; slot: KeySlot | null; onSave: (s: KeySlot) => void; onClear: () => void; accent: string }) {

  const [provider, setProvider] = useState<ProviderId>(slot?.provider ?? 'anthropic');
  const [key, setKey]     = useState(slot?.key ?? '');
  const [model, setModel] = useState(slot?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(slot?.baseUrl ?? '');
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const voice = useVoiceStore();

  // Sync form when slot is updated externally (e.g. 'Setup Free Config' button)
  useEffect(() => {
    setProvider(slot?.provider ?? 'anthropic');
    setKey(slot?.key ?? '');
    setModel(slot?.model ?? '');
    setBaseUrl(slot?.baseUrl ?? '');
    setTestResult(null);
    setTestError(null);
  }, [slot]);

  const cfg = PROVIDERS.find(p => p.id === provider)!;
  const needsKey = !OPTIONAL_KEY_PROVIDERS.has(provider);
  const [activeTip, setActiveTip] = useState<string | null>(null);

  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    setProvider(preset.values.provider);
    setKey(preset.values.key);
    setBaseUrl(preset.values.baseUrl);
    setModel(preset.values.model);
    setTestResult(null);
    setActiveTip(preset.tip);
    setTimeout(() => setActiveTip(null), 5000);
    // Auto-save if no API key is required (Ollama, OpenHands, OpenJarvis)
    const canAutoSave = OPTIONAL_KEY_PROVIDERS.has(preset.values.provider) || preset.values.key !== '';
    if (canAutoSave) {
      const s: KeySlot = {
        provider: preset.values.provider,
        key: preset.values.key,
        model: preset.values.model || undefined,
        baseUrl: preset.values.baseUrl || undefined,
      };
      onSave(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleSave = () => {
    if (needsKey && !key.trim()) return;
    const s: KeySlot = { provider, key: key.trim(), model: model.trim() || undefined, baseUrl: baseUrl.trim() || undefined };
    onSave(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (needsKey && !key.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    const s: KeySlot = { provider, key: key.trim(), model: model.trim() || undefined, baseUrl: baseUrl.trim() || undefined };
    const ok = await voice.testSlot(s);
    setTestResult(ok);
    // Capture error immediately for THIS slot — before any other test can overwrite shared store.error
    if (!ok) {
      setTestError(useVoiceStore.getState().error);
      useVoiceStore.setState({ error: null }); // see the Gemini test above — don't leak into the shared live-chat error banner
    }
    setTesting(false);
  };

  return (
    <WidgetCard title={label} headerAction={
      <div className="flex items-center gap-1">
        {slot && <span className="rounded-full" style={{ width: 6, height: 6, background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 4px var(--success)' }} />}
        {slot && <span className="text-[10px]" style={{ color: 'var(--success)' }}>{PROVIDERS.find(p => p.id === slot.provider)?.name} geconfigureerd</span>}
      </div>
    }>
      <div className="space-y-2.5">
        {/* Quick presets */}
        <div>
          <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-125"
                style={{ background: `${preset.accent}18`, border: `1px solid ${preset.accent}35`, color: preset.accent }}
                title={preset.tip}
              >
                <span>{preset.emoji}</span>
                <span>{preset.label}</span>
                <span className="text-[9px] opacity-60">{preset.sublabel}</span>
              </button>
            ))}
          </div>
          {activeTip && (
            <p className="text-[10px] mt-1.5 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
              ℹ️ {activeTip}
            </p>
          )}
        </div>

        {/* Provider select */}
        <div>
          <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Provider</label>
          <select value={provider} onChange={e => { setProvider(e.target.value as ProviderId); setKey(''); setModel(''); setBaseUrl(''); setTestResult(null); }}
            className="w-full px-3 py-2 rounded-lg text-small outline-none"
            style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}>
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.defaultModel}</option>)}
          </select>
        </div>

        {/* API Key */}
        {needsKey && (
          <div>
            <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder={`${cfg.name} API key...`}
                className="w-full px-3 py-2 pr-8 rounded-lg text-small font-mono-data outline-none"
                style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
                onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShow(v => !v)} style={{ color: 'var(--text-muted)' }}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        )}

        {/* Base URL — shown for optional-key providers and OpenAI-compatible custom endpoints */}
        {(!needsKey || provider === 'openai') && (
          <div>
            <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Base URL</label>
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
              placeholder={provider === 'openjarvis'
                ? '/proxy/openjarvis'
                : provider === 'openhands'
                ? '/proxy/openhands'
                  : provider === 'openclaw'
                    ? '/proxy/openclaw'
                    : provider === 'kilocode'
                      ? '/proxy/kilocode'
                      : provider === 'crewai'
                        ? '/proxy/crewai'
                        : provider === 'hermes'
                          ? '/proxy/hermes'
                  : provider === 'ollama'
                    ? OLLAMA_BASE_URL
                    : '/proxy/openjarvis'}
              className="w-full px-3 py-2 rounded-lg text-small font-mono-data outline-none"
              style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }} />
          </div>
        )}

        {/* Custom model (optional) */}
        <div>
          <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Model <span style={{ opacity: 0.5 }}>(optional, uses default if empty)</span></label>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder={cfg.defaultModel}
            className="w-full px-3 py-2 rounded-lg text-small font-mono-data outline-none"
            style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium transition-all"
            style={{ background: saved ? 'rgba(16,185,129,0.15)' : `${accent}20`, border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : `${accent}40`}`, color: saved ? 'var(--success)' : accent }}>
            {saved ? <><Check size={12} /> Saved!</> : <><Save size={12} /> Save</>}
          </button>
          <button onClick={handleTest} disabled={testing || (needsKey && !key.trim())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium transition-all"
            style={{ background: testResult === true ? 'rgba(16,185,129,0.1)' : testResult === false ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)', border: `1px solid ${testResult === true ? 'rgba(16,185,129,0.3)' : testResult === false ? 'rgba(239,68,68,0.3)' : 'var(--border-active)'}`, color: testResult === true ? 'var(--success)' : testResult === false ? 'var(--error)' : 'var(--text-secondary)', opacity: (testing || (needsKey && !key.trim())) ? 0.5 : 1 }}>
            {testing ? <RefreshCw size={12} className="animate-spin" /> : testResult === true ? <Check size={12} /> : testResult === false ? <X size={12} /> : <Zap size={12} />}
            {testing ? 'Testing...' : testResult === true ? 'Working!' : testResult === false ? 'Failed' : 'Test'}
          </button>
          {slot && (
            <button onClick={onClear} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs-custom"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {testResult === false && testError && (
          <p className="text-xs-custom" style={{ color: 'var(--error)' }}>{testError}</p>
        )}

        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Keys synced to Supabase · Encrypted · Alleen jij kan ze lezen</p>
      </div>
    </WidgetCard>
  );
}

/* ─── GitHub Repos Section ────────────────────────────────────────── */
// Repo config storage lives in @/infrastructure/persistence/repoConfigService;
// re-exported here because agents/pages historically imported it from this page.
export { loadRepoConfigs, type RepoConfig } from '@/infrastructure/persistence/repoConfigService';

function GitHubReposSection() {
  const [repos, setRepos] = useState<RepoConfigT[]>(() => {
    try { return loadRepoConfigsImpl(); } catch { return DEFAULT_REPOS.map(r => ({ ...r })); }
  });
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const stored = await loadSetting<RepoConfigT[]>('axe_github_repos', DEFAULT_REPOS);
      if (!alive) return;
      if (Array.isArray(stored) && stored.length > 0) {
        setRepos(stored);
      }
    };
    void hydrate();
    return () => { alive = false; };
  }, []);

  const update = (id: string, field: keyof RepoConfigT, value: string) => {
    setRepos(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const save = () => {
    saveRepoConfigs(repos);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = (id: string) => {
    const def = DEFAULT_REPOS.find(r => r.id === id);
    if (def) setRepos(prev => prev.map(r => r.id === id ? { ...def, token: r.token } : r));
  };

  const testOne = async (r: RepoConfigT) => {
    setTestingId(r.id);
    try {
      const { validateRepo } = await import('@/infrastructure/gateways/githubCodeService');
      const result = await validateRepo(r);
      setTestMsg(prev => ({
        ...prev,
        [r.id]: {
          ok: !!result.ok,
          text: result.ok
            ? `OK · ${result.login || 'token'} · push`
            : (result.error || 'Mislukt'),
        },
      }));
    } catch (e) {
      setTestMsg(prev => ({
        ...prev,
        [r.id]: { ok: false, text: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div>
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Configureer de 3 repos waarop AXE CORE kan committen. Wanneer je zegt "verander X", kiest AXE CORE automatisch de juiste repo.
        Gebruik één <strong style={{ color: 'var(--text-secondary)' }}>GitHub PAT</strong> (met <code style={{ fontSize: 10 }}>repo</code>-scope) voor alle repos.
      </p>
      <div className="space-y-3">
        {repos.map(r => (
          <div key={r.id} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Github size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <span className="text-xs-custom font-semibold" style={{ color: 'var(--text-primary)' }}>{r.label}</span>
              <a href={`https://github.com/${r.owner}/${r.repo}`} target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {r.owner}/{r.repo} <ExternalLink size={8} />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Owner</label>
                <input value={r.owner} onChange={e => update(r.id, 'owner', e.target.value)}
                  className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Repo</label>
                <input value={r.repo} onChange={e => update(r.id, 'repo', e.target.value)}
                  className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Branch</label>
                <input value={r.branch} onChange={e => update(r.id, 'branch', e.target.value)}
                  className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div>
              <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>
                <GitBranch size={8} className="inline mr-0.5" />src prefix in repo
              </label>
              <input value={r.srcPrefix} onChange={e => update(r.id, 'srcPrefix', e.target.value)}
                className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>GitHub Token (PAT) — gedeeld voor alle repos is OK</label>
              <div className="relative">
                <input
                  type={showToken[r.id] ? 'text' : 'password'}
                  value={r.token}
                  onChange={e => update(r.id, 'token', e.target.value)}
                  placeholder="ghp_... of github_pat_..."
                  className="w-full px-2 py-1 pr-7 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowToken(s => ({ ...s, [r.id]: !s[r.id] }))} style={{ color: 'var(--text-muted)' }}>
                  {showToken[r.id] ? <EyeOff size={10} /> : <Eye size={10} />}
                </button>
              </div>
            </div>
            {testMsg[r.id] && (
              <p className="text-[10px]" style={{ color: testMsg[r.id].ok ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)' }}>
                {testMsg[r.id].text}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void testOne(r)}
                disabled={testingId === r.id}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
                style={{
                  background: 'rgba(34,211,238,0.08)',
                  border: '1px solid rgba(34,211,238,0.25)',
                  color: 'var(--accent-cyan)',
                  opacity: testingId === r.id ? 0.6 : 1,
                }}
              >
                {testingId === r.id ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
                Test connection
              </button>
              <button type="button" onClick={() => reset(r.id)} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                <Trash2 size={8} /> reset naar default
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
          style={{ background: saved ? 'rgba(16,185,129,0.15)' : 'rgba(34,211,238,0.1)', border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'rgba(34,211,238,0.3)'}`, color: saved ? 'var(--success)' : 'var(--accent-cyan)' }}>
          {saved ? <><Check size={12} /> Opgeslagen!</> : <><Save size={12} /> Opslaan</>}
        </button>
        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          Tokens worden alleen lokaal opgeslagen (localStorage) — nooit verstuurd naar de server.
        </p>
      </div>
    </div>
  );
}

/* ─── Trust & autonomy — the capability ladder ───────────────────────────
 * Per approval-gated category: a real track record (approved/denied/auto-run
 * counts) and a manual switch to let AXE run that category without asking.
 * Every category starts off (matches the existing "always ask" behavior);
 * only Luka can flip it on — never AXE itself. */
const TRUST_CATEGORIES: { id: ApprovalKind; label: string }[] = [
  { id: 'exec', label: 'VPS-commando\'s uitvoeren' },
  { id: 'git_write', label: 'Bestanden committen naar GitHub' },
  { id: 'git_pr_merge', label: 'Pull requests mergen' },
  { id: 'db_sql', label: 'SQL draaien op Supabase' },
  { id: 'vercel_promote', label: 'Vercel-deployment promoten' },
  { id: 'agent', label: 'Taken doorsturen naar een externe agent' },
  { id: 'smart_home', label: 'Smart home (SmartThings)' },
  // These two reach the worktree the running app is served from, so they
  // change what Luka is looking at rather than a copy elsewhere.
  { id: 'local_write', label: 'Bestanden op deze Mac aanpassen' },
  { id: 'local_run', label: 'Build/git draaien op deze Mac' },
  // Leave this off unless you are watching the phone: an approved tap lands
  // on whatever is on screen at that moment, and the screen is not always
  // what the last dump showed.
  { id: 'phone', label: 'De telefoon bedienen (tikken, typen, apps openen)' },
];

function TrustLevelsSection() {
  const [levels, setLevels] = useState<TrustLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ApprovalKind | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLevels(await loadTrustLevels());
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const toggle = async (category: ApprovalKind, next: boolean) => {
    setSaving(category);
    await setAutoApprove(category, next);
    await refresh();
    setSaving(null);
  };

  return (
    <WidgetCard
      title="🛡️ TRUST & AUTONOMIE"
      headerAction={<button onClick={() => void refresh()}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: 'var(--text-muted)' }} /></button>}
    >
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Per categorie: hoe vaak goedgekeurd/afgewezen, en of AXE 'm zelfstandig mag uitvoeren zonder te vragen. Staat standaard uit — jij zet dit aan op basis van het trackrecord hieronder, AXE nooit zelf. Elke automatische run blijft altijd zichtbaar via een melding.
      </p>
      <div className="space-y-2">
        {TRUST_CATEGORIES.map(({ id, label }) => {
          const lvl = levels.find(l => l.category === id);
          const autoApprove = lvl?.auto_approve ?? false;
          return (
            <div key={id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-small" style={{ color: 'var(--text-primary)' }}>{label}</p>
                <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                  {lvl ? `${lvl.approved_count} goedgekeurd · ${lvl.denied_count} afgewezen · ${lvl.auto_run_count} automatisch gedraaid` : 'laden…'}
                </p>
              </div>
              <button
                onClick={() => void toggle(id, !autoApprove)}
                disabled={saving === id}
                role="switch"
                aria-checked={autoApprove}
                title={autoApprove ? 'AXE mag dit zelfstandig — klik om weer altijd te vragen' : 'AXE vraagt altijd eerst — klik om te vertrouwen'}
                className="relative flex-shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ width: 38, height: 22, background: autoApprove ? 'var(--accent-cyan)' : 'var(--bg-active)', border: '1px solid var(--border-active)' }}
              >
                <span className="absolute top-0.5 rounded-full bg-white transition-transform" style={{ width: 16, height: 16, transform: autoApprove ? 'translateX(18px)' : 'translateX(2px)' }} />
              </button>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}

/* ─── Main Settings page ──────────────────────────────────────────── */
export default function SettingsPage() {
  const voice = useVoiceStore();
  const [micTest, setMicTest] = useState<'idle' | 'testing' | 'ok' | 'denied'>('idle');
  const [clapEnabled, setClapEnabled] = useState(false);

  useEffect(() => { voice.checkMicPermission(); }, []);
  useEffect(() => { loadSetting('axe_clap_activate_enabled', false).then(setClapEnabled); }, []);

  const toggleClap = () => {
    const next = !clapEnabled;
    setClapEnabled(next);
    void saveSetting('axe_clap_activate_enabled', next);
  };

  const testMic = async () => {
    setMicTest('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicTest('ok');
    } catch { setMicTest('denied'); }
  };

  // Auto-confirm the mic the moment permission is already granted — no need
  // to click "Test Mic" every time just to see the green confirmation. Only
  // fires when the OS already says 'granted' (checkMicPermission above, a
  // passive read), so this never triggers a fresh permission prompt on its
  // own — it only surfaces what's already true.
  useEffect(() => {
    if (voice.micPermission === 'granted' && micTest === 'idle') void testMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.micPermission]);

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-page-title font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      <BuildStampLine />

      {/* Says so when a save only reached this device. Without it, pasting an
          API key while signed out looks identical to pasting one that worked,
          and every background agent keeps using the old value. */}
      <UnsyncedSettingsBanner />

      <div className="space-y-4">

         {/* ── Provider Keys (unified smart-router keys) ────────────── */}
         <ProviderKeysSection />

         {/* ── Ollama Models ─────────────────────────────────────────── */}
        <OllamaModelsSection />

        {/* ── Microphone ───────────────────────────────────────────── */}
        <WidgetCard title="MICROPHONE" headerAction={<Mic size={14} style={{ color: 'var(--text-muted)' }} />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-small" style={{ color: 'var(--text-primary)' }}>Browser microphone access</p>
                <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                  Permission: <span style={{ color: voice.micPermission === 'granted' ? 'var(--success)' : voice.micPermission === 'denied' ? 'var(--error)' : 'var(--warning)' }}>{voice.micPermission}</span>
                  {' · '}Recognition supported: <span style={{ color: voice.recognitionSupported ? 'var(--success)' : 'var(--error)' }}>{voice.recognitionSupported ? 'yes' : 'no'}</span>
                </p>
              </div>
              <button onClick={testMic} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs-custom"
                style={{ background: micTest === 'ok' ? 'rgba(16,185,129,0.1)' : micTest === 'denied' ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)', border: `1px solid ${micTest === 'ok' ? 'rgba(16,185,129,0.3)' : micTest === 'denied' ? 'rgba(239,68,68,0.3)' : 'var(--border-active)'}`, color: micTest === 'ok' ? 'var(--success)' : micTest === 'denied' ? 'var(--error)' : 'var(--accent-cyan)' }}>
                {micTest === 'testing' ? <RefreshCw size={12} className="animate-spin" /> : <Mic size={12} />}
                {micTest === 'idle' ? 'Test Mic' : micTest === 'testing' ? 'Testing...' : micTest === 'ok' ? 'Mic Works!' : 'Permission Denied'}
              </button>
            </div>
            {voice.micPermission === 'denied' && (
              <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={13} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs-custom" style={{ color: 'var(--error)' }}>
                  Microphone blocked. Click the lock icon in the address bar → Site Settings → Microphone → Allow → Refresh page.
                </p>
              </div>
            )}
            {micTest === 'ok' && (
              <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Check size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs-custom" style={{ color: 'var(--success)' }}>Microphone is working correctly. Use the circle button in the bottom bar to talk to AXE.</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border-active)' }}>
              <div>
                <p className="text-small" style={{ color: 'var(--text-primary)' }}>Clap to activate</p>
                <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                  Clap twice (or three times) to open AXE and start listening, from anywhere in the app. Keeps the mic on in the background while enabled.
                </p>
              </div>
              <button onClick={toggleClap} role="switch" aria-checked={clapEnabled}
                className="relative flex-shrink-0 rounded-full transition-colors"
                style={{ width: 38, height: 22, background: clapEnabled ? 'var(--accent-cyan)' : 'var(--bg-active)', border: '1px solid var(--border-active)' }}>
                <span className="absolute top-0.5 rounded-full bg-white transition-transform" style={{ width: 16, height: 16, transform: clapEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
              </button>
            </div>
          </div>
        </WidgetCard>

        {/* ── Voice (ElevenLabs TTS) ───────────────────────────────── */}
        <VoiceSection />

        {/* ── Fish Audio (second, optional voice provider) ──────────── */}
        <FishAudioSection />

        {/* ── AXE Quotes (between voice and trust) ─────────────────── */}
        <MindsetQuotesSection />

        {/* ── Trust & Autonomie (capability ladder) ─────────────────── */}
        <TrustLevelsSection />

        {/* Tool calling — direct onder de trust-ladder, want het is dezelfde
            vraag: wat mag AXE zelf doen. */}
        <ToolCallingSection />

        {/* ── Capability Router ─────────────────────────────────── */}
        <WidgetCard title="⚡ CAPABILITY ROUTER">
          <CapabilityRouterSection />
        </WidgetCard>

        {/* ── Remote Terminal ───────────────────────────────────── */}
        <RemoteTerminalSection />

        {/* ── Live Services ──────────────────────────────────────── */}
        <ServiceHealthSection />

        {/* ── Developer: GitHub Repos ───────────────────────────────── */}
        <WidgetCard title="🔧 DEVELOPER — GITHUB REPOS">
          <GitHubReposSection />
        </WidgetCard>

        {/* ── General settings grid ─────────────────────────────────────── */}
        <div className={LIST_GRID}>
          {[
            { title: 'Appearance', icon: '🎨', items: [{ k: 'Theme', v: 'Dark (AXE)' }, { k: 'Accent', v: 'Cyan' }, { k: 'Animations', v: 'Enabled' }] },
            { title: 'Keyboard',   icon: '⌨️', items: [{ k: 'Shortcuts', v: 'Enabled' }, { k: 'Command palette', v: '⌘K' }, { k: 'Voice toggle', v: '⌘⇧A' }] },
            { title: 'Security',   icon: '🔒', items: [{ k: '2FA', v: 'Enabled' }, { k: 'Session timeout', v: '30 min' }, { k: 'Keys stored', v: 'localStorage only' }] },
            { title: 'System',     icon: '⚙️', items: [{ k: 'Auto-update', v: 'Enabled' }, { k: 'Telemetry', v: 'Disabled' }, { k: 'Debug', v: 'Off' }] },
          ].map(group => (
            <WidgetCard key={group.title} title={`${group.icon} ${group.title}`}>
              <div className="space-y-2">
                {group.items.map(item => (
                  <div key={item.k} className="flex items-center justify-between py-0.5">
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>{item.k}</span>
                    <span className="text-xs-custom font-mono-data" style={{ color: 'var(--text-primary)' }}>{item.v}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
          ))}
        </div>
      </div>
    </motion.div>
  );
}