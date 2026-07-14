---
name: AXE CORE's external GitHub repo layout
description: How the Ldezeeuw445/AXE-CORE- GitHub repo relates to this Replit project, and how to sync safely.
---

The user's GitHub repo `Ldezeeuw445/AXE-CORE-` is NOT a mirror of this Replit workspace. It's a much larger export (originally from an "Emergent"-style builder) containing an unrelated top-level structure: a Python backend (`pyproject.toml`, `backend/`), a separate `frontend/` React app, Drizzle DB layer (`lib/db`), LangChain/CrewAI pieces, test scaffolding, etc. Both its `main` and `orchestrator` branches share this same unrelated top-level layout.

The actual counterpart to this Replit app (axe-core-hq) lives nested deep inside that repo, on the `orchestrator` branch, at:
`AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/` (with `src/`, `public/`, `package.json`, etc. matching this app's structure almost 1:1 — component names like `AppShell.tsx`, `TopNav.tsx`, `AgentChatHub.tsx` match).

The app's own `githubCodeService.ts` (used by CodeEditor/CommandCenter's "Commit to GitHub" flow) already encodes this exact path as `srcPrefix` for the `axe-core` repo config (owner `Ldezeeuw445`, repo `AXE-CORE-`, branch `orchestrator`), and falls back to the `VITE_GITHUB_TOKEN` secret when a repo has no per-repo token set in Settings. The same file also has configs for AXE Companion (`Ldezeeuw445/AXE-COMPANION-OS-`, branch `main`) and Trading OS (`TRADING-AXE-OS-APPS/TRADING-OS`, branch `main`).

**How to sync safely:** never `git checkout`/merge/force-push the whole Replit repo onto that GitHub repo — it would destroy the unrelated Python/frontend/lib content that lives alongside the nested folder. Instead, push only the scoped subtree using the GitHub Git Data API (create blobs for the frontend's files, build a tree with `base_tree` = current branch tip's tree, entries pathed under the `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/` prefix, then one commit + ref update). This produces a single clean commit and leaves everything else in the repo untouched. A working sync script pattern: recursively collect `src/`, `public/`, and root config files, skip `node_modules`/`dist`/`.replit-artifact`/`*.tsbuildinfo`, base64-encode binary extensions, batch blob creation with limited concurrency.
