# AXE INTELLIGENCE TERMINAL — plan.md

## 1) Objectives
- Prove the **core workflow** works end-to-end with real sources: **Sweep (8 adapters) → Normalize → Store snapshot → Correlate with Claude Sonnet 4.5 → Serve unified intel to UI**.
- Deliver a **Bloomberg-grade terminal UI** (black glass morphism + cyan headers + Inter) with a **realistic 2D map + 3D globe toggle**, cross-source signals, and a **draggable AXE chat pill**.
- Ensure reliability: **caching, health/stale/error badges, graceful degradation**, and **no mock data unless a feed fails** (then last-known-cache or clearly badged placeholder).

## 2) Implementation Steps

### Phase 1 — Core POC (Isolation: prove integrations + correlation)
**Goal:** Validate external dependencies + normalization + correlation before building the full UI.

1. **Web research (quick playbook)**
   - Confirm free/no-auth endpoints + rate limits for: GDELT, OpenSky, AISStream (or fallback), FIRMS, Celestrak, FRED, CoinGecko, EPA RadNet.
   - Decide per-adapter fallback strategy (cache-first vs placeholder).

2. **Define unified models (MVP)**
   - `UnifiedEvent`: id, ts, source, layer, title, summary, geo (lat/lon + bbox optional), severity, tags, entities, links, raw_ref.
   - `SourceHealth`: status (ok/stale/error), last_ok_ts, latency_ms, error_msg, items.
   - `SweepSnapshot`: sweep_id, started_ts, duration, sources[], events[] (optionally capped per adapter).

3. **Implement 8 adapter mini-clients (Python POC script)**
   - One file: `poc_sweep.py` (async) calling each adapter with tight timeouts.
   - Normalize each result into `UnifiedEvent` list.
   - Persist “last known good” snapshot to local JSON (POC), including per-source health.

4. **POC: Claude Sonnet 4.5 correlation**
   - `poc_correlate.py`: take latest snapshot → prompt Claude Sonnet 4.5 via `EMERGENT_LLM_KEY`.
   - Output: `CrossSourceSignal[]` (title, narrative, sources_involved, confidence, geo_focus, suggested_operator_actions).
   - Validate stable JSON response (schema + retries).

5. **POC exit gate (must pass before Phase 2)**
   - Each adapter returns data OR cleanly returns `{status:error}` within timeout.
   - Snapshot writes successfully; correlation returns valid structured JSON.
   - Document: per-adapter limits + fallback rules.

**Phase 1 user stories**
1. As an operator, I want a single script to sweep all sources so I can confirm real data flows end-to-end.
2. As an operator, I want all adapter outputs normalized so the terminal can render them consistently.
3. As an operator, I want the system to mark a source stale/error without breaking the sweep.
4. As an operator, I want AXE to generate cross-source signals from the snapshot so I can see correlation quality early.
5. As an operator, I want outputs saved as snapshots so I can replay/debug without re-hitting APIs.

---

### Phase 2 — V1 App Development (build UI+API around proven core; NO auth yet)
**Goal:** Terminal works with real sweeps + correlation, without auth to keep testing unblocked.

1. **Backend (FastAPI + Motor + Mongo)**
   - Adapter modules: `adapters/{news,gdelt,air,vessel,space,macro,heatmap,intel}.py`.
   - Services: `sweep_service.py` (fan-out async gather, timeout, health, caching), `cache_repo.py` (Mongo).
   - Endpoints:
     - `POST /api/sources/sweep` → runs sweep, stores snapshot, returns health + summary.
     - `GET /api/adapters/{name}` → returns latest cached for that adapter.
     - `POST /api/ai/correlate` → correlates latest snapshot (or provided sweep_id).
     - `GET /api/snapshots/latest` (+ optional history pagination).
   - Reliability: per-source timeouts, exponential backoff (LLM), cache-first on failures.

