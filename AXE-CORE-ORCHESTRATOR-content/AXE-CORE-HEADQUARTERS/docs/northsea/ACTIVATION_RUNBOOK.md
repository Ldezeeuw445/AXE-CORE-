# AXE × NorthSea — activation runbook

**Part 1 below is HISTORICAL and CLOSED.** `integration/axe-agent-force-northsea`
was promoted to `orchestrator` (step 6 done); steps 1–5's gates were met at
promotion time. Everything built since — event coverage, communication
templates, CrewRunResult provenance, unified observability, the legal-document
draft layer, and the governed real research-execution path — happened directly
on `orchestrator`. **Part 2 (bottom of this file) is the current, open runbook.**
Part 1 is kept for its still-relevant detail (Studio AMP project IDs, the
EXA_API_KEY gap, the Global Trade Center check) rather than deleted.

---

# Part 1 — pre-promotion (historical)

**Branch:** `integration/axe-agent-force-northsea` @ `daf226f5` (31 ahead of
`orchestrator` @ `bb5f484a`, 0 behind). Pushed. **Merged 2026-09 (see Part 2 for
what shipped afterward).**

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

---

# Part 2 — V1 governed automation (current, open)

Everything below landed directly on `orchestrator` (no separate integration
branch this time), one tested slice per commit. Confirmed via `deploy/deploy.sh
check` (2026-09-19): the live `northsea-mcp` service (port 8040 on the API box,
`212.227.91.79`) still runs the code from before this build. **Nothing in this
section is live yet.**

## 0. What changed (12 files)

`audit.py, crew.py, engine.py, engine_rules.py, models.py, policy.py,
readlayer.py, readtools.py, repository.py, server.py, service.py, store.py` —
in `backend/northsea_mcp/northsea_mcp/`. Feature summary:

1. **Event coverage**: deadline detection (`deadline_chase_items`), approval
   granted/rejected events, evidence-contradiction detection
   (`contradicted_fields`, raises a `review_contradiction` Chase item),
   requirement/offer-changed-since-last-look visibility
   (`changed_since_last_evaluation`).
2. **Retries/watchdog**: `EngineService._resilient()` (bounded retry+backoff on
   genuinely transient repository errors only), `Store.sweep_stuck()` (deletes
   idempotency rows stuck in `running` past a threshold, called from
   `/internal/engine/tick` before every tick).
3. **10 communication templates** on `northsea_prepare_outreach` (5 pre-existing
   + `decline_not_executable`, `deal_alignment`, `controlled_introduction`,
   `tender_specific_request`, `delivery_failure`, `bounce_handling`).
4. **CrewRunResult provenance**: `requested_specialists`, `actual_specialists`,
   `entities_examined`, `retries`, `audit_references` on every `CrewGateway.run()`
   return path.
5. **Unified observability**: `northsea_get_system_health` now reports
   `scheduler` (next/last run from `core_schedules`, via a read-only
   `Auditor.get_schedule()` reusing the existing AXE-project credential),
   `crewai.routes`/`crewai.fallback` (from `CrewGateway.status()`), and
   `research.governed_research_gate` (policy budget config, pending-approval and
   approved-not-yet-executed counts) with an explicit `cost_usd_tracked_here:
   false` note.
6. **Legal/commercial UNREVIEWED DRAFT layer**: new tool
   `northsea_prepare_legal_document` (NCNDA, IMFPA, SPA fee clause, introduction
   authorization, mandate/authority confirmation, KYC/KYB request, tender
   checklist). Requires `northsea.identity`. Always
   `status=unreviewed_draft`, `approval_required=true`, `sent=false`; persisted
   into `deal_documents` (existing table, `metadata.template_version`).
7. **Governed research gate — now with real execution**: the
   `approved_ready_to_execute` branch calls the existing `self.research.ask()`
   exactly once per deal+blocker, gated by a configured daily budget
   (`deal_automation_policy.auto_investigate_blockers_max_calls_per_day`,
   missing/zero = no spend), bounded retries (`MAX_RESEARCH_ATTEMPTS = 3`), and
   only marks the intent consumed on a genuine success or a permanently
   exhausted failure. On success: `provider`, `cost_usd`, `sources` persisted on
   the action_queue row AND as a new `deal_evidence` row (still `unverified` —
   a human verifies it).
