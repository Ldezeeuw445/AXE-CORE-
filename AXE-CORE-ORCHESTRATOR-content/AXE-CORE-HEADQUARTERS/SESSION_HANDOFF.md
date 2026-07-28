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

**Still honestly limited**: this one only runs while the Tauri app is open — a day the app is never opened just skips silently. Making it fully server-side needs an AI provider call from inside Postgres, which needs a key available to a `pg_cron`/`pg_net` job (Supabase Vault) or a small VPS-side scheduler script. **Explicitly deferred by Luka to a future session with VPS access** (chose "via the VPS, later" over building the Vault-based approach now) — no action needed here unless that changes.

## Memory decay — now genuinely server-side, always-on (new this session)
The weekly memory-decay pass no longer depends on the app being open at all. `supabase/migrations/20260728_memory_decay_pg_cron.sql` adds `public.run_memory_decay_pass()` (a `security definer` SQL function mirroring `memoryDecayService.ts`'s JS logic exactly: 30-day half-life confidence decay, prune below 0.12 confidence for entries ≥14 days untouched excluding `user_preference`, writes a report note to `core_obsidian_notes`) and schedules it via `pg_cron` (`axe-memory-decay-weekly`, Sunday 03:00 UTC) — both `pg_cron` (1.6.4) and `pg_net` (0.20.0) were already enabled on this Supabase project, so this needed zero new infra. Verified live: manual `select public.run_memory_decay_pass();` returned a real report and wrote a real note to Obsidian; `select * from cron.job where jobname='axe-memory-decay-weekly';` confirms the job is registered and active.

The old client-side `maybeWeeklyDecay()` in `axeBootstrap.ts` (which only ran while the app happened to be open, and would now double-decay confidence scores if it overlapped with the pg_cron run) has been removed. `memoryDecayService.ts` itself is untouched — still used by the manual "run decay now" button in the Obsidian panel.

## Trust ladder + reflection loop + Obsidian graph
Already live from earlier this session, nothing further needed, unaffected by Vercel's status.

## VPS steps still pending (unchanged — not required for voice/self-review)
1. `git pull` on the VPS.
2. `pip install -r requirements.txt` + `playwright install chromium` (Browser Agent needs this).
3. Apply the updated `nginx_api.conf` (`/preview/` route) + reload nginx; set `PREVIEW_PUBLIC_URL`.
4. `CRON_SECRET` in `.env` + redeploy axe_api.
5. New Gemini key, Groq key check, OpenRouter check, Ollama status.

## Still open
- 3-clap wake via an always-on Tauri system-tray listener.
- Chat-driven browser-agent tool markers in the main AXE chat (currently only on the Browser page).
- A real in-app Tauri auto-updater (`tauri-plugin-updater`) — CI builds automatically on push, but the running app doesn't fetch/install new builds itself yet.
- VISION.md item 5: screenshot feedback loop for the Code Agent (needs Playwright on VPS — same blocker as Browser Agent).
- Worth checking generally: any OTHER `/api/*` call sites that assume a reachable Vercel proxy without the `apiUrl()` Tauri-rewrite or a direct-call fallback — `elevenLabsService.ts`/`fishAudioService.ts` were just fixed, but this class of bug (works on Vercel/dev, silently 404s in a packaged Tauri build) could exist elsewhere too.
