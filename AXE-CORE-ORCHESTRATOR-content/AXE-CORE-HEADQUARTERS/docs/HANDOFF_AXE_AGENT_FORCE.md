# Handoff — AXE Core "one agent force" (17 Sep 2026)

For the next session (Claude, Cursor or Codex). Read this first, then memory
`axe-core-agents-architecture` and `axe-leerlus-architectuur`.

**Out of scope:** NorthSea P2 (Cursor, branch `origin/feat/northsea-crewai-p2`, reviewed separately).
Never touch the NorthSea P0/P1 baseline (`docs/NORTHSEA_P0_P1_BASELINE.md`).

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
0. Rewrite `roster.ts`/`catalog.ts` to the tiers above (Code→AXE Developer, add ThinkTank, drop CrewAI
   Manager, add Tier 3 Intel/Companion; mark Trading OS/Ollama/EVE non-agents).

### 1. Settings: the "7 lines" panel (Luka's last explicit request)
Luka still sees the old picker in Settings and above the composer. Wanted:
- At the very top of Settings, **7 rows**. Row 1 **AXE Core**, with a dropdown of *only* fast/smart
  chat models (Gemini, Grok, OpenRouter models; no subscriptions, no Ollama). The model set there is
  **the one and only AXE**.
- Rows 2–7 are the **six agents** (`roster.ts`: trading, northsea, code, finance, wingman + axe row
  above). Each has a dropdown where a **subscription** (one of the 6 CLIs) or a model can be chosen.
- The composer picker must show and write the same setting (one source of truth). No second store.
- Check first: which live path reads the choice (`installStableChat` wraps `voiceStore.sendMessage`;
  the obvious path is not always the live one).
- Verify: in the app, type "axe" → the routing line shows the model chosen in row 1.

### 2. Stage 2b — episodes for delayed-outcome agents
- Wire `openEpisode`/`closeEpisode`/`applyAgentReinforcement` (`agent_learning_episodes`) for NorthSea
  deals (read-only on outcome, no deal mutation), Code deploys, and crew runs (`runCrewWithTools`,
  one episode per specialist).
- Extend `LOOP_AGENTS` (`domain/memory/agentLoop`) to cover every namespace in `catalog.ts`.
- The Agents tab loop health shows **turns and episodes** per agent, so "not wired yet" is truthful.
- Keep `learningLoopWiring.test.ts` green; add a case per new entry point.

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