2. **Frontend (React + Tailwind + shadcn/ui)**
   - Global style: Inter, black/black glass panels, cyan headers, dense spacing.
   - Layout (CRUCIX-grade):
     - Top bar: title, sweep timer, sources ok/total, alert badge.
     - Left sidebar: sensor grid + risk gauges + nuclear/space watch blocks.
     - Center: **2D map (Leaflet/MapLibre tiles)** with arcs/markers + region tabs.
     - Toggle to **3D globe** (react-globe.gl) using same events.
     - Bottom: live news ticker + macro/markets + leverageable ideas.
     - Right sidebar: cross-source signals + OSINT stream + signal core metrics.
   - **AXE Chat widget**: draggable, minimizable to pill, triangle gradient identity; talks to `/api/ai/correlate` + “ask about current intel”.
   - **Agent Spinners library (55)**: build as a component pack; use per-panel contextual loaders (sweep, adapter refresh, correlate).
   - No emojis: lucide-react + custom SVG.

3. **Data flow + state handling**
   - Poll sweep cadence (e.g., 30s) with manual “SWEEP NOW”.
   - Always render UI from: `latest snapshot` + per-source health.
   - Badges: OK / STALE (cache) / ERROR (with tooltip).
   - “Mock only on failure”: placeholder card must show `MOCK/GENERATED` label.

4. **Testing (end-to-end)**
   - Run testing_agent_v3: login skipped; verify sweep, map render, correlation, chat, loaders, stale badges.
   - Fix until: no hard crashes, no blank panels, graceful degradation works.

**Phase 2 user stories**
1. As an operator, I want a single-screen terminal view so I can monitor all layers without navigation.
2. As an operator, I want to run and observe sweeps with source health so I can trust what’s live vs stale.
3. As an operator, I want to toggle 2D map/3D globe so I can analyze geography in the best mode.
4. As an operator, I want to click an event marker and see normalized details + source link.
5. As an operator, I want AXE chat to correlate what’s on-screen so I can ask “why is this happening?” instantly.

---

### Phase 3 — Authentication + Operator Hardening
**Goal:** Add the requested **email+password gate** and lock down the terminal for a single operator.

1. **Backend auth**
   - Simple user table/collection; bcrypt password hashing.
   - JWT access tokens; protected routes for sweep/snapshots/correlate.
   - Seed one operator account via env vars or setup route (one-time).

2. **Frontend auth UX**
   - Premium login screen (black glass, cyan accents, triangle identity).
   - Token storage (httpOnly cookie preferred; otherwise secure memory + refresh strategy).
   - Auto-logout + “session expired” banner.

3. **Operational refinements**
   - Per-adapter rate limiting, server-side caching TTLs.
   - Snapshot retention policy.
   - Observability panel: last sweep duration, error counts.

4. **Testing (end-to-end)**
   - testing_agent_v3: login → sweep → correlate → chat → map toggles.

**Phase 3 user stories**
1. As an operator, I want to log in so the terminal is not publicly accessible.
2. As an operator, I want my session to persist securely so I don’t re-login during operations.
3. As an operator, I want protected endpoints so no one can trigger sweeps externally.
4. As an operator, I want clear auth error states so I can recover quickly.
5. As an operator, I want the terminal to remain usable even when one or more feeds fail.

---

### Phase 4 — Intelligence Quality Upgrades (post-v1)
- Better entity extraction (places/orgs/assets), deduping, clustering by geo+time.
- Signal templates (wildfire→shipping→oil; air activity→FX→polymarket; thermal→commodities).
- “What signals mean” explainer panel + operator playbooks.

**Phase 4 user stories**
1. As an operator, I want events clustered so I can see incidents instead of noise.
2. As an operator, I want confidence scoring so I can prioritize attention.
3. As an operator, I want “signal meaning” explanations so I can brief others faster.
4. As an operator, I want saved watchlists (regions/entities) so I can focus monitoring.
5. As an operator, I want replayable sweeps so I can review how a situation evolved.

## 3) Next Actions
1. Create and run Phase 1 POC scripts: `poc_sweep.py` + `poc_correlate.py` (real endpoints, strict timeouts).
2. Lock unified schemas + JSON correlation contract with Claude (retry + validation).
3. Once POC passes, generate the minimal FastAPI backend skeleton + React terminal shell in as few bulk writes as possible.

## 4) Success Criteria
- POC: 8 adapters sweep successfully (or fail gracefully), snapshot saved, Claude correlation returns valid JSON.
- V1: Terminal loads with real data; sweeps run; map renders markers/arcs; 2D/3D toggle works; chat correlates current snapshot.
- Reliability: no panel goes blank; every failure has a visible badge; cache used before placeholders; placeholders clearly labeled.
- UX: premium black-glass + cyan headers, Inter typography, lucide icons, and spinner library used consistently.