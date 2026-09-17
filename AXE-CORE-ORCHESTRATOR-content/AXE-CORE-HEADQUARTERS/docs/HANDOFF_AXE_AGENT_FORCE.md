# Handoff — AXE Core "one agent force" (17 Sep 2026, updated same day — Stage 0/1/2b-part-1 done)

For the next session (Claude, Cursor or Codex). Read this first, then memory
`axe-core-agents-architecture` and `axe-leerlus-architectuur`.

**Out of scope:** NorthSea P2 (Cursor, branch `origin/feat/northsea-crewai-p2`, reviewed separately).
Never touch the NorthSea P0/P1 baseline (`docs/NORTHSEA_P0_P1_BASELINE.md`, i.e.
`backend/northsea_mcp/`, `supabase/northsea/*` and the `mcp.northseacommodity.com` deploy —
NOT `backend/axe_api/northsea.py`, which is this app's own read-only desk API and is fair game).

## Done since this doc was first written (same session, 17 Sep, commits `8e95fe8d`→`24e987e2`)

- **Stage 0** (`8e95fe8d`): `roster.ts`/`catalog.ts` rewritten to the CONFIRMED ARCHITECTURE tiers
  below — AXE + 5 tier-1 managers (wingman/northsea/trading/developer/thinktank) + 5 tier-2 workers
  (browser/memory/task/cron/finance) + 2 tier-3 (intel/companion). Trading OS/Ollama/EVE are explicit
  non-agent catalog entries. `delegateFor('code', …)` now returns `developer`, not `code`.
- **Stage 1** (`dd719db0`): the "7 rows" ask, corrected to what's actually real — AXE's dropdown
  (`domain/chatModelKeuzes.ts`, both the composer `ChatModelKiezer` and Settings' new "AXE Core" row
  in `AgentMotorenSection`) now excludes the abonnement CLIs and Ollama, matching row 1's rule exactly
  (verified live: the dropdown lists only anthropic/openai/google/groq/openrouter/openrouter2/cerebras).
  `agentMotoren.ts`'s 5 subscription rows are now the tier-1 managers (AXE itself no longer has a row —
  it never gets a subscription). `plannerKoppeling.ts` translates the new names back to `planner.py`'s
  existing keys before sending, since that VPS script wasn't touched.
- **Stage 2b, part 1** (`24e987e2`): the handoff below originally pointed at `runCrewWithTools.ts` for
  crew-run episodes — that function has **zero callers**, dead code. The real, only entry point is
  `CrewAI.tsx`'s `runCrew()` (its own comment already says so). Wired: one `agent_learning_episodes`
  episode per selected specialist, opened before `crewRun()`, closed good/poor on the result. Added
  `'wingman'` to `LOOP_AGENTS`. Fixed the stale `agentId: 'crewai_manager'` tag (retired in Stage 0) to
  `'wingman'`.

## Deliberately NOT done in Stage 2b — read before attempting

- **NorthSea deal episodes**: investigated, not wired. There is no client-side decision point to hang
  an episode on — `NorthseaDesk.tsx`/`domain/northsea/*` is a pure read/display layer over
  `backend/axe_api/northsea.py` (a read-only aggregation endpoint), not somewhere an LLM decides
  anything. The actual NorthSea Desk Manager reasoning happens server-side in
  `backend/northsea_mcp/` — which is the protected P0/P1 baseline. Opening an episode purely because a
  poll noticed `stage` flip to `won`/`lost`, with no decision behind it, would be exactly the
  "looks wired, isn't" episode this whole system exists to avoid (see `axe-leerlus-architectuur`
  memory). If this is still wanted, it likely belongs server-side in northsea_mcp as its own
  P2/P3-scoped change — not a frontend change, and not this session.
- **Code deploy episodes**: no deploy ACTION exists client-side to wire an episode around. `'deploy'`
  only appears as a `toolset`/`capabilities` label in `defaultAgents.ts`/`OrganizationCanvas.tsx` —
  there's no function that actually ships a build from this app. Building that action is a separate,
  larger task than "wire the learning loop around it."
