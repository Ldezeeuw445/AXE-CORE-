# AXE CORE

Luka's personal Jarvis-style AI system. This repo contains **two products** — don't confuse them:

## 1. The assistant (the real AXE) — `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/`
React 19 + Vite + TypeScript command center, deployed on Vercel at **www.axeheadquarters.com** (production branch: `orchestrator`).

- **Chat brain**: `src/presentation/store/voiceStore.ts` + a catalog-driven tool registry (`src/domain/tools/toolCatalog.ts`, `src/application/tools/toolRegistry.ts`). Every tool AXE claims in its system prompt is derived from that same catalog — prompt and reality cannot drift.
- **Specialists**: 9 personas in `src/domain/catalogs/specialists.ts` (mirrors the CrewAI project's `agents.yaml`) shape every reply by capability; CrewAI itself runs only as an explicit background job.
- **Change loop**: AXE edits code (its own repo included) via branch → commit → PR → Vercel preview → Luka-approved merge. Direct commits to `orchestrator` of this repo are blocked in the tool layer.
- **Privileged backend**: `backend/axe_api/main.py` — FastAPI on the Strato VPS (212.227.91.79) behind `api.axecompanion.com`: Supabase service-role, GitHub, Vercel, n8n, audited shell exec, CrewAI runner, OSINT adapters, terminal WebSocket. Deploy with `backend/axe_api/deploy.sh` (fresh box: `infra/vps-bootstrap.sh`).
- **Real UIs**: xterm terminal, Monaco editor, in-app browser, Google photorealistic 3D maps with live OSINT layers (`/osint/*`).

All browser→backend traffic goes through the same-origin Vercel function `api/proxy/axecore.ts` (plain function + rewrite — NOT a `[...path]` catch-all; Vercel's generic runtime matches those against a single path segment only, which once 404'd every integration at the same time).

## 2. The OSINT Intelligence Terminal prototype — root `backend/` + `frontend/`
A separate Emergent-generated app (FastAPI + MongoDB + CRA/Leaflet). Its data adapters were ported into `axe_api/osint/`; the rest is kept for reference. Root `plan.md`, `test_result.md`, and `backend_test.py` describe THIS prototype, not the assistant.

Also here: `axe_core___god_mode_ai_system_v1_crewai-project/` — the CrewAI specialist definitions executed on the VPS via `axe_api /crew/run`.

`ARCHITECTURE.md` (root and in HQ) has the detailed component map.
