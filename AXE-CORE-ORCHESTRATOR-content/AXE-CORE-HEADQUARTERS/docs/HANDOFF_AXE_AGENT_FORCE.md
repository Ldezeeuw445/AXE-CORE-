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

## Uncommitted work in the tree (unfinished — finish or discard, don't commit as is)

`installStableChat.ts` imports `getProviderKeySlot` + `PROVIDERS`, and `voiceStore.ts` exports
`getProviderKeySlot`. It is the start of a `collectAllSlots` fix: the slot resolver still has to use
them. Without that loop it's dead code.

## Next steps, in order

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