- **`LOOP_AGENTS` for every catalog.ts namespace**: only `wingman` was added (12 other tiered agents
  were not). Adding a `LoopAgent` entry with no real `openEpisode`/`closeEpisode` call site behind it
  is the exact failure this codebase has been burned by twice already (see
  `learningLoopWiring.test.ts`'s own commentary) — extend `LOOP_AGENTS` only alongside real wiring,
  one entry per session at most, not as a batch rename.
- **Settings UI not re-verified after Stage 2b** — Stage 0/1 were confirmed live in the browser
  (logged in, screenshots + DOM read taken); Stage 2b part 1 was verified by running a real crew from
  the CrewAI tab (no exception; Supabase unreachable in that sandboxed session so the episode write
  itself wasn't observed succeeding, only failing silently and safely, same as the existing trading
  episode wiring already does when offline).

## Where it stands (all on `orchestrator`, pushed)

| Commit | What |
|---|---|
| `b8546448`, `230077ef` | Voice: one fixed voice (OpenAI cedar), markdown/symbols never read aloud, picker removed |
| `28fec50a` | AXE-in-front 1: the ★ Primary engine answers normal chat |
| `da14e4d8` | AXE-in-front 2: six-agent roster (`src/domain/agents/roster.ts`), visible delegation, War Room |
| `0b77b9d7`, `0e10413b` | Coding CLIs out of chat; one chat model, no Ollama→codex fight |
| `f355eaa4` | /settings crash (React #31) fixed |
| `d56dc855` | Stage 1: canonical `src/domain/agents/catalog.ts` (6 core + 8 crew), memory namespace per agent |
| `29ba82cb` | Memory recall time-boxed (never blocks the reply) |
| `45424857` | Stage 2a: chat turns close their learning loop per agent namespace |
| `aa706290` | Stable-chat path: subscriptions can no longer answer as AXE (fix in `installStableChat.ts`) |

Decisions already taken with Luka:
- **AXE's brain** is a fast chat-API model (Gemini/Grok/OpenRouter), **not** a subscription and not
  the paid OpenAI API.
- The **6 subscriptions** (`claude/claude2/claude3/codex/codex2/cursor`) are coding CLIs and belong
  to the agents.

## Branch governance (from the consolidation directive, 17 Sep)

This work now lives on **`feat/axe-agent-force`** (branched from `orchestrator` @ `bb5f484a`). Do NOT
merge to `orchestrator` yourself — an integration pass reviews the AXE and NorthSea branches together
first. The local app can still be built/run from this branch to test (that is not a merge). NorthSea P2
is Cursor's on `origin/feat/northsea-crewai-p2`; leave it alone.

## DONE — the `collectAllSlots` fix (commit `e4eb7a10`)

`collectAllSlots` (live stable-chat path) read keys only from localStorage, so vault/ENV-keyed
providers (Gemini via `VITE_GEMINI_API_KEY`) were "Connected" but invisible to AXE's chat → AXE was
stuck on dead Ollama + out-of-credits OpenRouter and reported "unavailable". Now it also resolves every
`PROVIDERS` entry via the exported `getProviderKeySlot` (localStorage OR ENV), so `buildStableChatCascade`
prefers Gemini when its key exists. `getProviderKeySlot` is now exported from `voiceStore.ts`.

## CONFIRMED ARCHITECTURE (Luka, this session — this rules everything)

**AXE CORE** = top of the chain, the boss. Talks to Luka, understands intent, then either answers
directly, does it himself, orchestrates via LangGraph, calls the Wingman, or delegates to a manager.
Dropdown = ONLY best-for-AXE models (smart/fast); never a subscription, never Ollama.

**Tier 1 — manager team (dropdown = ONLY subscriptions; the 6 CLIs belong here):**
Wingman (runs the free CrewAI crew from the Crew tab on AXE's behalf; helps anywhere) · NorthSea Desk
Manager (runs NorthSea crews, moves deals, decides-before-Luka when safe) · Trading Agent = AXE Algo
(market analysis, positions, risk, final trade decision; owns the trading research crew) · **AXE
Developer** (the code manager — reads/writes/builds/ships/deploys; *Code folds into this*, may use the
Code Agent for simple/local work; keep its Supabase tables) · ThinkTank (runs the ThinkTank tab:
score/rank ideas → build plan → Build → library → integrate plan → Integrate into the app).

**Tier 2 — Agents-tab workers (auto-route by default; the "race" is fine here; optional pin dropdown):**
Browser · Memory · Task · Cron Manager · Finance.

**Tier 3 — cross-app assistants (dropdown = ONLY paid API keys: OpenAI, Anthropic):**
AXE Intel · AXE Companion (live in the other apps, driven through AXE CORE, used in the Trading tab).

**NOT agents — remove from the Agents tab:** Trading OS (an app), Ollama (a model), EVE (a framework),
CrewAI Manager (redundant — Wingman/NorthSea Manager/AXE Algo run the crews). The CrewAI crews are
resources those managers run.

**THE ONE RULE:** the Settings "Motors per agent" panel is the SINGLE source of truth for which model
each agent uses. The composer picker and the "local models first" toggle must obey it or be removed —
no third/fourth opinion. Tier 1 + AXE run on their pinned engine (no race); Tier 2 auto-routes unless pinned.

**Shared brain (universal):** every agent (all tiers) wired to the semantic learning loop + RAG + its
Supabase namespace, all on ONE global memory layer (`catalog.ts` namespaces; loop built, connect for all).

## DONE — AXE runs smart models via the VPS proxy (commit `eec853a1`)
The smart keys (Gemini etc.) are NOT local and NOT in the vault's secrets.env — they live on the VPS AI
proxy (`/api/proxy/ai/providers` → `keyless`, served with the VPS's own key). The chat only built slots
from LOCAL keys, so it dropped VPS-only providers and fell to Ollama. Now Settings caches the served list
(`axe_server_providers`) and `getProviderKeySlot` builds a keyless slot for VPS-served providers →
callProvider's proxy path fills the key. Open Settings once to populate the cache.

## Next steps, in order (the confirmed build)

~~0. Rewrite roster.ts/catalog.ts~~ — **done, Stage 0 (`8e95fe8d`).**
~~1. Settings "7 lines" panel~~ — **done, Stage 1 (`dd719db0`), on the corrected tier list (AXE row +
5 tier-1 rows, not the stale 6-agent count this section used to say).** Verified live: type a message,
the routing line shows the model actually chosen in Settings' AXE Core row.

### 2. Stage 2b — episodes for delayed-outcome agents (part 1 done, `24e987e2`)
- ~~Crew runs~~ — **done**, wired into `CrewAI.tsx` (not `runCrewWithTools.ts`, which is dead code —
  see "Deliberately NOT done" above for why the handoff's original pointer was wrong).
- **Still open, and why they weren't just done here too** (see "Deliberately NOT done" above for the
  full reasoning — don't re-attempt without reading it first):
  - NorthSea deals — no client-side decision point exists to open an episode against; the real
    decision-maker is server-side in the protected `backend/northsea_mcp/`.
  - Code deploys — no deploy action exists client-side yet to wire an episode around.
  - `LOOP_AGENTS` for the other 12 catalog.ts namespaces — only add one alongside real wiring, never
    as a batch.
- `applyAgentReinforcement` and the Agents-tab loop-health display were NOT touched this round — they
  already worked before Stage 2b and don't need changes for the crew-run wiring to show up correctly.

### 3. Later, in the agreed order
1. **Delegate on intent:** AXE says out loud that it hands over.
2. **Finance/subscription:** a usage line plus budget routing.
3. **Wingman:** runs the crew-tab crews autonomously when AXE decides.
4. **Code routing:** simple → OpenHands/Qwen, heavy → Cursor/Claude.
5. **Agent SDKs.**
6. **Cleanup:** remove the three old agent lists (`AGENT_SEEDS`, `DEFAULT_AGENTS`, `SPECIALISTS`) in favour of `catalog.ts`.

Optional: point the Tauri build at the "AXE Core dev" certificate so macOS stops re-asking for SSD access.

## Working rules
- Build and start the app **only** via `scripts/axe-bijwerken.sh` / clean env (`env -i … open`), never plain `open`.
- `npx tsc --noEmit -p tsconfig.app.json`: the only known pre-existing errors are `PreviewPanel.tsx` and `zweef/ingebed.test.ts`.
- iMac is on its own branch (`feat/northsea-crewai`); never push to `orchestrator` from there without asking.
- No secrets in commits; commits end with the Co-Authored-By line.
