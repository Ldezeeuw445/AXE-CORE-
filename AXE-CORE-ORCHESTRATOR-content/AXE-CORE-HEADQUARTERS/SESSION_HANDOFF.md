# Handoff — cloud session ↔ local session, combined state (2026-07-28)

Both sessions worked in parallel and are now merged together on `orchestrator`. This replaces the previous handoff note.

## What's live now (either side, all merged)

- **Obsidian bridge, reflection loop, memory decay** (local session): `core_obsidian_notes`, `reflectionService.ts` (writes to both Obsidian + `global_memory`), `memoryDecayService.ts`, `ObsidianNeuralGraph.tsx`, full `/obsidian` page. Added a bottom-nav entry for it (was ⌘K-only) and removed a duplicate reflection-write path.
- **Tauri CI** (local session): `.github/workflows/tauri-build.yml` — every push to `orchestrator` now builds macOS automatically (signs + notarizes if Apple secrets are set, unsigned build otherwise). This does NOT auto-update a running app — it produces a fresh downloadable build per push instead of needing `npm run tauri:build` by hand.
- **Capability/trust ladder + reflection hook** (cloud session): `core_trust_levels`, Settings → 🛡️ TRUST & AUTONOMIE, `requestActionApproval` checks it before creating an approval card.
- **UI/UX HUD pass** (cloud session): Architecture/Memory/Maps3D/Sidebar/RightPanel/Home-sphere-floor all on one matte-black dot-grid visual language.
- **Code Editor**: live preview panel, inline Monaco diff review (real side-by-side diff, not a text snippet), a visible plan before Agent Mode touches any file, activity trace.
- **Browser Agent**: real Playwright navigate/click/type/read/screenshot (backend `browser_agent.py`) — needs `playwright install chromium` on the VPS to actually work (still pending).
- **App-wide toast/error system**: `sonner` was installed but unused — now wired, all `alert()` calls in Code Editor replaced, global JS errors now surface instead of only logging to console.
- **`VISION.md`**: the north-star doc (visual language, Obsidian graph, beating Cursor/Replit/Comet, system cohesion). Its "realistic next session" top-5 is now 3/5 done (inline diff, toast system, visible plan) — items 3 (Obsidian graph) turned out already done by the local session, item 5 (screenshot feedback loop for the Code Agent) is the one still open, and now cheaper since Playwright is already in the codebase.

## VPS steps still pending (unchanged, none done from either side)
1. `git pull` on the VPS.
2. `pip install -r requirements.txt` + `playwright install chromium` (Browser Agent needs this — gives an honest 503 until then).
3. Apply the updated `nginx_api.conf` (`/preview/` route) + reload nginx; set `PREVIEW_PUBLIC_URL`.
4. `CRON_SECRET` in `.env` + redeploy axe_api.
5. New Gemini key, Groq key check, OpenRouter check, Ollama status.

## Still open (both sides agree)
- 3-clap wake via an always-on Tauri system-tray listener (the `useClapDetector` hook exists, opt-in, but only listens while the app/tab is already open — not from a fully closed app).
- Chat-driven browser-agent tool markers in the main AXE chat (Browser Agent currently only reachable from the Browser page's own panel).
- A real in-app Tauri auto-updater (`tauri-plugin-updater`) — CI now builds automatically, but the running app still doesn't fetch/install new builds itself.
- VISION.md item 5: screenshot feedback loop for the Code Agent (needs Playwright on VPS — same blocker as Browser Agent).

## To rebuild the Tauri app with all of this
```
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
git pull origin orchestrator
npm install
npm run tauri:build
```
Or just grab the latest artifact from the `tauri-build.yml` GitHub Action run on `orchestrator` — no local build needed anymore.
