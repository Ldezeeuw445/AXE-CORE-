# NorthSea P0/P1 — Production Baseline Record

_Frozen 2026-09-16. This is the contract P2 must integrate with. P0 + P1 are the production
baseline; P1 feature development is closed. Cursor owns P2._

## Production commits (`orchestrator`, repo `Ldezeeuw445/AXE-CORE-`)

| Commit | What |
|--------|------|
| `27bc601e` | NorthSea P0 — security & execution-safety guards |
| `386b3400` | NorthSea MCP 1.2.0 — P0 deployed and verified in production |
| `dce901bc` | NorthSea — outbound send-path from the desk |
| `eb595d44` | NorthSea P1 — deterministic Communication Engine, follow-ups, GTC view |
| `130f88cb` | NorthSea P1b — production findings (bounce-in-metadata, provenance requirement, real-party deal facts) |
| `93aed2ee` | northsea-mcp deploy — refuse an older version over a newer one |
| `d2846fc3` | NorthSea P1c — housekeeping close-out of the four items (this session) |

## Deployed MCP version

- **1.3.0** — live at `https://mcp.northseacommodity.com` (`/health` → `{"status":"ok","version":"1.3.0"}`).
- Runs as systemd unit `northsea-mcp` on `212.227.91.79` (uvicorn `127.0.0.1:8040`).
- Deploy tool refuses a lower version over a higher one (`NS_DEPLOY_DOWNGRADE=1` to force).

## Database migrations (project AXE Commodities `kbimnuepbecbyezedvih`, all applied)

`supabase/northsea/migrations/`:

| File | Applied version | Purpose |
|------|-----------------|---------|
| `…_p0_a_columns.sql` | 20260916153523 | policy/provenance/synthetic columns |
| `…_p0_b1_functions.sql` | 20260916153524 | guard functions |
| `…_p0_b2_triggers.sql` | 20260916153734 | reply_drafts / communications / work-item guards |
| `…_p0_c_data.sql` | 20260916153804 | initial policy data (DNC, etc.) |
| `…_p1_a_engine.sql` | 20260916195838 | engine tables + communications provenance guard |
| `…_p1_b_bounce_metadata.sql` | 20260916200906 | bounce-in-`provider_metadata` block + Thai Rice review_required |
| `…_p1_c_housekeeping.sql` | 2026-09-16 (this session) | close-out items 3 & 4 (idempotent data) |

Deploy migrations one at a time (same-second timestamps collide on `schema_migrations_pkey`).

## Edge-function versions (AXE Commodities, all ACTIVE)

| Function | Version | verify_jwt |
|----------|---------|------------|
| `commodity-intake` | 8 | false |
| `resend-inbound` | 14 | false |
| `send-approved-reply` | 10 | **true** |
| `northsea-desk` | 6 | false |
| `northsea-command-center` | 5 | false |
| `resend-lifecycle` | 6 | false |
| `kaicalls-webhook` | 4 | false (unused — returns 410; telephony is STRATO via email) |

Source of truth: `supabase/northsea/functions/` (+ `_shared/`). Deploy with
`supabase/northsea/tools/deploy_functions.py <slug>`.

## Scheduler (single planner — `core_schedules`, project AXE Companion `pqnngpcgbdwxavbatbia`)

| Job | ID | Executor | Cadence (Europe/Amsterdam) | Runtime cap |
|-----|----|----------|---------------------------|-------------|
| `northsea:engine` | `bed445cb-4a67-4111-8e0b-f83bdd634898` | vps | `*/15 * * * *` | 300 s |
| `axe_core:planner` | `31bbfaef-f325-4cba-87e3-b99786b5cb2a` | mac | `10 */3 * * *` | 1800 s |

`northsea:engine` last status **ok**. The VPS API posts to `127.0.0.1:8040/internal/engine/tick`
with `NORTHSEA_ENGINE_TOKEN` (scope `northsea.engine`, expires 2027-09-16). `/internal/` is 404 in nginx.

## Engine version

- **`ns-engine-1.1`** (`backend/northsea_mcp/northsea_mcp/engine_rules.py`).
- Deterministic classifier + follow-up planner. Newsletters/marketing = `spam_noise` (not rejection).
- Deal facts count only from communications with `mapping_status = 'mapped'`.
- Bumping the engine version re-evaluates every message and cancels stale engine chase items.

