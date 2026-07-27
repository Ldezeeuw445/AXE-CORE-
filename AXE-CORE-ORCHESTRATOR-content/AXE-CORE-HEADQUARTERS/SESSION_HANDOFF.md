# SESSION HANDOFF — Obsidian + reflection + memory decay

Branch: `axe/obsidian-reflection-memory` (open PR against `orchestrator`).

## Shipped in this branch

1. **Obsidian bridge**
   - Migration: `supabase/migrations/20260727_axe_core_obsidian_notes.sql`
   - Service: `src/infrastructure/persistence/obsidianMemoryService.ts`
   - Tools: `[OBSIDIAN_WRITE:]`, `[OBSIDIAN_SEARCH:]` (catalog + registry)

2. **Reflection loop**
   - Service: `src/infrastructure/persistence/reflectionService.ts`
   - Tool: `[REFLECT:]`
   - Writes to both `global_memory` and `core_obsidian_notes` (path under `AXE/Reflections/`)

3. **Memory decay**
   - Service: `src/infrastructure/persistence/memoryDecayService.ts`
   - `runMemoryDecayPass()` — confidence half-life ~30d, prune low-confidence noise
   - Logs each pass into Obsidian under `AXE/System/`

## What you need to do

1. **Run the migration** in Supabase SQL editor (or apply via your usual path):
   `20260727_axe_core_obsidian_notes.sql`
2. **Merge the PR** after Vercel preview looks good.
3. **Optional weekly cron** (Cron Manager → new schedule):
   - action_type: `prompt` or a small webhook that calls a future `/internal/memory/decay` endpoint
   - For now you can trigger decay from a one-off `[EXEC:]` / script, or wire a Settings button that imports `runMemoryDecayPass`.
4. **Mac vault sync (later)**: a launchd/cron on the Mac that reads `core_obsidian_notes` and writes `.md` files into your Obsidian vault folder — one-way Core → vault first, as planned in NEXT_LEVEL_PLAN §4.

## Still open (unchanged)
- 3-clap wake via Tauri system tray always-on
- Chat-driven browser-agent markers in main chat
- Auto-updater for Tauri

## Trust / capability ladder
Already present (`trustLevelsService` + `core_trust_levels`). Reflections now give you a browsable history of approved/denied patterns so promoting a category in Settings is evidence-based.
