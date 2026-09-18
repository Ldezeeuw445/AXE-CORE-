# AXE × NorthSea — activation runbook (pre-promotion)

**Branch:** `integration/axe-agent-force-northsea` @ `daf226f5` (31 ahead of
`orchestrator` @ `bb5f484a`, 0 behind). Pushed. **Not merged. Not deployed.**

This is the ordered checklist to take the integrated branch from "verified in a
build" to "live and promoted". Every step is Luka's to run and authorize; the
integration pass deliberately stopped short of all of them. Nothing here sends
mail, accepts terms, or processes the commercial backlog — that is a later phase
(see step 7). Do the steps **in order**; each has a gate that must pass before
the next.

Verified state at hand-off (18 Sep 2026):
- Tests green: frontend 1394, NorthSea MCP 267, axe_api 127. Typecheck: only the
  5 known pre-existing errors. Vite + Tauri builds: ✓ (`AXE CORE.app` + dmg).
- Live NorthSea MCP endpoint serves **1.3.0**; integrated code is **1.4.0**
  (`backend/northsea_mcp/northsea_mcp/__init__.py`). This is the main gap.
- Crews execute via the **local golden runtime** (primary). Studio AMP optional
  and not configured. `EXA_API_KEY` not set → live Exa search skipped.

---

## 0. Pre-flight (no side effects)

- [ ] Confirm you are on the Mac mini, canonical checkout
      `/Users/luka/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS`.
- [ ] `git fetch && git switch integration/axe-agent-force-northsea` and confirm
      `git rev-parse HEAD` = `daf226f5…`.
- [ ] Re-run the three suites if you want a fresh green (all offline):
      - frontend: `npx vitest run`
      - MCP: `backend/northsea_mcp/.venv/bin/python -m pytest -q` (from `backend/northsea_mcp`)
      - axe_api: `backend/axe_api/.venv-local/bin/python -m pytest -q` (from `backend/axe_api`)

**Gate:** all green, `HEAD = daf226f5`.

---

## 1. Deploy NorthSea MCP 1.4.0 (the core gap)

The live endpoint (`https://mcp.northseacommodity.com`, STRATO frontdesk in front
of the NorthSea MCP service on the API box) still serves **1.3.0**. The P2
CrewGateway (`northsea_mcp/crews/`, `orchestration.py`) and the tightened
`northsea_handle_event` scope rule live only in 1.4.0.

- [ ] Deploy the NorthSea MCP service from this branch using the **established
      NorthSea MCP deploy procedure** (its own service/unit on the API box — do
      **not** use the general `deploy.sh`, which is flagged dangerous). Follow
      memory `northsea-mcp` for the box, unit, and umask/allowlist specifics.
- [ ] Verify **after** deploy:
      - `curl -s https://mcp.northseacommodity.com/health` → `version: 1.4.0`
      - `curl -s https://mcp.northseacommodity.com/ready` → `ready: true`
- [ ] Verify the scope contract is live (needs a real research+deal.read token —
      keep it out of shell history / logs): `northsea_handle_event` must be
      **rejected** for a read-only token and **accepted** for
      `northsea.research` + `northsea.deal.read`. (Proven in code at
      `northsea_mcp/policy.py`; this re-proves it on the live 1.4.0 box.)

**Gate:** live `/health` = 1.4.0, `/ready` = true, read-only token denied on
`northsea_handle_event`.

---

## 2. Configure `EXA_API_KEY` (Counterparty Sourcing live search)

Without it, `discovery_run` (Counterparty Intelligence & Sourcing) runs but skips
live Exa search — it said so itself during acceptance.

- [ ] Place `EXA_API_KEY` in the **NorthSea MCP service's secure environment only**
      (the same place its other secrets live). **Never** in git, `.env` committed
      to the repo, the frontend bundle, or a URL.
- [ ] Restart the MCP service so it picks up the env.
- [ ] Re-run a single `research_counterparty` and confirm the analysis no longer
      says "EXA_API_KEY not configured".

**Gate:** sourcing run shows live Exa search used (or a real Exa error — not
"not configured").

---

## 3. (Optional) Studio AMP dedicated deployments

The local golden runtime is the **primary** backend and is always available;
Studio AMP is optional and currently unconfigured. Only do this if you want the
Studio path live behind the gateway. The four Studio projects (verified IDs):

| Studio project | crew_id | studio_id | runtime route(s) |
|---|---|---|---|
| NorthSea Deal Execution Crew 2 | `deal_execution` | `8c722284-b968-40d4-830f-aac179c21cfa` | `deal_run` |
| NorthSea Intelligence & Operations | `intelligence_operations` | `55f038dc-8816-4641-9fb5-a58022ec2fab` | `intelligence_run`, `operations_run` |
| NorthSea Counterparty Intelligence & Sourcing | `counterparty_sourcing` | `9679d3e8-7e66-4017-9970-b67b447cc679` | `discovery_run` |
| North Sea Master Orchestration | *(flow, not a crew)* | `d3617f1c-aa50-4de9-a32f-ea68a51170e3` | `orchestration.py` router |