## Current safety settings (`deal_automation_policy`, row id=1)

All autonomous flags **OFF**:

- `auto_send_followups = false`
- `auto_send_qualification = false`
- `auto_reply_nonbinding = false`
- `auto_accept_pricing = false`
- `auto_change_banking = false`
- `auto_sign_documents = false`
- `auto_disclose_counterparty_identity = false`
- `operational_mailbox = NULL` (so even the policy-allowed send path is inert)
- `max_auto_followups = 3`, `followup_interval_hours = 48`

## Current auto-send state

- **Autonomous outbound is OFF.** The engine never sends (`sent: 0`); follow-ups become pending drafts.
- Outbound requires a human-approved draft (`approval_actor_type = human` + `approved_by`) **or**
  a policy-allowed path that `deal_automation_policy` does not currently enable.
- Every outbound email must carry canonical provenance (`_shared/canonical.ts`), enforced by
  `northsea_communications_guard` (`NS_OUTBOUND_PROVENANCE`).

## Housekeeping close-out (2026-09-16)

1. **Sep 10–11 unknown-provenance outreach** — 16 outbound messages, all lacking canonical
   provenance. Kept excluded from automated follow-up; **not** marked trusted, provenance **not**
   invented. Guard keeps historical unknowns immutable. No change.
2. **Siki Rice mailbox-full bounce** — `info@sikirice.com` is `bounced`;
   `northsea_outbound_block_reason` returns `bounced_channel`. Stays blocked; **no auto-retry**.
   Lifted only by a contact with that exact address re-verified `valid` **after** the bounce. No change.
3. **Old Thai Rice suppression task** (`action_queue 06cf5c19`) — marked `completed`; row and audit
   preserved. Superseded by P1b DB-level enforcement. Company `dbe1c54c` stays `review_required`.
4. **TradeWheel / Ahad Bagheri** — the three inbound emails are TradeWheel **platform** mail to
   NorthSea's own account (onboarding/marketing from `noreply@tradewheel.com`), not buyer messages.
   The marketing comm (`b219840b`) was detached from deal `4cbc2ade` and the auto-reply draft
   (`1bf81e6f`) — which was the deal's only pending-approval blocker — was `rejected`. The buyer RFQ
   (`0b65c567`, genuine public TradeWheel Copper Cathode RFQ) and the opportunity are unchanged.
   Audit event `p1_housekeeping_mapping_correction` recorded.

## Invariants P2/P3 must preserve

1. **One scheduler** (`core_schedules`). No second scheduler / cron loop / engine tick source.
2. **One outbound mail path** — canonical provenance via `_shared/canonical.ts`, gated by
   `northsea_communications_guard`. No new send path.
3. **Approval integrity** — a draft is `approved`/`sent` only with `approval_actor_type = human`
   + `approved_by`; automated sends only via `deal_automation_policy` (currently disabled). No bypass.
4. **Contact policy is DB-enforced** — `do_not_contact` / `review_required` / bounced-channel /
   synthetic blocks come from `northsea_outbound_block_reason`, not from notes.
5. **Deal facts only from real parties** — a message counts for a deal only when its company is the
   buyer/supplier and `mapping_status = 'mapped'`. **Marketing/newsletter/platform mail must never
   influence deal qualification, readiness, blockers or progress.**
6. **Provenance is immutable** — historical unknowns stay unknown; no retroactive trust.
7. **No MCP downgrade** — never deploy an MCP/engine version older than production.
8. **No autonomous binding commercial action** — pricing acceptance, banking changes, document
   signing, counterparty-identity disclosure all stay off.

## P2 acceptance gate (regression/security review — to run after Cursor's P2 lands)

P2 must **not** introduce any of:

- a second scheduler
- a second outbound mail path
- direct CrewAI state mutation around canonical NorthSea services
- approval bypasses
- P0/P1 regressions
- an older MCP deployment over the production version
- autonomous binding commercial actions

Autonomous outbound stays disabled. CrewAI integration is P2 (Cursor's), not built here.
