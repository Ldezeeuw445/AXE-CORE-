# AXE CORE HEADQUARTERS — Architecture

This document describes the layered architecture of the frontend app, the
dependency rules between layers, and the migration plan for code that has not
yet been moved into the new structure.

## Layers

```
┌────────────────────────────────────────────────────────────┐
│  UI            src/pages, src/components, src/hooks        │
│                (React only — renders state, emits intents) │
├────────────────────────────────────────────────────────────┤
│  State         src/store, src/contexts                     │
│                (Zustand/Context — UI state + orchestration)│
├────────────────────────────────────────────────────────────┤
│  Services      src/services                                │
│                (application workflows: agentic engine,     │
│                 chat persistence, memory, n8n, …)          │
├────────────────────────────────────────────────────────────┤
│  Infrastructure  src/infrastructure                        │
│                (adapters that do I/O: HTTP gateways,       │
│                 localStorage, speech, persistence)         │
├────────────────────────────────────────────────────────────┤
│  Core          src/core                                    │
│                (pure domain: types, config registries,     │
│                 routing policy, prompts — NO I/O,          │
│                 NO React, NO Zustand, NO Supabase)         │
└────────────────────────────────────────────────────────────┘
```

**Dependency rule: arrows point down only.** A layer may import from any layer
below it, never above. In particular:

- `core/**` imports nothing outside `core` (exception: pure data modules
  explicitly noted in "Known debt" below).
- `infrastructure/**` may import `core` and other infrastructure adapters.
- `services/**` may import `core`, `infrastructure`, and other services.
- `store/**` may import everything below; **nothing below imports a store.**
- `pages/components/hooks` are the only place React state hooks are consumed.

## Folder structure

```
src/
  core/                        # innermost layer — pure, unit-testable
    llm/
      types.ts                 # ChatMessage, ProviderId, KeySlot, RoutingEvent, …
      providers.ts             # PROVIDERS registry, env keys, model migrations
      baseUrls.ts              # base-URL defaults + normalization
      routingPolicy.ts         # classifyQuery, selectByCapability, slot ordering
      prompts.ts               # AXE_SYSTEM_PROMPT
  infrastructure/              # adapters that talk to the outside world
    llm/
      providerGateway.ts       # callProvider — ONE gateway, 4 wire formats
      slotResolver.ts          # resolves KeySlots from stored connections
    storage/
      localStore.ts            # safe typed localStorage (readJSON/writeJSON/…)
    voice/
      speech.ts                # STT (SpeechRecognition) + TTS fallback chain
    persistence/
      routingLogStore.ts       # routing-log local persistence
  services/                    # application workflows (unchanged API surface)
  store/                       # Zustand stores — UI state + orchestration only
  contexts/ hooks/ pages/ components/ lib/
```

## What changed and why

### 1. The `voiceStore` god module was split (815 → ~500 lines)

`store/voiceStore.ts` previously contained the provider registry, an HTTP
client for four wire formats (OpenAI/Anthropic/Google/VPS bridge), credential
resolution, routing policy, speech I/O, the master system prompt, routing-log
persistence, *and* UI state. Services (`agenticEngine`, `codeEditorAgent`,
`geminiLiveService`, `localCodeAgent`, `systemRegistryService`) imported the
LLM gateway **from the UI store**, inverting the dependency direction.

Each concern now lives in the layer it belongs to (see folder structure).
The store keeps only Zustand state and the `sendMessage` pipeline, and
re-exports the old names (`callProvider`, `PROVIDERS`, `KeySlot`, …) so all
existing importers compile unchanged — a strangler-fig seam: old imports keep
working, new code imports from `core`/`infrastructure` directly.

### 2. Circular dependency removed

`services/providerConnectionDefaults.ts` imported `ProviderId` from the store
while the store imported `normalizeProviderBaseUrl` back from it. The logic
moved to `core/llm/baseUrls.ts`; the old file is a re-export shim.

### 3. Duplicated slot-collection logic centralized

The "collect all configured provider slots" loop existed twice inside
`sendMessage` and once more in the code-edit path. It is now
`infrastructure/llm/slotResolver.getAllConfiguredSlots()`.

### 4. Safe storage access

The `try { JSON.parse(localStorage.getItem(...)) } catch { … }` pattern was
duplicated across 30+ files. `infrastructure/storage/localStore.ts` provides
`readJSON`/`writeJSON`/`readString`/`writeString`/`remove` used by all new
modules; existing call sites migrate opportunistically (see plan below).

## Migration plan (remaining work, in priority order)

1. **Point services at the new modules.** `agenticEngine`, `codeEditorAgent`,
   `localCodeAgent`, `geminiLiveService`, `systemRegistryService` should import
   `callProvider`/`KeySlot` from `@/infrastructure/llm/providerGateway` and
   `@/core/llm/types` instead of `@/store/voiceStore`. Mechanical change —
   the re-exports guarantee both paths stay equivalent until then.
2. **Unify the browser-assistant LLM client.** `services/aiAgent.ts` has its
   own provider preset list and per-format fetch code (with tool calling).
   Extend `providerGateway` with a tool-calling variant and delete the
   duplicate presets.
3. **Migrate localStorage call sites** to `localStore` helpers, file by file,
   whenever a file is touched for other reasons. Keys stay identical.
4. **Move pure catalogs into core.** `services/ollamaModelCatalog.ts` is pure
   data and is already imported by `core/llm/routingPolicy.ts` (the one
   documented exception to the core-imports-nothing rule). Moving it to
   `core/llm/ollamaCatalog.ts` removes the exception.
5. **Split `sendMessage` intents.** The workflow-build / system-status /
   code-edit branches inside `sendMessage` are candidates for an intent
   handler table (`core/chat/intents.ts`) once they need to grow.
6. **Slim the mega-pages.** `pages/Memory.tsx` (1806 lines) and
   `pages/SettingsPage.tsx` (1252 lines) mix data access with rendering;
   extract their Supabase/localStorage access into services, then split into
   feature components.

## Guarantees held by this refactor

- **Zero behavior change**: all moved code is verbatim; wire formats, storage
  keys, timeouts, fallback order, and prompts are byte-identical.
- **Zero import breakage**: every previously exported symbol of
  `voiceStore.ts` and `providerConnectionDefaults.ts` is still exported from
  the same path.
- **Typecheck parity**: `tsc -b` reports strictly fewer errors than before the
  refactor (10 → 5; the remaining 5 are pre-existing and unrelated).
