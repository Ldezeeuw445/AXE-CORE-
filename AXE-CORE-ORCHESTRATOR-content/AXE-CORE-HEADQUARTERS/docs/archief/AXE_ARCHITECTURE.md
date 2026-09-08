# AXE CORE — Architecture Audit (Phase 0)

Written 2026-08-20 by reading the repository and the live systems, not from the
brief. Where the brief and the code disagree, the code is recorded here.

---

## 1. Corrections to the assumed stack

The build brief describes "React, TypeScript, Node.js … Alpaca, Finnhub". The
actual system differs in ways that change the work:

| Brief says | Reality |
|---|---|
| Node.js backend | **Python / FastAPI** (`backend/axe_api/main.py`, ~2900 lines) on a VPS at `api.axecompanion.com` |
| Alpaca | **No Alpaca integration exists.** Broker connectivity is **MetaAPI** (MT5). The only "alpaca" hits are the word inside two unrelated chart components |
| Mobile build target | **Not a React Native build.** A native **Kotlin/Compose Android shell** (61 Kotlin files) that embeds the *same* web bundle over `https://appassets.androidplatform.net` |
| Desktop build | **Tauri** (Rust shell) wrapping the same Vite/React bundle |
| Finnhub | Correct — used for news and the economic calendar (`finnhub_news`, `finnhub_calendar`), currently **403 on the calendar** (plan does not include that endpoint) |

**Consequence for Phase 4:** desktop and mobile are already the same product by
construction — `build-web.sh` builds this worktree and copies `dist/public` into
the APK's assets. There is no separate mobile data model to diverge, because
there is no separate mobile app. The mobile "gaps" are native-shell features
(share-sheet, camera), not feature parity.

---

## 2. Shape of the codebase

```
src/domain          48 files   types, registries, pure logic
src/application     41 files   agents, autopilot, tools, orchestration
src/infrastructure  95 files   gateways (MetaAPI, LLM, AXE API), persistence
src/presentation   273 files   35 pages + components
backend/axe_api      8 .py     FastAPI, task worker, agent loop, crew runner
backend/axe_trading  3 files   vectorbt, NautilusTrader, TradingAgents engines
AxeCore (separate)  61 .kt     Android shell — own git repo, NO remote
```

An eslint rule enforces the layering (`no-restricted-imports`):
`infrastructure/` may only depend on `domain/` and `shared/`; `application/`
must not import `presentation/`.

**Note:** the Android app lives in a **separate repository** at
`~/Downloads/AxeCore` with **no git remote**. It is backed up only on this Mac.

---

## 3. Phase-by-phase: what already exists

### Phase 1 — ThinkTank: ~85% BUILT

`ThinkThanksPage.tsx` + `thinkThanksService.ts` (**2263 lines**) already implement
almost the entire brief:

| Brief requirement | Status |
|---|---|
| Ingest files / photos / PDFs / links / text | `addFilesToThinkThanks`, `addTextOrLinkToThinkThanks` |
| Extraction + analysis | `analyseThinkThanksItem` (vision path for images, URL enrichment, OCR prompt) |
| Fit scoring with % | `fits: [{ app, percent, reason }]` |
| Action Plan (structured) | `actionPlan: [{ phase, detail }]` + `whatItIs`, `howToUse`, `whyUseful`, `howToMake`, `placementUi/Backend/Memory` |
| Build executor | `buildThinkThanksItem` |
| Library | `listBuiltLibrary` |
| Separate integration plan | `buildIntegrateActionPlan` |
| Integrate executor | `integrateThinkThanksItem` |
| Extras beyond brief | merge suggestions, app-growth stats, scheduled re-analysis, `repairFailedIntegrations` |

**Three real gaps:**

1. **Fit is scored across the four sibling APPS, not across AXE CORE's internal
   modules.** The prompt hard-codes
   `"app": "axe-core"|"axe-companion"|"axon-memory"|"trading-os"`. The brief wants
   a score per *module inside* AXE CORE. This needs a module manifest
   (the 35 pages, described) and a second scoring axis — not a rewrite.
2. **No module colour registry exists.** `grep APP_COLORS|MODULE_COLORS` returns
   nothing. The pattern to copy is `domain/tradingIntel/strategyColors.ts`,
   which already does exactly this for strategies and frameworks and documents
   why a second copy is forbidden.
3. **Integration plan is cached, not regenerated.** `integrateThinkThanksItem`
   uses `item.integrateActionPlan` if present. The brief wants it generated
   fresh at Library time so it reflects the *current* app state.

### Phase 2 — AXE Algo: BUILT, BUT NOT TRADING

Exists: `TradingIntel.tsx` with 8 tabs (Chart, Research, Brain, Scorecard,
Strategies & Backtest, Frameworks, Accounts, Demo book), an autopilot
(`agentAutopilot.ts`), a decision engine (`tradingAgentEngine.ts`), a
per-(pair × strategy × timeframe) ledger, a live-trade reconciler, and a
circuit breaker.

