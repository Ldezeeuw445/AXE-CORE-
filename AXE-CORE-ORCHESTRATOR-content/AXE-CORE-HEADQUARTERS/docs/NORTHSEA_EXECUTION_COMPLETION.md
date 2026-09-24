# NorthSea Execution Completion — production handoff

Prepared: 2026-09-22. Rebased onto current `orchestrator` (includes #172/#173/#174/#175) on 2026-09-23.

This document is a factual handoff for closing the NorthSea Desk execution loop. It is not a redesign.

**This prep does not enable sending.** `auto_send_qualification`, `auto_reply_nonbinding` and `auto_send_followups` stay false. The governed follow-up executor is not in this change. The backlog is not auto-executed.

## Live production snapshot

Source: AXE Commodities / canonical NorthSea tables plus Resend provider history.

- NorthSea engine is alive and ticking roughly every 15 minutes.
- Engine version observed: `ns-engine-1.1`.
- 65 opportunities; 111 companies; 75 journalled communications.
- Action queue: 45 open + 3 waiting; 33 were overdue at inspection time.
- 43 open/waiting action items did not require approval.
- Deal tasks: 47 open; zero had `auto_execute=true`.
- `northsea_followups` had zero rows.
- Engine research is active and consumes the configured daily blocker-research budget.
- Resend inbound and NorthSea inbound journalling are current through 2026-09-21.
- Resend had real NorthSea outbound mail through 2026-09-19 while `communications` stopped at 2026-09-15: the canonical outbound journal is incomplete.

## Current policy

The canonical operational mailbox is now configured as:

`trade@northseacommodity.com`

The send switches intentionally remain OFF:

- `auto_send_qualification=false`
- `auto_reply_nonbinding=false`
- `auto_send_followups=false`

No commercial mail was sent as part of this preparation.

## Root causes verified in code

### 1. Terse replies can become non-actionable

`resend-inbound` classified only the current message body. Replies such as "documents attached" often stopped repeating "we supply" / "we require", so a known supplier reply became `unknown`. `draftText()` only creates a draft for buyer/supplier messages, so the chain stopped even though the deeper engine later recognized documents/commercial terms.

Prepared fix: on an actual reply/thread, an already-known company role (buyer/supplier) is a fallback classification hint. Explicit message text still wins.

### 2. Human-approval signal was noisy

The webhook wrote `requires_human_approval = !decision.allowed`. With automatic sending disabled, this marked nearly every analyzed inbound — including noise — as requiring a human.

Prepared fix: approval is required only for sensitive content, ambiguous mapping, or an actual safe draft that policy prevents from auto-sending.

### 3. Inbound provenance was incomplete

New inbound communication rows did not populate `from_address` / `transport`.

Prepared fix: persist sender and `resend` transport.

### 4. Outbound provider history and canonical journal diverged

The lifecycle webhook updates only a communication row that already exists. If a send happened through another legitimate NorthSea path and no row was written, lifecycle events cannot reconstruct it.

Prepared fix: a new `resend-reconcile-outbound` admin function:
- service-role only;
- dry-run by default;
- never sends mail;
- scans actual Resend sent-email history;
- imports only canonical NorthSea sender messages;
- uses exact `reply_draft.resend_email_id` as the only automatic deal/company/contact linkage;
- otherwise leaves the historical communication unmapped rather than guessing;
- is idempotent on `external_message_id`;
- records `provider_reconciled` provenance explicitly as historical evidence, not send approval.

## Follow-up gap still to implement

`backend/northsea_mcp/northsea_mcp/engine.py` plans follow-ups and creates pending drafts, but explicitly says:

`auto_send_followups is not used by the engine in P1`

Therefore toggling the policy alone would NOT make the follow-up loop autonomous.

Do not change the engine into an unguarded mail sender.

The completion implementation should provide a governed follow-up executor with:
- policy check for `auto_send_followups`;
- canonical mailbox requirement;
- non-binding content only;
- exact target/contact/deal provenance;
- DNC/synthetic/review/bounced-channel guard;
- no identity disclosure;
- no binding price/payment/commission/SPA/NCNDA/IMFPA/banking changes;
- max follow-up count;
- 48h interval from policy;
- stop immediately after inbound reply;
- stop after bounce/complaint;
- idempotency per follow-up/draft/send;
- canonical communication journalling and lifecycle tracking.

Policy must stay OFF until that path is built and tested.

## Backlog recovery rule

Do not auto-execute the existing backlog blindly.

Before execution, every stale open/waiting item must be re-evaluated against current facts and classified as one of:

1. already resolved / stale → close with reason;
2. reply received → cancel follow-up/chase;
3. channel bounced/DNC/review → block and create channel/review action only;
4. no longer matches current deal blocker → supersede;
5. genuinely actionable internal/read-only work → execute;
6. safe non-binding communication → draft/send only after the governed policy path is proven;
7. approval-gated commercial/legal/identity action → surface to Luka.

## Required production acceptance

The loop is complete only when this is proven:

`inbound → map → classify → evidence/readiness → next-best-action → safe draft/send OR approval → journal → delivery state → follow-up timer → stop on reply/bounce → re-evaluate deal`

Operational health should expose at least:

- last inbound received
- last inbound analyzed
- last actionable draft created
- last outbound sent
- last outbound reconciled
- last delivery event
- oldest unattended actionable inbound
- open / overdue action queue
- due follow-ups
- failed sends / bounced channels
- engine last tick / next tick / last error
- research budget used / cap

## Safety boundary that remains locked

Human approval remains required for:

- counterparty identity disclosure / controlled introduction
- binding price or commercial acceptance
- SPA acceptance/signing
- fee/commission agreement
- NCNDA/IMFPA commitments
- exclusivity
- banking/payment instruction changes
- any material legal/commercial obligation

Non-binding qualification, missing-information requests and ordinary bounded follow-ups are the candidates for policy-governed automation after tests pass.

## Deploy after merge (do not skip dry-run)

Live flags stay false. Do not deploy from this document as an enablement step.

1. Apply the migration (one file, after existing P1 migrations):
   `supabase/northsea/migrations/20260922090000_p2_outbound_reconciliation.sql`
2. Deploy functions with JWT required on the reconciler:
   ```bash
   python3 supabase/northsea/tools/deploy_functions.py resend-inbound resend-reconcile-outbound
   ```
   `VERIFY_JWT` is already true for `resend-reconcile-outbound` and `send-approved-reply`.
3. Dry-run reconcile first (default; no `commit`):
   ```bash
   curl -sS -X POST "$SUPABASE_URL/functions/v1/resend-reconcile-outbound" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   Expect `commit: false` and `reconciled: 0`. Review `rows` for unexpected sender or guessed linkage.
4. Only after that review, an explicit `{ "commit": true }` writes journal rows. It still never sends mail.
5. Later, and not in this prep: build the governed follow-up executor. Keep the three auto-send flags false until that path is tested.
