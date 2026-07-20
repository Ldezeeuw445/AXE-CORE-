# AXE CORE HQ — Frontend Architecture

The frontend follows a clean-architecture layering. Every module lives in
exactly one layer, and dependencies only point **inward**:

```
app ──────────► presentation ──────────► application ─────► domain
 │                    │                       │               ▲
 │                    └───────────────────────┼───────────────┤
 └───────────────────► infrastructure ────────┘───────────────┘
                        (may only depend on domain + shared)
```

```
src/
├── app/              Composition root: main.tsx, App.tsx (routing/providers),
│                     global CSS. The only place that wires all layers together.
├── domain/           Pure business model. No I/O, no React, no framework deps.
│   ├── providers.ts      Provider registry (ProviderId, PROVIDERS, KeySlot) and
│   │                     the routing policy: classifyQuery, selectByCapability,
│   │                     prioritizeOllamaSlots, capabilityToSpecialists, migrateModel
│   ├── prompts.ts        AXE_SYSTEM_PROMPT
│   ├── navRegistry.ts    Declarative tab/route registry (chat navigation + nav UI)
│   ├── types/            Shared model types (browser, aiConfig, speech ambient types)
│   ├── catalogs/         Static data: ollamaModelCatalog, eveSkills
│   └── maps3d/           Map domain: types, constants, fleetData
├── application/      Use-case orchestration. Coordinates domain policy with
│                     infrastructure. Never imports presentation or app.
│   ├── agents/           aiAgent, agenticEngine, codeEditorAgent,
│   │                     localCodeAgent, langGraphOrchestrator
│   ├── chat/             chatActionService (chat → app actions)
│   ├── system/           systemService (health checks), systemRegistryService
│   ├── workflows/        workflowBuilder (n8n)
│   └── browser/          tools (browser tool-calling definitions)
├── infrastructure/   Everything that touches the outside world.
│                     May only depend on domain + shared.
│   ├── supabase/         supabaseClient (lazy singleton)
│   ├── config/           apiConfig (env/proxy URLs), providerConnectionDefaults
│   ├── gateways/         HTTP/WS clients: llmGateway (all LLM dispatch),
│   │                     axeCoreApiService (VPS API), elevenLabs, tavily, exa,
│   │                     github, livekit, n8n, openhands, osint, geminiLive, …
│   ├── persistence/      Supabase/localStorage repositories: chatPersistence,
│   │                     coreDB, memory services, userSettings, repoConfig, …
│   └── maps/             googleMaps3DLoader (external script bootstrap)
├── presentation/     React UI. May use every inner layer.
│   ├── components/       Feature components + shadcn ui/
│   ├── pages/            Route-level screens
│   ├── hooks/            React hooks
│   ├── contexts/         React contexts (Auth, Notification)
│   ├── store/            Zustand stores (uiStore, voiceStore)
│   └── maps3d/           Map view helpers (audio, icons, export, hook)
└── shared/           Cross-cutting utilities with no layer knowledge (utils.ts)
```

## The dependency rule

- **domain** imports nothing but domain/shared. It is pure and trivially testable.
- **application** and **infrastructure** may import domain (and each other in the
  application → infrastructure direction only). Neither may import presentation
  or app — shared shapes belong in domain.
- **presentation** may import anything except app.
- **app** is the composition root and may import everything.

These boundaries are **enforced by ESLint** (`no-restricted-imports` blocks in
`eslint.config.js`): an import in the wrong direction fails lint.

## Key seams

- **`domain/providers.ts` vs `infrastructure/gateways/llmGateway.ts`** —
  *which* provider handles a query (pure policy) is separate from *how* to call
  it on the wire (dev proxy, Vercel edge function, VPS agent bridge). The
  voiceStore now only holds UI/session state and re-exports these symbols for
  backwards compatibility; new code should import from the real homes.
- **`infrastructure/persistence/*`** — each Supabase/localStorage concern is a
  small repository module. UI never touches `localStorage` keys owned by a
  repository directly.
- **`domain/navRegistry.ts`** — single source of truth for tabs/routes, shared
  by nav UI and chat-driven navigation without coupling either to the other.

## Verification

- `npm run typecheck` — strict TS across `src/` (kept at zero errors)
- `npm run build` — Vite production build
- `npx eslint src` — includes the layer-boundary rules

## Other deployables in this folder

- `api/` — Vercel Edge Functions (`browse`, `proxy/ai`) used in production
- `supabase/functions/` — Supabase Edge Functions (ai-proxy, livekit-token)
- `backend/axe_api/` — FastAPI VPS micro-service (privileged Supabase/n8n/GitHub)
- `src-tauri/` — Tauri desktop shell

Each is deployed independently; the frontend talks to them only through
`infrastructure/` gateways.
