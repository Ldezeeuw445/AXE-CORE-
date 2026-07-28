# Handoff — combined state (2026-07-28, updated after voice + self-review)

## New this round — Fish Audio voice + conversation self-review
Neither needs the VPS. Two separate things:

1. **Fish Audio (now the default voice provider)** — ElevenLabs isn't usable without a paid account, so it's no longer the default (kept as a fallback option, not removed).
   - **Needs**: `FISH_AUDIO_API_KEY` set in the Vercel project's env vars (server-side, NOT `VITE_`-prefixed) + redeploy — mirrors exactly how `ELEVENLABS_API_KEY` already works (`api/tts-fish.ts`, same shape as `api/tts.ts`).
   - **Then, in the running app**: Settings → 🐟 Voice Provider → paste a Fish Audio voice id (pick one on fish.audio, copy its `reference_id`) → select "Fish Audio". Nothing else to configure.
   - If that env var is never set, voice still works fine — it falls straight to the browser's own built-in voice (already tuned for a confident "Bobby Axelrod" delivery), skipping ElevenLabs entirely by default now.

2. **Nightly conversation self-review** — zero setup. Runs automatically once per calendar day, purely client-side + Supabase (`core_conversation_reviews`, migration already applied live), using whatever AI provider is already configured for chat. Same honest limitation as the existing daily greeting/weekly decay: only fires while the app is actually open.

3. **Trust ladder + reflection loop + Obsidian graph** — all already live from earlier this session, nothing further needed.

## To see all of this in the Tauri app
Two options:
- **Easiest**: grab the latest artifact from the `tauri-build.yml` GitHub Action run on `orchestrator` (it already built after every merge above) — no local build needed.
- **Or build locally**:
  ```
  cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
  git pull origin orchestrator
  npm install
  npm run tauri:build
  ```

## VPS steps still pending (unchanged from before — not required for voice/self-review)
1. `git pull` on the VPS.
2. `pip install -r requirements.txt` + `playwright install chromium` (Browser Agent needs this).
3. Apply the updated `nginx_api.conf` (`/preview/` route) + reload nginx; set `PREVIEW_PUBLIC_URL`.
4. `CRON_SECRET` in `.env` + redeploy axe_api.
5. New Gemini key, Groq key check, OpenRouter check, Ollama status.

## Still open
- 3-clap wake via an always-on Tauri system-tray listener.
- Chat-driven browser-agent tool markers in the main AXE chat (currently only on the Browser page).
- A real in-app Tauri auto-updater (`tauri-plugin-updater`) — CI builds automatically now, but the running app doesn't fetch/install new builds itself yet.
- VISION.md item 5: screenshot feedback loop for the Code Agent (needs Playwright on VPS — same blocker as Browser Agent).
