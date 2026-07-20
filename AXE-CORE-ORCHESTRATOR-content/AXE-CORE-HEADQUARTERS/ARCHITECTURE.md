# AXE CORE HEADQUARTERS — Architecture

This document describes the clean-architecture layout of the frontend app in
this directory, the rules that keep it maintainable, and the reasoning behind
the 2026-07 restructuring. **No product behavior was changed** by that
restructuring — it was a pure reorganization plus configuration deduplication,
verified by an unchanged `tsc` baseline and an identical production build.

## Folder structure

```
src/
├── main.tsx                  # Entry point (referenced by index.html)
├── index.css
│
├── app/                      # ── COMPOSITION ROOT ──
│   ├── App.tsx               # Wires providers, guards and routes together
│   ├── routes.tsx            # Single source of truth: path → page
│   ├── config/access.ts      # Admin allowlist (access control policy)
│   ├── guards/RequireAuth.tsx# Route guard (auth + admin check)
│   └── providers/            # Cross-cutting React providers
│       ├── AuthContext.tsx
│       └── NotificationContext.tsx
│
├── domain/                   # ── DOMAIN ── pure types & static data, no IO
│   ├── types/                # browser.ts, speech.d.ts
│   ├── navRegistry.ts        # Tab/app names & routes (used by nav + chat actions)
│   └── catalogs/             # Static model catalogs (ollamaModelCatalog)
│
├── application/              # ── APPLICATION ── use-case orchestration, no React
│   ├── orchestration/        # agenticEngine, langGraphOrchestrator, workflowBuilder
│   ├── agents/               # aiAgent, codeEditorAgent, localCodeAgent, tools
│   ├── chat/                 # chatActionService (chat → app actions)
│   └── routing/              # capabilityService (capability → model/agent routing)
│
├── infrastructure/           # ── INFRASTRUCTURE ── all IO adapters
│   ├── config/
│   │   ├── serviceEndpoints.ts        # SINGLE SOURCE OF TRUTH for external endpoints
│   │   ├── apiConfig.ts               # Runtime URL resolution (Tauri vs web proxy)
│   │   └── providerConnectionDefaults.ts
│   ├── supabase/supabaseClient.ts     # The only place a Supabase client is created
│   ├── gateways/             # Clients for external systems (one file per system):
│   │                         #   axeCoreApiService, n8nService, livekitService,
│   │                         #   githubCodeService, geminiLiveService, elevenLabs,
│   │                         #   tavily, exa, osint, openhands, kimiClaw,
│   │                         #   browserFetch, workspaceFiles, systemService, …
│   ├── persistence/          # Supabase/localStorage-backed stores:
│   │                         #   chatPersistence, userSettingsService, coreDB,
│   │                         #   agent/global/rag/shared memory, runtime edits/layout,
│   │                         #   aiCoreLogService, eveSkills
│   └── registries/           # Storage-backed runtime registries:
│                             #   llmModelRegistry, mcpRegistry, systemRegistry
│
├── pages/                    # ── PRESENTATION ── route-level screens
├── components/               # Reusable UI (ui/ = shadcn primitives, rest = feature UI)
├── hooks/                    # React hooks
├── store/                    # Zustand stores (uiStore, voiceStore)
└── lib/                      # Presentation-local helpers only
    ├── utils.ts              # cn() — kept here per shadcn convention
    └── maps3d/               # Maps3D feature helpers
```

## Layering & dependency rules

Dependencies must point **inward** (top of the list may import from anything
below it, never the reverse):

```
presentation (pages, components, hooks, store)
        │
        ▼
app (composition root — wires everything, imported only by main.tsx)
        │
        ▼
application (use cases / orchestration — framework-free)
        │
        ▼
infrastructure (gateways, persistence, registries, config)
        │
        ▼
domain (pure types, catalogs, registries of names — imports nothing)
```

Concretely:

1. **`domain/` imports nothing** from other layers. It is pure data and types.
2. **`infrastructure/`** may import `domain/` only. Each file wraps exactly one
   external system (HTTP API, Supabase table group, localStorage namespace).
