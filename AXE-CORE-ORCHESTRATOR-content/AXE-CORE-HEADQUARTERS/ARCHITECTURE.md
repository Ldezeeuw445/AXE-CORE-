# AXE CORE HEADQUARTERS — Frontend Architecture

This document describes the layered architecture of the HEADQUARTERS app after
the clean-architecture refactor. **No product behavior changed** — only the
structure, boundaries, and code quality.

---

## 1. Folder structure

```
src/
├── app/                      # COMPOSITION ROOT — the only place that "wires everything together"
│   ├── App.tsx               # Thin shell: providers + guards + route registry
│   ├── routes.tsx            # Declarative registry of all authenticated routes
│   ├── registerServiceWorker.ts  # PWA bootstrap (moved out of main.tsx)
│   ├── guards/
│   │   └── RequireAuth.tsx   # Auth + admin-allowlist route guard
│   └── hooks/
│       └── useGlobalVoiceActivation.ts  # App-level voice bootstrap (chat reload, clap detector)
│
├── core/                     # FOUNDATION — framework-agnostic config & clients (no UI imports)
│   ├── config/
│   │   ├── env.ts            # Runtime environment detection (Tauri / dev / prod)
│   │   ├── endpoints.ts      # API base URLs + provider proxy routing table
│   │   └── access.ts         # Admin allowlist (single source of truth)
│   └── supabase/
│       └── client.ts         # Lazy Supabase singleton
│
├── services/                 # APPLICATION LAYER — grouped by domain, one folder = one bounded context
│   ├── ai/                   # Agent engine & orchestration
│   │   ├── aiAgent.ts, agenticEngine.ts, langGraphOrchestrator.ts
│   │   ├── chatActionService.ts, codeEditorAgent.ts, localCodeAgent.ts
│   │   ├── workflowBuilder.ts, tools.ts, capabilityService.ts
│   │   └── llmModelRegistryService.ts, ollamaModelCatalog.ts, providerConnectionDefaults.ts
│   ├── memory/               # Persistence & memory subsystems
│   │   ├── agentMemoryService.ts, globalMemoryService.ts, ragMemoryService.ts
│   │   └── sharedMemory.ts, chatPersistence.ts, coreDB.ts, aiCoreLogService.ts
│   ├── integrations/         # Third-party API adapters (infrastructure)
│   │   ├── axeCoreApiService.ts, githubCodeService.ts, n8nService.ts
│   │   ├── elevenLabsService.ts, geminiLiveService.ts, livekitService.ts, kimiClawService.ts
│   │   ├── exaSearchService.ts, tavilyService.ts, browserFetchService.ts
│   │   └── openhands.ts, osint.ts, osintService.ts
│   └── platform/             # System, runtime & user-settings services
│       ├── systemService.ts, systemRegistryService.ts, mcpRegistryService.ts
│       ├── runtimeEditsService.ts, runtimeLayoutService.ts
│       └── userSettingsService.ts, workspaceFilesService.ts
│
├── pages/                    # PRESENTATION — route-level screens (one file per route)
├── components/               # PRESENTATION — feature UI (ai/, axe-core/, browser/, maps3d/, …)
│   ├── shared/               # Reusable app components (ErrorBoundary, GlassPanel, …)
│   └── ui/                   # shadcn/ui design-system primitives
├── hooks/                    # Reusable presentation logic
├── store/                    # Client state (zustand: uiStore, voiceStore)
├── contexts/                 # React context providers (Auth, Notifications)
├── lib/                      # Pure utilities (utils, navRegistry, eveSkills, maps3d helpers)
└── types/                    # Shared type definitions
```

## 2. Clean architecture breakdown

Dependencies point **inward only**:

```
main.tsx ─▶ app/ (composition root)
               │
   pages/ ── components/ ── hooks/ ── store/ ── contexts/     (presentation)
               │
           services/{ai, memory, integrations, platform}       (application / domain)
               │
           core/{config, supabase}                             (foundation)
```

- **`core/`** knows nothing about React, services, or the UI. It answers two
  questions: *where am I running?* (`env.ts`) and *where do I talk to?*
  (`endpoints.ts`, `supabase/client.ts`).
- **`services/`** contains all business/application logic, grouped into four
  bounded contexts. Services import `core/` and each other via absolute
  `@/services/<domain>/<name>` paths — the import path itself now documents
  which domain a dependency belongs to.
- **Presentation** (`pages/`, `components/`, `hooks/`, `store/`) calls into
  services; services never import UI.
- **`app/`** is the only layer aware of *everything*: it assembles providers,
  guards, and the route registry. Adding a new screen = one entry in
  `app/routes.tsx`, nothing else changes.

## 3. What changed (and why)

| Change | Before | After | Why |
|---|---|---|---|
| Composition root | 120-line `App.tsx` mixing auth guard UI, admin allowlist, voice wiring, SW logic and 25 routes | `app/App.tsx` (thin) + `routes.tsx` + `guards/RequireAuth.tsx` + `hooks/useGlobalVoiceActivation.ts` | Single responsibility; routes become data, not code |
| Service layer | 39 files flat in `src/services/` | 4 domain modules: `ai/`, `memory/`, `integrations/`, `platform/` | Bounded contexts; discoverability; import paths encode ownership |
| Configuration | `lib/apiConfig.ts` mixing env detection with endpoint tables; `ADMIN_EMAILS` inline in App.tsx | `core/config/{env,endpoints,access}.ts` | Single source of truth per concern; env probing no longer scattered |
| Supabase client | `lib/supabaseClient.ts` (utility folder) | `core/supabase/client.ts` | Infrastructure clients live in the foundation layer, `lib/` stays pure utilities |
| Sign-out in access-denied screen | Hacky `(window as never).supabase` global probe | Real `getSupabase()` client | Removes an untyped global that silently did nothing |
| Type safety | 10 `tsc --noEmit` errors | **0 errors** | `ControlPlaneDispatchPayload` now documents the real wire contract; invalid lucide `title` props replaced with proper tooltip wrappers |
| Repo hygiene | Accidental binary file `--clip` committed | Removed | — |

## 4. Conventions going forward

1. **New service?** Put it in the matching `services/<domain>/`; if no domain
   fits, create a new folder — never add to a flat root.
2. **New route?** Add one entry to `app/routes.tsx`.
3. **New external API?** Adapter goes in `services/integrations/`; read base
   URLs from `core/config/endpoints.ts` — never hardcode hosts in components.
4. **Imports:** always `@/…` absolute paths; cross-domain relative imports
   (`../../services/x`) are forbidden.
5. **Keep `tsc --noEmit` at zero errors** — it is now a meaningful CI gate.
