# AXE CORE — Vision
### What "the best personal AI there is" actually requires. Written 2026-07-27, co-founder to co-founder.

This is the north-star document. `NEXT_LEVEL_PLAN.md` is the tactical execution list (what to build, in what order, what needs the VPS); this is the *why* and *what it looks like when it's done* — the thing every tactical decision should be checked against. Nothing here is fabricated capability — every idea below is either already partially built (and this describes what "finished" looks like) or explicitly marked as new work with what it actually requires.

---

## 0. The one-sentence bet

AXE CORE wins not by having more features than Cursor, Replit, or Comet — it wins by being **one continuous presence** across all of them, instead of three separate tools you switch between. The code editor, the browser, the memory graph, the voice — they're not tabs. They're the same brain looking at different things.

---

## 1. The AXE Presence System — one visual language, not a retrofit

This session's own history is the best argument for this section: Architecture got the holographic HUD treatment first, then Memory, then Maps3D, then the app shell — each one a *separate* fix because there was no shared system, only a shared instinct copied page by page. That has to stop being a manual retrofit.

**What "done" looks like:**
- `hudBackground.ts` (already exists: `HUD_BASE_BG`, `HUD_DOT_GRID_STYLE`, `HUD_CHIP_STYLE`) grows into a real small design-system module — every new screen imports it by default, not as an afterthought once someone notices it looks different.
- The core orb becomes a literal reusable component at three scales: the full 3D hero (Home), a small ambient dot (top nav — "AXE is here"), and a tiny inline glyph on anything AXE authored (a memory entry, a PR description, a notification) — so its presence is legible everywhere, not just on one page.
- Motion tokens (`--duration-*`, `--ease-*` already defined in `index.css`, currently under-used) get applied consistently instead of each component picking its own framer-motion timing.
- **Empty / loading / error states as a designed system, not an afterthought.** This is where "flawless, not error" actually lives: not hiding failure, but every page having the same calm, honest "connecting…", "nothing here yet", "this failed, here's exactly why" pattern instead of 20 pages each inventing their own.

---

## 2. Obsidian + Visual Memory — the graph that makes memory real

Right now "visual memory" is a tree list (real, truthful, but not visual in the way Architecture is). The actual unlock:

- `core_obsidian_notes` (planned, not yet built) becomes the backing store for a real **force-directed graph view** inside Memory — reusing the same canvas engine, dot-grid background, and physics-style node layout already built for Architecture. Notes as nodes, wikilinks as edges, tags as color. Click a node, read the note. This is Obsidian's own graph view, rendered natively, not a screenshot of one.
- Every system this session has built that produces a durable trace — reflections, trust-ladder history, daily briefings — writes into this same graph. "Visual memory" isn't a separate feature from "AXE learned something." It's the visible surface of it.
- Two-way sync (Obsidian → Core, via the Local REST API plugin) stays a deliberate *later* — one-way first, prove it's useful, then close the loop.

---

## 3. Code Editor — what actually beats Cursor and Replit

They win today on: instant inline diffs, a visible plan before the agent acts, one-click deploy, and a terminal that feels like part of the editor, not bolted on. AXE Core already has the multi-file agent loop, the activity trace, a live-preview panel (pending the VPS nginx step), GitHub PR automation, and a choice of engines. The gap to actually winning:

- **Inline diff review inside Monaco itself** — ghost-text accept/reject per hunk, not a separate patch block below the chat. This is the single biggest felt difference vs. Cursor.
- **A visible plan before execution**, not just the activity trace after the fact — the agent states its multi-step plan up front so you can redirect *before* it starts touching files, not just react to what it already did.
- **One flow: describe → scaffold → preview → ship.** The individual pieces already exist (GitHub tools, Vercel tools, the Preview panel) — what's missing is chaining them into one guided flow instead of five separate manual steps.
- **Visual feedback for UI work specifically** — screenshot the result after a patch (Playwright, now already installed for the Browser Agent — this got cheaper to add today) and feed it back to a vision-capable model so the agent can *see* whether its own CSS change actually worked, not just assume the diff was correct.

---