**Taxonomy already matches the brief exactly** — `StrategyDot.tsx` renders
strategy **dots** and framework **triangles**, and `strategyColors.ts` is the
single registry, already shared with the Android widget via
`ui/FrameworkColors.kt` (one deliberate hand copy, documented).

CrewAI exists (`crew_runner.py`, `CrewAI.tsx`). Framework engines live on the
VPS: vectorbt (`vbt:`), NautilusTrader (`nt:`), TradingAgents (`ta:`).

**Blocking:** the acceptance criterion *"AXE Algo can open and close trades
autonomously"* is currently **FALSE**. Every cycle returns
`The quota has been exceeded` per symbol per account. Five separate unmetered
MetaAPI paths were found and fixed today (pacing, per-subscription bucket,
provisioning probe, candles module); the error persists and its origin is now
instrumented but not yet captured. **Phase 2 cannot be signed off until a trade
is actually placed.**

Also missing vs brief: trades are not yet linked back to a
`crew_recommendation_id`.

### Phase 3 — Obsidian graph: PARTIALLY BUILT

`tradingObsidianMemory.ts` writes **aggregate** notes:
`Trading/<pair>-scorecard.md` and `Trading/Strategy-index.md`, regenerated after
every self-test.

**Missing for the graph the brief describes:**
- per-trade notes with YAML frontmatter (`pair`, `strategies`, `frameworks`,
  `timeframe`, `side`, `result`, `pnl`, timestamps)
- win/loss hub notes per pair+strategy to create the funnel terminals
- Extended Graph plugin config mapping strategy tags → dot nodes and framework
  tags → triangle nodes, reusing `strategyColors.ts`

The colour/shape registry it must reuse **already exists and is correct**.

### Phase 4 — Mobile: STRUCTURALLY DONE

The Android shell embeds the same bundle, so feature parity is automatic and the
data model cannot diverge. Native pieces already built: biometric + gesture lock,
particle field, on-device Gemma 3 1B fallback, offline task queue with
idempotency keys, approvals from the notification shade, home-screen and
lock-screen algo widgets showing strategy · timeframe in framework colour.

**Gaps:** share-sheet intake and camera capture into the ThinkTank ingestion
pipeline; a mobile-native funnel view (or opening the synced vault in Obsidian
mobile).

---

## 4. Data model (relevant tables)

| Table | user_id type | Notes |
|---|---|---|
| `global_memory` | **text** | ledger (`tl:<pair>:<strategy>:<tf>`), configs (`cfg:*`), app memory |
| `messages` | **uuid** | chat history |
| `user_settings` | **uuid** | autopilot state, decision traces |
| `core_tasks` | uuid | durable task kernel |
| `core_system_logs` | uuid | app logs — RLS fixed today |

**Trap:** two user ids exist. `AXE_USER_ID` (suffixed `-axe-core`) is valid only
for `global_memory`'s text column; `AXE_USER_UUID` for the uuid columns. Using
the wrong one yields `invalid input syntax for type uuid` → a bare 500.

There is **no `trades` table** as the brief describes. Trades live as MetaAPI
positions plus a derived ledger. Phase 2's data-model requirement (including
`crew_recommendation_id`) would be new work.

---

## 5. Infrastructure

- **212.227.91.79** — `api.axecompanion.com`, the only live `axe-core-api`.
  12 uvicorn workers. Engines at `/opt/axe-trading`, `/opt/axe-nautilus`,
  `/opt/axe-tradingagents`.
- **89.167.78.6** — `ollama.axecompanion.com`, the Ollama box. Its stale July
  copy of `axe-core-api` was stopped and disabled today.
- **34.90.56.83** — `gcp-trading`, does not answer on port 22.

`scripts/vps_sync.py` is the deploy guard: it maps each remote file to exactly
one repo path and refuses to deploy over box-side edits. Use it; do **not** use
`infra/axe-core-api/deploy.sh`, which ships a stale directory.

---

## 6. Proposed structure for new work

```
src/domain/thinktank/moduleRegistry.ts     # the 35 modules + fixed colours (NEW)
src/domain/thinktank/moduleManifest.ts     # descriptions fed to the scorer (NEW)
src/infrastructure/persistence/
  tradeNotesService.ts                     # per-trade Obsidian notes (NEW)
obsidian/extended-graph.json               # shape/colour config (NEW)
```

Reuse, do not duplicate: `strategyColors.ts` (strategy dots, framework
triangles), `timeframes.ts` (one timeframe vocabulary), `metaApiBudget.ts`
(every MetaAPI call must pass through it).

---

## 7. Known-open defects (pre-existing, not introduced by this work)

- 29 TypeScript errors (`npm run typecheck`), concentrated in `Organization.tsx`
  and `ArchitectureCanvas.tsx` — a tree node type whose `children` is optional
- No CI: 50 tests exist and nothing runs them on push
- Gemini 403 × ~71/day; TwelveData 404/429 gaps in framework backtests
- Research tab column overlap on phone
- `messages` table has had no successful write since 2026-07-11 (fixed today,
  unverified in production)