8. A new, additive, **unapplied** migration:
   `supabase/northsea/migrations/20260919120000_p1_c_research_gate.sql` adds
   `deal_automation_policy.auto_investigate_blockers` (bool, default false) and
   `.auto_investigate_blockers_max_calls_per_day` (int, default 0). Until this
   is applied, the governed research gate can still raise Chase approvals and a
   human can resolve them, but the daily-budget check always reads 0 → **no
   real research call fires**, by design ("a missing configured budget is not
   permission to spend").

## 1. Pre-flight

- [ ] `git -C ~/AXE-CORE- fetch origin && git log --oneline -3 origin/orchestrator`
      and confirm the three commits for items 3–6 above are present (CrewRunResult
      completion, unified observability, legal-document layer, real research
      execution).
- [ ] Fresh green, offline:
      - MCP: `backend/northsea_mcp/.venv/bin/python -m pytest -q` (321 tests)
      - axe_api: `backend/axe_api/.venv-local/bin/python -m pytest -q` (136 tests)
      - frontend: `npx vitest run` (1399 tests, 167 files)
      - frontend build: `npm run build`
- [ ] `bash backend/northsea_mcp/deploy/deploy.sh check` — confirm the file list
      still matches what you expect to ship (no surprise local changes).

**Gate:** all four green/clean, `check` shows only the expected files.

## 2. Apply the research-gate migration (optional but recommended before relying on policy-driven research)

- [ ] Review `supabase/northsea/migrations/20260919120000_p1_c_research_gate.sql`
      (additive, backward-compatible: missing columns already read as falsy).
- [ ] Apply it to the NorthSea Supabase project (not the AXE Companion project —
      different project, see memory `axe-mcp-hub`).
- [ ] Decide `auto_investigate_blockers` (off by default) and
      `auto_investigate_blockers_max_calls_per_day` (0 = no spend even if the
      flag above is on) deliberately. **This is a real spending-authorization
      decision, not a technical step** — leave both at their safe defaults
      (false / 0) if you are not ready to authorize automatic paid research.

**Gate:** either explicitly skipped (safe defaults stay in effect: gate still
raises Chase approvals, never spends), or applied with values you chose on
purpose.

## 3. Deploy

- [ ] `bash backend/northsea_mcp/deploy/deploy.sh deploy` — backs up the current
      `/opt/northsea-mcp/app/northsea_mcp`, syncs the new code, restarts
      `northsea-mcp.service`, polls `/health`, and **automatically rolls back**
      if health doesn't come back within 30s.
- [ ] `curl -s https://mcp.northseacommodity.com/health` → confirm it responds
      (version string is unchanged at 1.4.0 for this build — no version bump was
      made; the deploy is verified by content, not by version number).

**Gate:** deploy script reports `uitgerold (backup ...)`, not a rollback.

## 4. Runtime verification (one check per feature above)

- [ ] **Observability**: `northsea_get_system_health` → response now has a
      `scheduler` key (not absent), `crewai.routes`, and
      `research.governed_research_gate`.
- [ ] **CrewRunResult**: any `northsea_qualify_opportunity` or
      `northsea_investigate_blockers` call → `crew.requested_specialists`,
      `crew.retries`, `crew.audit_references` are present and non-default.
- [ ] **Legal documents**: `northsea_prepare_legal_document` (with
      `northsea.identity`) on any real deal with a named buyer and/or seller →
      response `status = "unreviewed_draft"`, `disclaimer` contains "HUMAN/LEGAL
      REVIEW REQUIRED", `saved_document_id` is set, and
      `northsea_get_document_metadata` on that id shows it.
- [ ] **Event coverage**: after the next scheduled `/internal/engine/tick`,
      `northsea_get_deal_events` on any deal with an overdue `deal_tasks` row
      shows a deadline-chase event; a deal with a resolved pending draft shows
      `approval_granted`/`approval_rejected`.
- [ ] **Governed research gate**: do **not** manufacture a test run against a
      real deal just to see it fire (that spends real money if a budget is
      configured). Instead confirm passively: `northsea_get_system_health`'s
      `governed_research_gate.pending_approval` /
      `.approved_not_yet_executed` counts move over the following days as real
      deals hit researchable blockers, and any `action_queue` row with
      `action_type = research_approval` and `metadata.execution_result =
      "completed"` carries `provider`, `cost_usd`, and `sources` — proof it was
      a real call, not the old `not_wired` stub.
- [ ] Re-run the `#4cbc2a` regression from Part 2 §0's history:
      `northsea_get_deal 4cbc2ade` → `communications: []` still (TradeWheel
      marketing mail stays detached), gates/blockers still derive only from the
      real buyer RFQ and supplier offer.

**Gate:** every checkbox above observed on the live system, not inferred from
tests.

## 5. Rollback (if anything above fails)

- [ ] `bash backend/northsea_mcp/deploy/deploy.sh rollback` — restores the most
      recent timestamped backup and restarts the service.

---

## Open NorthSea wiring surfaced by integration (not a blocker)

`src/domain/northsea/koppeling.ts` exports `normalizeMessageId` (Message-ID
normalization for threading) and `berichtTermen` (qty/incoterm/dest extraction
for match scoring) — unit-tested but with **no caller**, not even internally in
`beoordeelKoppeling`. They were left unwired on purpose (forcing a call would
silently change matching) and whitelisted in `dodeCode.test.ts`. Decide later
whether the linker should consume them; if so, do it as its own reviewed change
with matching-behavior tests.
