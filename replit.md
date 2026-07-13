# AXE CORE Headquarters

A private, admin-gated AI operations console (AXE CORE) — chat/voice assistant, agent orchestration, trading/finance, memory, knowledge base, infrastructure, and more — integrated into this workspace as the `axe-core-hq` artifact.

## Run & Operate

- `pnpm --filter @workspace/axe-core-hq run dev` — run AXE CORE Headquarters (via its workflow, preview path `/`)
- `pnpm --filter @workspace/api-server run dev` — run the workspace's own API server (port 5000, unrelated to AXE CORE — AXE CORE talks directly to Supabase and external services)
- `pnpm run typecheck` — full typecheck across all packages
- Required env for AXE CORE: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (already configured as secrets)
- Optional env (feature-gated, app runs fine without them): LiveKit, n8n, GitHub, and various AI provider keys (Groq, OpenRouter, Gemini, xAI, Anthropic, OpenAI, Ollama, etc.) — only needed to light up specific panels (voice, browser automation, CrewAI, etc.)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- AXE CORE Headquarters: React 19 + Vite 7, React Router v7, Tailwind CSS v3 (JS config, not the workspace's v4 default), Radix UI, three.js/@react-three/fiber, Zustand, Supabase JS
- Other workspace packages (API server, DB, mockup sandbox) are the standard scaffold and are not used by AXE CORE, which owns its own auth/data via Supabase

## Where things live

- `artifacts/axe-core-hq/` — AXE CORE Headquarters source, ported from the user's existing standalone app. Kept its original Tailwind v3 setup (`tailwind.config.js`, `postcss.config.js`) intentionally, rather than migrating to the workspace's Tailwind v4 scaffold, to avoid any risk of altering the existing design.
- `artifacts/axe-core-hq/src/components/layout/` — app chrome: `AppShell`, `TopNav`, `Sidebar`, `RightPanel`, `BottomBar`, `BottomNav`
- `artifacts/axe-core-hq/src/hooks/use-mobile.ts` (`<768px`) and `use-tablet.ts` (`768–1024px`) — breakpoint hooks used to switch between fixed asides (desktop) and overlay drawers (phone/tablet)

## Architecture decisions

- AXE CORE is a pre-existing production app, ported in as-is rather than rebuilt — dependency versions and app structure follow the original app, not the workspace's default template conventions.
- Access is admin-gated: only the hardcoded email in `src/App.tsx` (`ADMIN_EMAILS`) can use the app after Supabase login.
- Mobile/tablet layout: `Sidebar` and `RightPanel` now treat both `isMobile` and `isTablet` (i.e. anything under 1024px) as "compact" and render as overlay `Sheet` drawers instead of fixed-width columns. Previously only phone widths got this treatment, so iPad-width viewports (768–1024px) rendered both a 240px sidebar and a 280–320px right panel as permanent columns, squeezing main content into a sliver. True desktop (>1024px) is unchanged.
- Viewport `<meta>` no longer disables pinch-zoom (`user-scalable=no` / `maximum-scale=1.0` removed) so mobile/tablet users can zoom; capped at `maximum-scale=5.0`.

## Product

AXE CORE Headquarters — a single-operator "AI operating system": chat/voice assistant, agent and task orchestration, calendar, memory/knowledge base, trading & finance dashboards, infrastructure/MCP/cron management, a code editor, and a 3D org/architecture visualizer. Single admin user via Supabase auth.

## User preferences

- Keep the desktop layout/behavior unchanged when fixing mobile/tablet issues — prefer additive breakpoint logic over restructuring shared components.

## Gotchas

- AXE CORE's `vite.config.ts` proxies several `/proxy/*` paths to external self-hosted services (VPS IPs, n8n, CrewAI, etc.) — these are unreachable from this environment by design and only affect specific feature panels, not core app rendering.
- The headless screenshot tool has no GPU/WebGL — pages that mount the `HolographicSphere` three.js component (e.g. Home) will show an "AXE Encountered an Error / WebGL context" screen when screenshotted here. This is a screenshot-sandbox limitation, not an app bug; real browsers render it fine.
- A few pre-existing TypeScript errors exist in the ported source (`AgentChatHub.tsx`, `Memory.tsx`, `chatPersistence.ts`) — present in the original app, unrelated to the responsive-layout work, and don't block `vite dev`/runtime.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