- [ ] For each route you want live, deploy the Studio crew on CrewAI AMP and set
      its `StudioRoute` (kickoff URL + token) in the MCP env. The gateway
      health-checks each route and only uses it if healthy; otherwise it stays on
      the local primary. Provenance will show `backend: northsea_crewai` when the
      Studio path actually runs.
- [ ] Do **not** rebuild the four Studio projects — they already exist and must
      not be replaced or duplicated. `North Sea Master Orchestration` stays a
      bounded router; it must not schedule global work, own durable tasks, grant
      approvals, or send mail.

**Gate (only if attempted):** `CrewGateway.status()` shows
`dedicated_configured: true` for the routes you deployed, and a live run reports
`backend: northsea_crewai`, `fallback_used: false`.

---

## 4. Start / confirm the Mac-mini runtime (no second brain)

- [ ] `axe_api` on `:8001` healthy (it is now: `.venv-local` uvicorn, `supabase:true`).
      Use the existing intended start method — **never** start a second `axe_api`
      on the iMac (memory `axe-imac`, and INTEGRATION-HOLD.md).
- [ ] Caddy/Tailscale `:8443` healthy.
- [ ] Confirm the frontend never receives server secrets (spot-check the built
      bundle / network tab).

**Gate:** `:8001` healthy, `:8443` healthy, no secrets client-side.

---

## 5. Live snapshot + Global Trade Center UI check

The current NorthSea snapshot could not be fetched during integration (NorthSea
data lives in its own Supabase project, not the AXE bridge). Compare against the
preserved reference:

- Reference snapshot: **17 Sep 2026, 21:27 CEST** (figures below). NOTE: the raw
  snapshot dir `.local/northsea-snapshot-2026-09-17/` that INTEGRATION-HOLD.md
  points to is **not present in this checkout** (it was on a different machine or
  never committed) — verified absent 18 Sep. Use the recorded figures here as the
  reference instead: 55 open deals, 24 active, 70 communications, 101 companies,
  62 messages/7d, documents 0, won/lost 0, commission unsigned; 23 linked / 6
  HIGH-confidence unwritten / 3 ambiguous / 38 unlinked; backlog: Harcros
  DEAL-002, Rung, Pitsonel, 5 overdue, Siki/Thai bounces, Atlantic Copper policy,
  3 junk drafts. If you still have the raw snapshot elsewhere, prefer it.
- [ ] Fetch a fresh authenticated NorthSea overview (via the app logged in, or an
      authenticated `GET /northsea/*`), and record the deltas vs the reference.
- [ ] Launch the built app and eyeball Global Trade Center: overview metrics,
      Active Deals, Deal Room (CURRENT BLOCKER / NEXT BEST ACTION / readiness /
      G1–G9), Chase, approvals, communications + delivery/bounce, counterparties,
      evidence, documents, automation (CrewAI runs read from
      `northsea_audit_events action=crew_run`), reports, map. Unknown stays
      **UNKNOWN** — no manufactured commission/closed deals/documents/origins.
- [ ] Confirm communication-association UI and quoted-email display still work.

**Gate:** overview loads real data; deltas recorded; no manufactured figures.

---

## 6. Promote to orchestrator (only after your review of the integration report)

- [ ] With steps 1–5 green, merge `integration/axe-agent-force-northsea` →
      `orchestrator` (no auto-merge; your explicit action). Keep both source
      feature branches.
- [ ] Rebuild + install the app from `orchestrator` if you promote the desktop
      build too (backup the current `/Applications/AXE CORE.app` to
      `AXE-BACKUPS/` first; launch only via the `env -i …` method — memory
      `axe-app-env-vervuiling`).

---

## 7. Later phase — process the commercial backlog (separate authorization)

Only after the integrated runtime is accepted, process the preserved backlog
**through the live crews and the governed send path**, one item at a time, each
with your explicit approval. Nothing autonomous: no send, accept, sign,
commission, or identity disclosure without you in the loop.

---

## Open NorthSea wiring surfaced by integration (not a blocker)

`src/domain/northsea/koppeling.ts` exports `normalizeMessageId` (Message-ID
normalization for threading) and `berichtTermen` (qty/incoterm/dest extraction
for match scoring) — unit-tested but with **no caller**, not even internally in
`beoordeelKoppeling`. They were left unwired on purpose (forcing a call would
silently change matching) and whitelisted in `dodeCode.test.ts`. Decide later
whether the linker should consume them; if so, do it as its own reviewed change
with matching-behavior tests.
