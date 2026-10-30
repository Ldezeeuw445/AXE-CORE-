# AXE CORE

Luka's personal Jarvis-style AI system. This repo contains **two products** — don't confuse them:

## 1. The assistant (the real AXE) — `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/`

React 19 + Vite + TypeScript command center. **Production:** Cloudflare Pages at **www.axeheadquarters.com** (deploy branch: `orchestrator`) + Tauri desktop + FastAPI on the Strato VPS.

- **Chat brain**: `src/presentation/store/voiceStore.ts` + catalog-driven tool registry.
- **Managers**: six Grok Bot managers + AXE (primary UI). Tier workers remain as motors behind them.
- **Change loop**: branch → commit → PR → Luka-approved merge on `orchestrator`. VPS pulls that branch every 5 minutes.
- **Privileged backend**: `backend/axe_api/main.py` — FastAPI on the Strato VPS behind `api.axecompanion.com`. Deploy with `backend/axe_api/deploy.sh` (fresh box: `infra/vps-bootstrap.sh`).
- **Never Vercel** — Cloudflare Pages + Tauri + VPS only.

## 2. The OSINT Intelligence Terminal prototype — root `backend/` + `frontend/`

A separate Emergent-generated app kept for reference. Adapters live in `axe_api/osint/`.

Also here: `axe_core___god_mode_ai_system_v1_crewai-project/` — CrewAI specialist definitions executed on the VPS via `axe_api /crew/run`.

`ARCHITECTURE.md` (root and in HQ) has the detailed component map.