## 4. Browser — what actually beats Comet

Comet's pitch is "agentic browsing that acts for you." As of this session, AXE Core has a genuine Playwright-driven agent that can navigate/click/type/read/screenshot — the foundation Comet is built on. To actually surpass it:

- **Persistent, resumable sessions** — right now a Browser Agent session dies when the panel closes. Give it a real lifecycle so "keep watching this page while I do something else" is possible.
- **Voice-driven browsing** — the voice pipeline already exists; "AXE, find flights to Lisbon and fill in these dates" spoken should drive the exact same action loop, not require typing into the agent panel.
- **Ambient page awareness** — instantly answerable questions about whatever's on screen, without a manual "read" step first. The capability exists; it needs to feel like AXE is already looking, not something you have to ask for.
- **Multi-tab agent awareness** — research tasks need multiple sources open at once; the agent should be able to open and manage several tabs itself for one task, not be confined to a single page.

---

## 5. Voice + ambient presence

Already scoped in `NEXT_LEVEL_PLAN.md` (3-claps, auto-greet on launch, ElevenLabs tuning) — the addition here is that the core orb's reactive states (idle/listening/thinking/speaking/awaiting-approval, built this session) should become the **universal signal**, not just a voice-pipeline indicator: "AXE noticed something" and "AXE fixed something itself" (from the self-healing/proactive-watcher work) get the same visual language, so one glance at the orb — anywhere in the app — tells you what AXE is doing, right now, without opening a panel.

---

## 6. The invisible engineering bar

"Flawless, not error" isn't a feature — it's a discipline applied everywhere:

- Every network call this session already follows one rule: real error text, never a fabricated success. The next step is a **global error boundary + toast system** so a failure never silently vanishes into a stuck spinner, consistently, on all 20+ pages — not per-page ad hoc handling.
- `tsc --noEmit` clean has been the bar for every single change shipped this session — turning that into an actual CI check (GitHub Actions on every PR) makes it automatic instead of something I run manually each time.
- The build already warns about >500kb chunks (Code Studio, Maps3D, the LangGraph orchestrator). Code-splitting those means Home loads instantly even though the heavy pages exist.

---

## 7. System cohesion — AXE as one being, not five mechanisms that share tables

Mission control (Home), the trust ladder (Settings), the reflection loop (memory), self-healing (VPS watchers), and cross-app awareness (Companion/Trading OS) currently work *correctly* but *separately* — each was built as its own thing this session, connected only by sharing Supabase tables. The next-level move is making them visibly one nervous system: the same orb-state language from section 5, the same notification pipe, the same memory graph from section 2 — so using any one of them makes the others feel smarter too, instead of five independent features that happen to coexist.

---

## 8. Multi-window, multi-surface

Already scoped (`NEXT_LEVEL_PLAN.md` section 7) — Home on one screen, Code Studio or Trading on another, via Tauri's real monitor API. The vision-level point: this is the same "one continuous presence" thesis from section 0, expressed physically — AXE isn't confined to one window because it isn't confined to one *task*.

---

## 9. What "next session, fully workable" honestly means

This document is deliberately ambitious — that was the ask. But a wishlist isn't a plan, so here's the honest cut: what's realistically one focused session's worth of work, ranked by how much it changes how the app *feels* per hour of build time.

1. **Inline diff review in Monaco** (section 3) — highest felt impact, contained scope, no VPS dependency.
2. **Global error boundary + toast system** (section 6) — makes everything else feel more finished immediately, pure frontend.
3. **Obsidian graph view in Memory** (section 2) — needs the `core_obsidian_notes` bridge built first (already designed, not yet built), then the graph is a direct reuse of the Architecture canvas engine.
4. **Visible pre-execution plan in the Code Agent** (section 3) — a prompt/UI change, no new infra.
5. **Screenshot feedback loop for the Code Agent** (section 3) — now cheap since Playwright is already installed for the Browser Agent.

Everything else in this document (Comet-beating browser features, full system cohesion, CI, code-splitting, multi-window) stays on the board — genuinely worth building, just not all in one sitting. Pick from this list first; it compounds into everything below it.
