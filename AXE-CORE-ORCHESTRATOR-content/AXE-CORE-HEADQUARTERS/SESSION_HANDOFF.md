# Handoff — combined state (2026-07-28, corrected for: Vercel paused, testing via packaged Tauri)

## Important correction from earlier in this session
My first answer said "set FISH_AUDIO_API_KEY in Vercel + redeploy" — wrong for the actual situation: **the app is running locally via Tauri and Vercel is paused.** A packaged Tauri app has no server behind the static bundle at all, so it can never reach a Vercel proxy anyway — independent of whether Vercel is paused. This was also already true for ElevenLabs before today, just never surfaced. Fixed properly now (see below), not routed around Vercel being paused specifically.

## Voice — how to actually get it working in the packaged Tauri app right now
Both ElevenLabs and Fish Audio now support a **direct call** path that bypasses Vercel entirely, used automatically in a packaged Tauri build when a `VITE_`-prefixed key is baked in at build time:

1. In `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/.env` (not `.env.example` — that file isn't tracked by git, it's gitignored by a broad `.env.*` pattern), set:
   ```
   VITE_FISH_AUDIO_API_KEY=your_fish_audio_key
   ```
   (or `VITE_ELEVENLABS_API_KEY=...` if you'd rather use a paid ElevenLabs account instead)
2. Rebuild: `npm run tauri:build` — this bakes the key into that specific build. (The GitHub Actions CI build won't have this unless the same secret is set as a repo/Actions secret and the workflow is updated to pass it through — for now, a local build is the fastest path to test this.)
3. In the running app: Settings → 🐟 Voice Provider → paste the Fish Audio voice id (from fish.audio) → select "Fish Audio".

**Trade-off, stated plainly**: this bakes the API key into the distributable app bundle — extractable by anyone with the `.app`/`.dmg`. Same trust model already accepted for provider keys typed into Settings (this is a single-user desktop app), not a new risk category, but worth knowing.

**Without a `VITE_` key baked in**: voice falls straight to the browser's own built-in voice (already tuned for a confident "Bobby Axelrod" delivery) — no error, no silent failure, just the honest fallback.

## Nightly conversation self-review
No Vercel/VPS dependency at all — pure client-side + Supabase (`core_conversation_reviews`, migration already applied live), runs once per day while the app is open, using whatever AI provider is already configured for chat (also unaffected by Vercel being paused, since provider calls in a packaged Tauri app already go direct or through the VPS depending on provider — this was already working).

## Trust ladder + reflection loop + Obsidian graph
Already live from earlier this session, nothing further needed, unaffected by Vercel's status.

## VPS steps — done as of 2026-07-28 (this section was stale; all 5 are complete)
1. ✅ `git pull` on the VPS — orchestrator @ 8d207e1.
2. ✅ Playwright + Chromium installed in the axe-core-api venv.
3. ✅ `nginx_api.conf`'s `/preview/` route applied + `PREVIEW_PUBLIC_URL` set. **Also found and fixed a real bug**: `/preview/start|stop|status` (FastAPI control endpoints) were being swallowed by the `/preview/` prefix location meant for the dev-server iframe — a chicken-and-egg 502, you could never call `/preview/start` to bring up the thing `/preview/` proxies to. Fixed with exact-match locations that take nginx priority, live on the VPS and in the tracked template.
4. ✅ `CRON_SECRET` in `.env`, axe_api redeployed — `/cron/tick` has been ticking every minute since.
5. Ollama/Groq/OpenRouter: all confirmed working end-to-end. Gemini/OpenAI/Anthropic still fail — that's the user's own keys (rate-limited / not entered yet), not an infra problem.

## Also fixed today, not in the original plan
- **OOM root cause**: `llama3.1:8b` was loading with a 131072-token context (~16GB KV cache alone) — way past this VPS's 7.7GB RAM. Capped to 8192 both in OpenClaw's model config and globally via `OLLAMA_CONTEXT_LENGTH` on the Ollama service, so every caller is protected, not just OpenClaw.
- **OpenHands sandbox leak**: containers were never cleaned up (one was 19h old) and starved Ollama of RAM until the OOM killer took it out repeatedly. Cleaned up + a cron reaper now runs every 30 min (`/opt/axe-core-api/reap_openhands_sandboxes.sh`) so this can't recur.
- **Two-way Obsidian vault sync** shipped: "Sync now" pushes *and* pulls (hand-edited notes in `{vault}/AXE/**.md` round-trip back into `core_obsidian_notes`, newer-wins by mtime).
- SmartThings wired into Settings' Provider Keys grid (was documented but not actually in the UI).

## Still open
- 3-clap wake via an always-on Tauri system-tray listener.
- Chat-driven browser-agent tool markers in the main AXE chat (currently only on the Browser page).
- A real in-app Tauri auto-updater (`tauri-plugin-updater`) — CI builds automatically on push, but the running app doesn't fetch/install new builds itself yet.
- VISION.md item 5: screenshot feedback loop for the Code Agent.
- OpenClaw's own `agent` CLI hangs (>2min, no output) even though Ollama itself now responds in ~13s — a separate, unexplained bug inside OpenClaw 2026.7.1-2's own agent pipeline, not a resource issue. Its real value is probably as a messaging-channel bridge (Telegram/WhatsApp/Discord) rather than another coding agent redundant with OpenHands — not pursued further this session.
- TRADING-OS- repo on the VPS is empty (user says the real project exists elsewhere and will investigate separately).
- Vault → Core direction was already covered by today's two-way sync work above (superseded, no longer open).
