# AXE CORE — God Mode Architecture

This document maps the hand-drawn architecture diagram to the code in this repo,
and explains the two fixes that were just made: **Supabase chat persistence**
(the "refresh loses everything" bug) and the **LangGraph orchestrator** becoming
the single brain that routes between the two branches from the diagram.

---

## 1. The diagram, decoded

```
USER
  │
  ▼
AXE CORE                         (frontend chat → src/store/voiceStore.ts)
  │
  ▼
LangGraph Orchestrator          (src/services/langGraphOrchestrator.ts)
  │
  ├───────────────────┬──────────────────────────────────┐
  ▼                   ▼                                  ▼
BRANCH A             BRANCH B
VPS Ollama +         VPS Kilo Code → cloud LLM keys
local tools          (Anthropic / OpenAI / Gemini /
(OpenHands,          OpenRouter / Groq)
 OpenJarvis,
 OpenClaw,
 Open Interpreter,
 n8n, Hermes Agent)
  │                   │
  ▼                   ▼
SPECIALISTS          (cloud models answer directly)
WAGS · DOLLAR BILL · FORGE · NOVA · INTEL · PULSE · SENTINEL · ATLAS
  │
  ▼
AXE CORE ANSWER & APPROVAL → USER
```

**Key principle from your note:** both branches return *through the LangGraph
Orchestrator* — it is the only decider. Specialists / Kilo Code never talk to
the user directly.

---

## 2. Where each box lives in the code

| Diagram node | Code |
|---|---|
| **USER / chat UI** | `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/` (React + Vite, deployed to `axe-core-rust.vercel.app`) |
| **AXE CORE** (identity + intake) | `src/store/voiceStore.ts` — `AXE_SYSTEM_PROMPT`, `sendMessage()`, intent routing |
| **LangGraph Orchestrator** (single brain) | `src/services/langGraphOrchestrator.ts` — `orchestrate()`, `classifyBranch()`, `orderSlotsForBranch()` |
| **BRANCH A — VPS Ollama + local tools** | Ollama on `89.167.78.6:11434`; agents run as the CrewAI crew (see §4) |
| **BRANCH B — Kilo Code → cloud keys** | Provider keys in `axe_llm_connections` (Settings → Provider Keys); cloud providers Anthropic/OpenAI/Gemini/OpenRouter/Groq |
| **SPECIALISTS (9 agents)** | `axe_core___god_mode_ai_system_v1_crewai-project/` — CrewAI `crew.py` + `agents.yaml` (now on Ollama) |
| **Supabase brain** | `supabase/migrations/*.sql` — `core_*` tables + new `messages` table |
| **VPS privileged API** | `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/main.py` (service_role → bypasses RLS) |
| **n8n / GitHub / Qdrant** | reached via `axe_api` and the CrewAI tools |

---

## 3. Fix #1 — Chat now survives a refresh (was: lost on refresh)

**Root cause:** `conversation` in `voiceStore.ts` was an **in-memory Zustand
array only**. Nothing was ever written to Supabase, and the `messages` table
didn't even exist (anon writes would also have been blocked by RLS).

**What changed:**
1. `supabase/migrations/20260709_axe_core_messages.sql` — creates the
   `messages` table (`id, session_id, role, content, provider, model,
   created_at`) with an `anon_all_messages` RLS policy.
2. `src/services/chatPersistence.ts` — `loadMessages()` / `saveMessage()`.
   Primary path writes through the **VPS `axe_api` (service_role)**, which
   bypasses RLS; falls back to the anon Supabase client if the api key is
   absent.
3. `src/store/voiceStore.ts` —
   - a stable `sessionId` (localStorage) so history reloads per browser,
   - `loadConversation()` loads history on mount,
   - a `useVoiceStore.subscribe(...)` persists **every** new message the moment
     it is added (fire-and-forget, never breaks the UI).
4. `src/App.tsx` — calls `loadConversation()` once on mount.

Result: AXE's answers, code edits, and deployments are now stored in Supabase
and reload after a refresh.

---

## 4. Fix #2 — LangGraph is the single orchestrator (matches the diagram)

`src/services/langGraphOrchestrator.ts` was just a provider-retry loop. It now:

- exposes `classifyBranch(query, slots)` → `'local' | 'cloud' | 'auto'`
  - **local** (Branch A): privacy / code / infra / VPS keywords → Ollama first
  - **cloud** (Branch B): analysis / research / strategy → cloud keys first
- `orderSlotsForBranch()` re-orders the provider slots so the chosen branch is
  tried first,
- `orchestrate()` accepts `{ branch, query }` and is the **only** place the
  decision is made.

`voiceStore.sendMessage()` now calls `classifyBranch(text, orderedSlots)` and
passes the branch into `orchestrate(...)`. All results still flow back through
the orchestrator to `AXE CORE ANSWER & APPROVAL` (the `conversation` state).

### CrewAI specialists (the 9 agents)
`axe_core___god_mode_ai_system_v1_crewai-project/src/axe_core___god_mode_ai_system/crew.py`
now uses your Ollama models instead of `gpt-4o-mini`:

| Agent | Model | | Agent | Model |
|---|---|---|---|---|
| AXE CORE | `ollama/llama3` | | Pulse | `ollama/llama3` |
| Wags | `ollama/deepseek-coder:6.7b` | | Atlas | `ollama/llama3` (+ `nomic-embed-text` embeddings / Qdrant) |
| Dollar Bill | `ollama/mistral` | | Nova | `ollama/llama3` |
| Intel | `ollama/llama3` | | Forge | `ollama/deepseek-coder:6.7b` |
| Sentinel | `ollama/mistral` | | crew `chat_llm` | `ollama/llama3` |

This crew is **Branch A's specialist layer** (runs on the VPS against Ollama).

---

## 5. Your suggested improvement (return-through-orchestrator-only)

Implemented: both branches resolve inside `orchestrate()` and only the final
`response` is returned to `voiceStore`. The orchestrator is the sole decider;
specialists / Kilo Code never answer the user directly.

---

## 6. Deployment / next steps (not yet done — needs your go-ahead)

1. **Run the migration** in Supabase Studio → SQL Editor:
   `supabase/migrations/20260709_axe_core_messages.sql`.
2. **Deploy frontend** to Vercel (`AXE-CORE-HEADQUARTERS/`): `npm run build`
   (already type-checks clean).
3. **Wire the CrewAI crew into the VPS** so Branch A can actually invoke the 9
   specialists: copy `axe_core___god_mode_ai_system_v1_crewai-project/` onto
   `89.167.78.6` next to `axe_api`, `pip install` deps, and add an
   `axe_api` endpoint `/crew/run` that kicks off the crew (Ollama must be
   running with `llama3`, `deepseek-coder:6.7b`, `mistral`, `nomic-embed-text`).
4. **Verify**: open the app, send a message, refresh → history should reload
   from Supabase.

> I have **not** touched the live VPS or pushed to GitHub. Say the word and I'll
> (a) add the `/crew/run` endpoint to `axe_api`, (b) SSH in and deploy, or
> (c) commit + open a PR.
