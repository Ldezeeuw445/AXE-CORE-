---
name: Porting an existing standalone app into a workspace artifact
description: How to bring in a user's pre-existing production app (with its own build tooling) as an artifact without silently changing its behavior/design.
---

When a user uploads/asks to integrate an existing standalone app (not a from-scratch build), prefer preserving its own tooling choices over conforming to this workspace's default scaffold, wherever the two conflict — especially anything CSS/design-system related.

**Why:** The workspace's react-vite scaffold defaults to Tailwind v4 (CSS-first `@theme`, no `tailwind.config.js`). An uploaded app may use Tailwind v3 (JS config + `postcss.config.js` + `@tailwind base/components/utilities` directives). These are not drop-in compatible. Migrating an existing app's styling system to match the scaffold risks visibly changing a design the user explicitly wants unchanged, for zero functional benefit.

**How to apply:** Keep the uploaded app's own `tailwind.config.js`/`postcss.config.js`/CSS files verbatim; only adapt the *infra* layer (`vite.config.ts` PORT/BASE_PATH/allowedHosts wiring required by the artifact workflow, `tsconfig.json` extending the workspace base) to fit the new environment. Reconcile `package.json` dependency versions only enough to install cleanly (e.g. add missing peer deps like `monaco-editor` for `@monaco-editor/react`, or `@langchain/core`/`@langchain/langgraph` if imported but absent) — don't downgrade/upgrade the app's own major framework versions (e.g. React 19) to match workspace catalog defaults.