3. **`application/`** may import `domain/` and `infrastructure/`, but never
   React, pages, or components. This is where multi-step behavior lives
   (agent loops, LangGraph orchestration, workflow building).
4. **Presentation** (`pages/`, `components/`, `hooks/`, `store/`) may import
   from any lower layer, but pages/components should prefer going through
   `application/` services rather than talking to gateways directly.
5. **`app/`** is the only place where routes, guards, and providers are wired
   together; `main.tsx` only mounts `app/App`.

## What the restructuring changed (and why)

### 1. The 40-file `services/` grab-bag was split by responsibility
Every module used to live in one flat folder regardless of whether it was an
external API client, a persistence layer, a static catalog, or business
orchestration. They are now separated into `application/`, `infrastructure/
{gateways,persistence,registries,config}`, and `domain/catalogs`, so:
- the dependency direction is visible in the import path — a PR that makes a
  gateway import an orchestrator is immediately suspicious;
- swapping an external system (e.g. a different TTS vendor) is localized to
  one `gateways/` file;
- new engineers can find "the thing that talks to n8n" without reading 40 files.

### 2. Composition root decomposed (`App.tsx`)
`App.tsx` mixed route definitions, the auth guard, the admin allowlist, and
app bootstrapping. Those are now four small modules under `app/`
(`routes.tsx`, `guards/RequireAuth.tsx`, `config/access.ts`, `App.tsx`), each
with one reason to change. The route table is data, so future work (lazy
loading, breadcrumbs, per-route metadata) touches one file.

### 3. Endpoint configuration deduplicated
The table of external service URLs existed **twice**: hand-written proxy
entries in `vite.config.ts` and a parallel map in `apiConfig.ts`. They could
(and eventually would) drift. `infrastructure/config/serviceEndpoints.ts` is
now the single registry; `vite.config.ts` generates its `/proxy/*` table from
it and `apiConfig.ts` resolves Tauri-direct URLs from it. Adding a service is
now a one-line change.

### 4. History-preserving, behavior-preserving migration
All moves were done with `git mv` (history follows the file). Imports were
rewritten mechanically via the `@/` alias. Verification: the TypeScript error
baseline is byte-for-byte the same 10 pre-existing errors, and `npm run build`
produces an identical bundle profile.

### 5. Hygiene
- `supabase/.temp/` (machine-local Supabase CLI state) is untracked and
  gitignored.
- A stray binary artifact (`--clip`) was removed.

## Conventions for future work

- **New external integration** → one file in `infrastructure/gateways/`.
  Read config via `userSettingsService`/`serviceEndpoints`, never inline URLs.
- **New multi-step behavior** → `application/` module that composes gateways;
  keep React out of it so it stays testable.
- **New screen** → `pages/` + one entry in `app/routes.tsx` (and
  `domain/navRegistry.ts` if it appears in navigation/chat actions).
- **Direct `supabaseClient` or `localStorage` use in components is legacy.**
  When touching such a component, move the data access behind an
  `infrastructure/persistence` service. (Roughly 30 components still do this;
  migrate opportunistically, not big-bang.)

## Known next steps (deliberately not done in the restructuring)

These change runtime behavior or need tests first, so they were left out of
the behavior-preserving pass:

1. **Route-level code splitting** — the main chunk is ~3.2 MB; `routes.tsx`
   is now shaped so `React.lazy` per route is a small, isolated change.
2. **God-component decomposition** — `pages/Memory.tsx` (1.8k lines),
   `components/maps3d/OSINTPanel.tsx` (1.5k), `pages/SettingsPage.tsx` (1.2k)
   should each be split into feature folders once covered by smoke tests.
3. **Fix the 10 pre-existing type errors** (`store/voiceStore.ts`,
   `components/layout/Sidebar.tsx`, `infrastructure/gateways/
   googleMaps3DLoader.ts`, `components/maps3d/SimpleFallbackMap.tsx`) — the
   voiceStore ones look like a real payload-shape mismatch and deserve a
   behavior review, not a cast.
4. **Typed storage adapter** — centralize the `axe_*` localStorage keys behind
   one module to eliminate stringly-typed keys scattered across ~30 files.
